import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  GenerateAiSuggestionsDto,
  AiTaskSuggestionDto,
  AiSuggestionsResponseDto,
  AiSuggestionsProgressDto,
} from '../../dto/intelligence/generate-ai-suggestions.dto';
import { TaskDocument } from '../../schemas/task.schema';
import { GeminiService } from '../../../ai/gemini.service';
import { SuggestionState } from '../../interfaces';

@Injectable()
export class TasksAiSuggestionsService {
  constructor(
    @InjectModel('Task') private readonly taskModel: Model<TaskDocument>,
    private readonly geminiService: GeminiService,
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
      this.emitProgress({ state, status: 'loading', message: 'Iniciando analise do projeto...', onProgress });

      if (state.targetHours <= 0) {
        return await this.generateZeroHoursSuggestions({ dto, state, onProgress });
      }

      return await this.generateTargetHoursSuggestions({ dto, state, onProgress });
    } catch (error: unknown) {
      return this.handleSuggestionsError({ error, dto, state });
    }
  }



  // ===========================================================================
  // 3. Private Helpers & Mappers
  // ===========================================================================

  private async initializeState(dto: GenerateAiSuggestionsDto): Promise<SuggestionState> {
    const state: SuggestionState = {
      targetHours: dto.targetHours || 0,
      alreadyPlannedHours: 0,
      currentHours: 0,
      currentIteration: 0,
      maxIterations: 15,
      allSuggestions: [],
      existingTaskNames: [],
    };

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
      onProgress({
        currentIteration: state.currentIteration,
        maxIterations: state.maxIterations,
        currentHours: state.alreadyPlannedHours + state.currentHours,
        targetHours: state.targetHours,
        tasksGenerated: state.allSuggestions.length,
        status,
        message,
      });
    }
  }

  private buildResponse(params: {
    state: SuggestionState;
    status: 'loading' | 'success' | 'error' | 'partial';
    message: string;
  }): AiSuggestionsResponseDto {
    const { state, status, message } = params;
    return {
      suggestions: state.allSuggestions,
      progress: {
        currentIteration: state.currentIteration,
        maxIterations: state.maxIterations,
        currentHours: state.alreadyPlannedHours + state.currentHours,
        targetHours: state.targetHours,
        tasksGenerated: state.allSuggestions.length,
        status,
        message,
      },
    };
  }

  private async generateZeroHoursSuggestions(params: {
    dto: GenerateAiSuggestionsDto;
    state: SuggestionState;
    onProgress?: ((progress: AiSuggestionsProgressDto) => void) | null;
  }): Promise<AiSuggestionsResponseDto> {
    const { dto, state, onProgress } = params;
    this.emitProgress({ state, status: 'loading', message: 'Gerando sugestoes...', onProgress });
    const { suggestions, isFallback } = await this.generateSingleBatch(dto, state.existingTaskNames);
    state.allSuggestions.push(...suggestions);
    state.currentHours = state.allSuggestions.reduce((sum, t) => sum + (t.pomodoros || 0) * 0.5, 0);

    return this.buildResponse({
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
      console.log(
        `Projeto ja atingiu o target (${state.alreadyPlannedHours.toFixed(1)}h >= ${state.targetHours}h). Nao gerando novas tarefas.`,
      );
      return this.buildResponse({ state, status: 'success', message: 'Projeto ja atingiu o total de horas planejadas' });
    }

    console.log(
      `Gerando tarefas para completar ${remainingHours.toFixed(1)}h (de ${state.targetHours}h total)`,
    );
    await this.runMultiBatchGenerationLoop({ dto, state, remainingHours, onProgress });

    if (state.currentIteration >= state.maxIterations) {
      console.warn(
        `Limite de ${state.maxIterations} iteracoes atingido. Retornando ${state.allSuggestions.length} tarefas.`,
      );
      return this.buildResponse({
        state,
        status: 'partial',
        message: `Limite de iteracoes atingido. ${state.allSuggestions.length} tarefas geradas.`,
      });
    }

    console.log(
      `Geradas ${state.allSuggestions.length} novas tarefas totalizando ${state.currentHours.toFixed(1)}h (total do projeto: ${(state.alreadyPlannedHours + state.currentHours).toFixed(1)}h)`,
    );
    return this.buildResponse({
      state,
      status: 'success',
      message: `${state.allSuggestions.length} tarefas geradas com sucesso (${state.currentHours.toFixed(1)}h)`,
    });
  }

  private async runMultiBatchGenerationLoop(params: {
    dto: GenerateAiSuggestionsDto;
    state: SuggestionState;
    remainingHours: number;
    onProgress?: ((progress: AiSuggestionsProgressDto) => void) | null;
  }): Promise<void> {
    const { dto, state, remainingHours, onProgress } = params;
    let consecutiveRateLimits = 0;
    const interIterationDelayMs = 3000;

    while (state.currentHours < remainingHours && state.currentIteration < state.maxIterations) {
      state.currentIteration++;
      this.emitProgress({
        state,
        status: 'loading',
        message: `Gerando lote ${state.currentIteration}/${state.maxIterations}...`,
        onProgress,
      });

      console.log(
        `Iteracao ${state.currentIteration}: ${state.currentHours.toFixed(1)}h de ${remainingHours.toFixed(1)}h geradas`,
      );

      if (state.currentIteration > 1) {
        console.log(`Aguardando ${interIterationDelayMs}ms antes da proxima requisicao...`);
        await new Promise((resolve) => setTimeout(resolve, interIterationDelayMs));
      }

      const chunkHours = Math.min(remainingHours - state.currentHours, 8);
      let taskSuggestions: AiTaskSuggestionDto[];
      try {
        taskSuggestions = await this.fetchSuggestionsFromAi({ dto, existingTaskNames: state.existingTaskNames, chunkHours });
        consecutiveRateLimits = 0;
      } catch (err: unknown) {
        consecutiveRateLimits = await this.handleRateLimitRetry(err, consecutiveRateLimits);
        continue;
      }

      if (taskSuggestions.length === 0) {
        console.warn('A resposta da IA esta vazia ou malformada nesta iteracao.');
        continue;
      }

      const newSuggestions = taskSuggestions.filter((newTask) => {
        const normalizedName = newTask.name.toLowerCase().trim();
        return !state.existingTaskNames.some(
          (existingName) => existingName.toLowerCase().trim() === normalizedName,
        );
      });

      if (newSuggestions.length === 0) {
        console.warn('Nenhuma nova tarefa foi gerada (todas sao duplicatas).');
        break;
      }

      for (const task of newSuggestions) {
        state.allSuggestions.push(task);
        state.existingTaskNames.push(task.name);
        state.currentHours += (task.pomodoros || 0) * 0.5;
      }

      this.emitProgress({
        state,
        status: 'loading',
        message: `${state.allSuggestions.length} tarefas geradas (${state.currentHours.toFixed(1)}h/${remainingHours.toFixed(1)}h)...`,
        onProgress,
      });
    }
  }

  private handleSuggestionsError(params: {
    error: unknown;
    dto: GenerateAiSuggestionsDto;
    state: SuggestionState;
  }): AiSuggestionsResponseDto {
    const { error, dto, state } = params;
    const err = error as Error;
    console.error('Erro ao usar a API do Gemini:', err.message ?? err);

    if (state.allSuggestions.length > 0) {
      console.warn('Retornando sugestoes parciais acumuladas devido a erro.');
      return this.buildResponse({
        state,
        status: 'partial',
        message: `Erro parcial: ${state.allSuggestions.length} tarefas geradas antes do erro`,
      });
    }

    console.warn('Usando fallback de mock por ausencia de sugestoes acumuladas.');
    const mockSuggestions = this.generateMockSuggestions(dto);
    state.allSuggestions.push(...mockSuggestions);
    state.currentHours = state.allSuggestions.reduce((sum, t) => sum + (t.pomodoros || 0) * 0.5, 0);
    return this.buildResponse({ state, status: 'error', message: 'Falha na IA. Usando sugestoes de fallback.' });
  }

  private async getExistingTasksHoursAndNames(
    projectId: string,
  ): Promise<{ hours: number; names: string[] }> {
    const existingTasks = await this.taskModel
      .find({ project: projectId })
      .select('name pomodorosPlanned')
      .exec();
    const hours = existingTasks.reduce((total, task) => {
      return total + (task.pomodorosPlanned || 0) * 0.5;
    }, 0);
    const names = existingTasks.map((task) => task.name);
    return { hours, names };
  }

  private async fetchSuggestionsFromAi(params: {
    dto: GenerateAiSuggestionsDto;
    existingTaskNames: string[];
    chunkHours?: number;
  }): Promise<AiTaskSuggestionDto[]> {
    const { dto, existingTaskNames, chunkHours } = params;
    return this.geminiService.getTaskSuggestions({
      projectName: dto.projectName,
      shortTermGoal: dto.shortTermGoal,
      midTermGoal: dto.midTermGoal,
      longTermGoal: dto.longTermGoal,
      userPrompt: dto.userPrompt,
      existingTaskNames,
      chunkHours,
    });
  }

  private async generateSingleBatch(
    dto: GenerateAiSuggestionsDto,
    existingTaskNames: string[],
  ): Promise<{ suggestions: AiTaskSuggestionDto[]; isFallback: boolean }> {
    const taskSuggestions = await this.fetchSuggestionsFromAi({ dto, existingTaskNames });
    if (taskSuggestions.length === 0) {
      console.warn('A resposta da IA esta vazia ou malformada, retornando fallback.');
      return { suggestions: this.generateMockSuggestions(dto), isFallback: true };
    }
    return { suggestions: taskSuggestions, isFallback: false };
  }

  private async handleRateLimitRetry(err: unknown, consecutiveRateLimits: number): Promise<number> {
    const errorObj = err as Record<string, unknown>;
    if (errorObj && errorObj.code === 'RATE_LIMIT') {
      const waitMs = Math.min(15000 * (consecutiveRateLimits + 1), 45000);
      console.warn(
        `Gemini RATE_LIMIT recebido. Aguardando ${waitMs}ms antes de tentar novamente (strike ${consecutiveRateLimits + 1}).`,
      );
      await new Promise((r) => setTimeout(r, waitMs));
      return consecutiveRateLimits + 1;
    }
    throw err;
  }

  private generateMockSuggestions(dto: GenerateAiSuggestionsDto): AiTaskSuggestionDto[] {
    const baseName = String(dto.projectName || 'Projeto').trim();
    const today = new Date();

    return [
      {
        name: `${baseName} - Planejar próximos passos`,
        deadline: new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString(),
        pomodoros: 2,
        priority: 3,
        difficulty: 2,
        selected: false,
      },
      {
        name: `${baseName} - Executar tarefa principal`,
        deadline: new Date(today.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString(),
        pomodoros: 4,
        priority: 2,
        difficulty: 3,
        selected: false,
      },
      {
        name: `${baseName} - Revisar e ajustar`,
        deadline: new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        pomodoros: 1,
        priority: 2,
        difficulty: 1,
        selected: false,
      },
    ];
  }
}
