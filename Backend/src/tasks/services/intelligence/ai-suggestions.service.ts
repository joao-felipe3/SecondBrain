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

@Injectable()
export class TasksAiSuggestionsService {
  constructor(
    @InjectModel('Task') private readonly taskModel: Model<TaskDocument>,
    private readonly geminiService: GeminiService,
  ) {}

  // ===========================================================================
  // 1. AI Task Generation & Progress Streaming
  // ===========================================================================

  async generateAiSuggestionsWithProgress(
    dto: GenerateAiSuggestionsDto,
    onProgress: (progress: AiSuggestionsProgressDto) => void,
    onComplete: (result: AiSuggestionsResponseDto) => void,
    onError: (error: Error) => void,
  ): Promise<void> {
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
    const targetHours = dto.targetHours || 0;
    const allSuggestions: AiTaskSuggestionDto[] = [];
    const existingTaskNames: string[] = [];
    const maxIterations = 15;
    let currentIteration = 0;
    let currentHours = 0;
    let alreadyPlannedHours = 0;

    const createResponse = (
      status: 'loading' | 'success' | 'error' | 'partial',
      message: string,
    ): AiSuggestionsResponseDto => ({
      suggestions: allSuggestions,
      progress: {
        currentIteration,
        maxIterations,
        currentHours: alreadyPlannedHours + currentHours,
        targetHours,
        tasksGenerated: allSuggestions.length,
        status,
        message,
      },
    });

    const emitProgress = (status: 'loading' | 'success' | 'error' | 'partial', message: string) => {
      if (onProgress) {
        onProgress({
          currentIteration,
          maxIterations,
          currentHours: alreadyPlannedHours + currentHours,
          targetHours,
          tasksGenerated: allSuggestions.length,
          status,
          message,
        });
      }
    };

    try {
      emitProgress('loading', 'Iniciando analise do projeto...');

      if (dto.projectId) {
        const existingTasks = await this.taskModel.find({ project: dto.projectId }).exec();
        alreadyPlannedHours = existingTasks.reduce((total, task) => {
          return total + (task.pomodorosPlanned || 0) * 0.5;
        }, 0);
        existingTaskNames.push(...existingTasks.map((task) => task.name));
        console.log(
          `Projeto ja tem ${existingTasks.length} tarefas (${alreadyPlannedHours.toFixed(1)}h planejadas)`,
        );
      }

      if (targetHours <= 0) {
        emitProgress('loading', 'Gerando sugestoes...');

        const aiResponse = await this.geminiService.generateTaskSuggestions(
          dto.projectName,
          dto.shortTermGoal,
          dto.midTermGoal,
          dto.longTermGoal,
          dto.userPrompt,
          existingTaskNames,
          undefined,
        );

        const suggestions = this.safeParseGeminiJson(aiResponse);
        if (suggestions.length === 0) {
          console.warn('A resposta da IA esta vazia ou malformada, retornando fallback.');
          const mockSuggestions = this.generateMockSuggestions(dto);
          allSuggestions.push(...mockSuggestions);
          return createResponse(
            'partial',
            'Usando sugestoes de fallback devido a resposta invalida da IA',
          );
        }

        const taskSuggestions = suggestions.map((item) => {
          const anyItem = item as Record<string, unknown>;
          return {
            name: String(anyItem.name || ''),
            deadline: anyItem.deadline ? String(anyItem.deadline) : undefined,
            pomodoros: Number.isFinite(anyItem.pomodoros) ? Number(anyItem.pomodoros) : 0,
            priority: Number.isFinite(anyItem.priority) ? Number(anyItem.priority) : 0,
            difficulty: Number.isFinite(anyItem.difficulty) ? Number(anyItem.difficulty) : 0,
            selected: Boolean(anyItem.selected),
          } as AiTaskSuggestionDto;
        });

        allSuggestions.push(...taskSuggestions);
        currentHours = allSuggestions.reduce((sum, t) => sum + (t.pomodoros || 0) * 0.5, 0);
        return createResponse('success', 'Sugestoes geradas com sucesso');
      }

      const remainingHours = Math.max(0, targetHours - alreadyPlannedHours);

      if (remainingHours <= 0) {
        console.log(
          `Projeto ja atingiu o target (${alreadyPlannedHours.toFixed(1)}h >= ${targetHours}h). Nao gerando novas tarefas.`,
        );
        return createResponse('success', 'Projeto ja atingiu o total de horas planejadas');
      }

      console.log(
        `Gerando tarefas para completar ${remainingHours.toFixed(1)}h (de ${targetHours}h total)`,
      );

      let consecutiveRateLimits = 0;
      const interIterationDelayMs = 3000;

      while (currentHours < remainingHours && currentIteration < maxIterations) {
        currentIteration++;

        emitProgress('loading', `Gerando lote ${currentIteration}/${maxIterations}...`);

        console.log(
          `Iteracao ${currentIteration}: ${currentHours.toFixed(1)}h de ${remainingHours.toFixed(1)}h geradas`,
        );

        if (currentIteration > 1) {
          console.log(`Aguardando ${interIterationDelayMs}ms antes da proxima requisicao...`);
          await new Promise((resolve) => setTimeout(resolve, interIterationDelayMs));
        }

        const chunkHours = Math.min(remainingHours - currentHours, 8);
        let aiResponse: string;
        try {
          aiResponse = await this.geminiService.generateTaskSuggestions(
            dto.projectName,
            dto.shortTermGoal,
            dto.midTermGoal,
            dto.longTermGoal,
            dto.userPrompt,
            existingTaskNames,
            chunkHours,
          );
          consecutiveRateLimits = 0;
        } catch (err: unknown) {
          const errorObj = err as Record<string, unknown>;
          if (errorObj && errorObj.code === 'RATE_LIMIT') {
            consecutiveRateLimits++;
            const waitMs = Math.min(15000 * consecutiveRateLimits, 45000);
            console.warn(
              `Gemini RATE_LIMIT recebido. Aguardando ${waitMs}ms antes de tentar novamente (strike ${consecutiveRateLimits}).`,
            );
            await new Promise((r) => setTimeout(r, waitMs));
            continue;
          }
          throw err;
        }

        const suggestions = this.safeParseGeminiJson(aiResponse);

        if (suggestions.length === 0) {
          console.warn('A resposta da IA esta vazia ou malformada nesta iteracao.');
          continue;
        }

        const taskSuggestions = suggestions.map((item) => {
          const anyItem = item as Record<string, unknown>;
          return {
            name: String(anyItem.name || ''),
            deadline: anyItem.deadline ? String(anyItem.deadline) : undefined,
            pomodoros: Number.isFinite(anyItem.pomodoros) ? Number(anyItem.pomodoros) : 0,
            priority: Number.isFinite(anyItem.priority) ? Number(anyItem.priority) : 0,
            difficulty: Number.isFinite(anyItem.difficulty) ? Number(anyItem.difficulty) : 0,
            selected: Boolean(anyItem.selected),
          } as AiTaskSuggestionDto;
        });

        const newSuggestions = taskSuggestions.filter((newTask) => {
          const normalizedName = newTask.name.toLowerCase().trim();
          return !existingTaskNames.some(
            (existingName) => existingName.toLowerCase().trim() === normalizedName,
          );
        });

        if (newSuggestions.length === 0) {
          console.warn('Nenhuma nova tarefa foi gerada (todas sao duplicatas).');
          break;
        }

        for (const task of newSuggestions) {
          allSuggestions.push(task);
          existingTaskNames.push(task.name);
          currentHours += (task.pomodoros || 0) * 0.5;
        }

        emitProgress(
          'loading',
          `${allSuggestions.length} tarefas geradas (${currentHours.toFixed(1)}h/${remainingHours.toFixed(1)}h)...`,
        );
      }

      if (currentIteration >= maxIterations) {
        console.warn(
          `Limite de ${maxIterations} iteracoes atingido. Retornando ${allSuggestions.length} tarefas.`,
        );
        return createResponse(
          'partial',
          `Limite de iteracoes atingido. ${allSuggestions.length} tarefas geradas.`,
        );
      }

      console.log(
        `Geradas ${allSuggestions.length} novas tarefas totalizando ${currentHours.toFixed(1)}h (total do projeto: ${(alreadyPlannedHours + currentHours).toFixed(1)}h)`,
      );
      return createResponse(
        'success',
        `${allSuggestions.length} tarefas geradas com sucesso (${currentHours.toFixed(1)}h)`,
      );
    } catch (error: unknown) {
      const err = error as Error;
      console.error('Erro ao usar a API do Gemini:', err.message ?? err);
      if (allSuggestions.length > 0) {
        console.warn('Retornando sugestoes parciais acumuladas devido a erro.');
        return createResponse(
          'partial',
          `Erro parcial: ${allSuggestions.length} tarefas geradas antes do erro`,
        );
      }
      console.warn('Usando fallback de mock por ausencia de sugestoes acumuladas.');
      const mockSuggestions = this.generateMockSuggestions(dto);
      allSuggestions.push(...mockSuggestions);
      currentHours = allSuggestions.reduce((sum, t) => sum + (t.pomodoros || 0) * 0.5, 0);
      return createResponse('error', 'Falha na IA. Usando sugestoes de fallback.');
    }
  }

  private safeParseGeminiJson(response: string): unknown[] {
    if (!response || typeof response !== 'string') {
      console.warn('Resposta do Gemini e nula ou nao e string');
      return [];
    }

    const trimmed = response.trim();
    if (!trimmed) return [];

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && typeof parsed === 'object') {
        const anyParsed = parsed as Record<string, unknown>;
        if (Array.isArray(anyParsed.suggestions)) return anyParsed.suggestions;
        if (Array.isArray(anyParsed.tasks)) return anyParsed.tasks;
      }
      return [];
    } catch {
      const match = trimmed.match(/\[[\s\S]*\]/);
      if (!match) return [];

      try {
        const parsed = JSON.parse(match[0]);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
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
