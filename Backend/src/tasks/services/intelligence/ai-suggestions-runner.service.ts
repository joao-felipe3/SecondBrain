import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { TaskDocument } from '../../schemas/task.schema';
import { GeminiService } from '../../../ai/gemini.service';
import {
  GenerateAiSuggestionsDto,
  AiTaskSuggestionDto,
  AiSuggestionsResponseDto,
  AiSuggestionsProgressDto,
} from '../../dto/intelligence/generate-ai-suggestions.dto';
import { SuggestionState, FetchSuggestionsParams } from '../../interfaces';
import {
  filterDuplicateSuggestions,
  addSuggestionsToState,
  buildSuggestionsProgress,
  buildSuggestionsResponse,
} from './utils/ai-suggestions.utils';

@Injectable()
export class TasksAiSuggestionsLoopRunner {
  private readonly logger = new Logger(TasksAiSuggestionsLoopRunner.name);

  constructor(
    @InjectModel('Task') private readonly taskModel: Model<TaskDocument>,
    private readonly geminiService: GeminiService,
  ) {}

  async runMultiBatchGenerationLoop(params: {
    dto: GenerateAiSuggestionsDto;
    state: SuggestionState;
    remainingHours: number;
    onProgress?: ((progress: AiSuggestionsProgressDto) => void) | null;
  }): Promise<void> {
    const { dto, state, remainingHours, onProgress } = params;
    const interIterationDelayMs = 3000;

    while (state.currentHours < remainingHours && state.currentIteration < state.maxIterations) {
      await this.prepareNextIteration({
        state,
        remainingHours,
        interIterationDelayMs,
        onProgress,
      });

      const chunkHours = Math.min(remainingHours - state.currentHours, 8);
      const { suggestions: taskSuggestions } = await this.fetchSuggestionsFromAi({
        dto,
        existingTaskNames: state.existingTaskNames,
        chunkHours,
      });

      if (taskSuggestions.length === 0) {
        this.logger.warn('A resposta da IA esta vazia ou malformada nesta iteracao.');
        continue;
      }

      const newSuggestions = filterDuplicateSuggestions(taskSuggestions, state.existingTaskNames);
      if (newSuggestions.length === 0) {
        this.logger.warn('Nenhuma nova tarefa foi gerada (todas sao duplicatas).');
        break;
      }

      this.applyNewSuggestions({
        newSuggestions,
        state,
        remainingHours,
        onProgress,
      });
    }
  }

  private async prepareNextIteration(params: {
    state: SuggestionState;
    remainingHours: number;
    interIterationDelayMs: number;
    onProgress?: ((progress: AiSuggestionsProgressDto) => void) | null;
  }): Promise<void> {
    const { state, remainingHours, interIterationDelayMs, onProgress } = params;
    state.currentIteration++;
    if (onProgress) {
      onProgress(
        buildSuggestionsProgress({
          state,
          status: 'loading',
          message: `Gerando lote ${state.currentIteration}/${state.maxIterations}...`,
        }),
      );
    }

    this.logger.log(
      `Iteracao ${state.currentIteration}: ${state.currentHours.toFixed(1)}h de ${remainingHours.toFixed(1)}h geradas`,
    );

    if (state.currentIteration > 1) {
      this.logger.log(`Aguardando ${interIterationDelayMs}ms antes da proxima requisicao...`);
      await new Promise((resolve) => setTimeout(resolve, interIterationDelayMs));
    }
  }

  private applyNewSuggestions(params: {
    newSuggestions: AiTaskSuggestionDto[];
    state: SuggestionState;
    remainingHours: number;
    onProgress?: ((progress: AiSuggestionsProgressDto) => void) | null;
  }): void {
    const { newSuggestions, state, remainingHours, onProgress } = params;
    addSuggestionsToState(state, newSuggestions);

    if (onProgress) {
      onProgress(
        buildSuggestionsProgress({
          state,
          status: 'loading',
          message: `${state.allSuggestions.length} tarefas geradas (${state.currentHours.toFixed(1)}h/${remainingHours.toFixed(1)}h)...`,
        }),
      );
    }
  }

  public handleSuggestionsError(params: {
    error: unknown;
    dto: GenerateAiSuggestionsDto;
    state: SuggestionState;
  }): AiSuggestionsResponseDto {
    const { error, dto, state } = params;
    const err = error as Error;
    this.logger.error(`Erro ao usar a API do Gemini: ${err.message ?? err}`);

    if (state.allSuggestions.length > 0) {
      this.logger.warn('Retornando sugestoes parciais acumuladas devido a erro.');
      return buildSuggestionsResponse({
        state,
        status: 'partial',
        message: `Erro parcial: ${state.allSuggestions.length} tarefas geradas antes do erro`,
      });
    }

    this.logger.warn('Usando fallback de mock por ausencia de sugestoes acumuladas.');
    const mockSuggestions = this.geminiService.generateMockSuggestions(
      dto.projectName,
    ) as AiTaskSuggestionDto[];
    addSuggestionsToState(state, mockSuggestions);
    return buildSuggestionsResponse({
      state,
      status: 'error',
      message: 'Falha na IA. Usando sugestoes de fallback.',
    });
  }

  private async fetchSuggestionsFromAi({
    dto,
    existingTaskNames,
    chunkHours,
  }: FetchSuggestionsParams): Promise<{ suggestions: AiTaskSuggestionDto[]; isFallback: boolean }> {
    return this.geminiService.getTaskSuggestions({
      ...dto,
      existingTaskNames,
      chunkHours,
    });
  }
}
