import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  GenerateAiSuggestionsDto,
  AiSuggestionsResponseDto,
  AiSuggestionsProgressDto,
} from '../../dto/intelligence/generate-ai-suggestions.dto';
import { TaskDocument } from '../../schemas/task.schema';
import { GeminiService } from '../../../ai/services/core/gemini.service';
import { SuggestionState } from '../../interfaces';
import {
  calculateSuggestionsHours,
  buildSuggestionsProgress,
  buildSuggestionsResponse,
  createInitialState,
  calculateExistingTasksHoursAndNames,
} from './utils/ai-suggestions.utils';
import { TasksAiSuggestionsLoopRunner } from './ai-suggestions-runner.service';

@Injectable()
export class TasksAiSuggestionsService {
  private readonly logger = new Logger(TasksAiSuggestionsService.name);

  constructor(
    @InjectModel('Task') private readonly taskModel: Model<TaskDocument>,
    private readonly geminiService: GeminiService,
    private readonly loopRunner: TasksAiSuggestionsLoopRunner,
  ) {}

  // ===========================================================================
  // 1. AI Task Generation & Progress Streaming
  // ===========================================================================

  async generateAiSuggestionsWithProgress(params: {
    dto: GenerateAiSuggestionsDto;
    onProgress: (progress: AiSuggestionsProgressDto) => void;
    onComplete: (result: AiSuggestionsResponseDto) => void;
    onError: (error: Error) => void;
  }): Promise<void> {
    const { dto, onProgress, onComplete, onError } = params;
    try {
      const result = await this.generateAiSuggestionsInternal(dto, onProgress);
      onComplete(result);
    } catch (error) {
      onError(error as Error);
    }
  }

  async generateAiSuggestions(dto: GenerateAiSuggestionsDto): Promise<AiSuggestionsResponseDto> {
    return this.generateAiSuggestionsInternal(dto, null);
  }

  // ===========================================================================
  // 2. Private Generation & Parsing Logic
  // ===========================================================================

  private async generateAiSuggestionsInternal(
    dto: GenerateAiSuggestionsDto,
    onProgress?: ((progress: AiSuggestionsProgressDto) => void) | null,
  ): Promise<AiSuggestionsResponseDto> {
    const state = await this.initializeState(dto);

    try {
      this.emitProgress({
        state,
        status: 'loading',
        message: 'Iniciando analise do projeto...',
        onProgress,
      });

      if (state.targetHours <= 0) {
        return await this.generateZeroHoursSuggestions({ dto, state, onProgress });
      }

      return await this.generateTargetHoursSuggestions({ dto, state, onProgress });
    } catch (error: unknown) {
      return this.loopRunner.handleSuggestionsError({ error, dto, state });
    }
  }

  // ===========================================================================
  // 3. Private Helpers & Mappers
  // ===========================================================================

  private async initializeState(dto: GenerateAiSuggestionsDto): Promise<SuggestionState> {
    const state = createInitialState(dto);

    if (dto.projectId) {
      const existingData = await this.getExistingTasksHoursAndNames(dto.projectId);
      state.alreadyPlannedHours = existingData.hours;
      state.existingTaskNames.push(...existingData.names);
    }
    return state;
  }

  private emitProgress(params: {
    state: SuggestionState;
    status: 'loading' | 'success' | 'error' | 'partial';
    message: string;
    onProgress?: ((progress: AiSuggestionsProgressDto) => void) | null;
  }): void {
    const { state, status, message, onProgress } = params;
    if (onProgress) {
      onProgress(buildSuggestionsProgress({ state, status, message }));
    }
  }

  private async generateZeroHoursSuggestions(params: {
    dto: GenerateAiSuggestionsDto;
    state: SuggestionState;
    onProgress?: ((progress: AiSuggestionsProgressDto) => void) | null;
  }): Promise<AiSuggestionsResponseDto> {
    const { dto, state, onProgress } = params;
    this.emitProgress({ state, status: 'loading', message: 'Gerando sugestoes...', onProgress });
    const { suggestions, isFallback } = await this.geminiService.getTaskSuggestions({
      ...dto,
      existingTaskNames: state.existingTaskNames,
    });
    const typedSuggestions = (suggestions || []) as SuggestionState['allSuggestions'];
    state.allSuggestions.push(...typedSuggestions);
    state.currentHours = calculateSuggestionsHours(state.allSuggestions);

    return buildSuggestionsResponse({
      state,
      status: isFallback ? 'partial' : 'success',
      message: isFallback
        ? 'Usando sugestoes de fallback devido a resposta invalida da IA'
        : 'Sugestoes geradas com sucesso',
    });
  }

  private async generateTargetHoursSuggestions(params: {
    dto: GenerateAiSuggestionsDto;
    state: SuggestionState;
    onProgress?: ((progress: AiSuggestionsProgressDto) => void) | null;
  }): Promise<AiSuggestionsResponseDto> {
    const { dto, state, onProgress } = params;
    const remainingHours = Math.max(0, state.targetHours - state.alreadyPlannedHours);
    if (remainingHours <= 0) {
      this.logger.log(
        `Projeto ja atingiu o target (${state.alreadyPlannedHours.toFixed(1)}h >= ${state.targetHours}h). Nao gerando novas tarefas.`,
      );
      return buildSuggestionsResponse({
        state,
        status: 'success',
        message: 'Projeto ja atingiu o total de horas planejadas',
      });
    }

    this.logger.log(
      `Gerando tarefas para completar ${remainingHours.toFixed(1)}h (de ${state.targetHours}h total)`,
    );
    await this.loopRunner.runMultiBatchGenerationLoop({ dto, state, remainingHours, onProgress });

    if (state.currentIteration >= state.maxIterations) {
      this.logger.warn(
        `Limite de ${state.maxIterations} iteracoes atingido. Retornando ${state.allSuggestions.length} tarefas.`,
      );
      return buildSuggestionsResponse({
        state,
        status: 'partial',
        message: `Limite de iteracoes atingido. ${state.allSuggestions.length} tarefas geradas.`,
      });
    }

    this.logger.log(
      `Geradas ${state.allSuggestions.length} novas tarefas totalizando ${state.currentHours.toFixed(1)}h (total do projeto: ${(state.alreadyPlannedHours + state.currentHours).toFixed(1)}h)`,
    );
    return buildSuggestionsResponse({
      state,
      status: 'success',
      message: `${state.allSuggestions.length} tarefas geradas com sucesso (${state.currentHours.toFixed(1)}h)`,
    });
  }

  private async getExistingTasksHoursAndNames(
    projectId: string,
  ): Promise<{ hours: number; names: string[] }> {
    const existingTasks = await this.taskModel
      .find({ project: String(projectId) })
      .select('name pomodorosPlanned')
      .exec();
    return calculateExistingTasksHoursAndNames(existingTasks);
  }
}
