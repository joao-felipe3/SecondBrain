import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  GenerateAiSuggestionsDto,
  AiTaskSuggestionDto,
  AiSuggestionsResponseDto,
  AiSuggestionsProgressDto,
} from '../../dto/generate-ai-suggestions.dto';
import { TaskDocument } from '../../schemas/task.schema';
import { GeminiService } from '../../../ai/gemini.service';

@Injectable()
export class TasksAiSuggestionsService {
  constructor(
    @InjectModel('Task') private readonly taskModel: Model<TaskDocument>,
    private readonly geminiService: GeminiService,
  ) {}

  /**
   * Versao com callback de progresso para streaming em tempo real
   */
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

  /**
   * Versao original que retorna Promise (mantida para compatibilidade)
   */
  async generateAiSuggestions(
    dto: GenerateAiSuggestionsDto,
  ): Promise<AiSuggestionsResponseDto> {
    return this.generateAiSuggestionsInternal(dto, null);
  }

  /**
   * Implementacao interna que suporta callback opcional de progresso
   */
  private async generateAiSuggestionsInternal(
    dto: GenerateAiSuggestionsDto,
    onProgress?: ((progress: AiSuggestionsProgressDto) => void) | null,
  ): Promise<AiSuggestionsResponseDto> {
    const targetHours = dto.targetHours || 0;
    const allSuggestions: AiTaskSuggestionDto[] = [];
    const existingTaskNames: string[] = [];
    const maxIterations = 15; // Limite de seguranca para evitar loops infinitos
    let currentIteration = 0;
    let currentHours = 0;
    let alreadyPlannedHours = 0;

    // Funcao helper para criar resposta com progresso
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

    // Funcao helper para emitir progresso
    const emitProgress = (
      status: 'loading' | 'success' | 'error' | 'partial',
      message: string,
    ) => {
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

      // Busca as tarefas ja existentes no projeto para calcular horas ja planejadas
      if (dto.projectId) {
        const existingTasks = await this.taskModel
          .find({ project: dto.projectId })
          .exec();

        // Calcula horas ja planejadas (pomodoros * 0.5h)
        alreadyPlannedHours = existingTasks.reduce((total, task) => {
          return total + (task.pomodorosPlanned || 0) * 0.5;
        }, 0);

        // Adiciona nomes das tarefas existentes para evitar duplicatas
        existingTaskNames.push(...existingTasks.map((task) => task.name));

        console.log(
          `Projeto ja tem ${existingTasks.length} tarefas (${alreadyPlannedHours.toFixed(1)}h planejadas)`,
        );
      }

      // Se targetHours nao foi especificado, gera apenas uma vez (comportamento antigo)
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
          console.warn(
            'A resposta da IA esta vazia ou malformada, retornando fallback.',
          );
          const mockSuggestions = this.generateMockSuggestions(dto);
          allSuggestions.push(...mockSuggestions);
          return createResponse(
            'partial',
            'Usando sugestoes de fallback devido a resposta invalida da IA',
          );
        }

        allSuggestions.push(...(suggestions as AiTaskSuggestionDto[]));
        currentHours = allSuggestions.reduce(
          (sum, t) => sum + (t.pomodoros || 0) * 0.5,
          0,
        );
        return createResponse('success', 'Sugestoes geradas com sucesso');
      }

      // Calcula quantas horas ainda precisam ser geradas
      const remainingHours = Math.max(0, targetHours - alreadyPlannedHours);

      if (remainingHours <= 0) {
        console.log(
          `Projeto ja atingiu o target (${alreadyPlannedHours.toFixed(1)}h >= ${targetHours}h). Nao gerando novas tarefas.`,
        );
        return createResponse(
          'success',
          'Projeto ja atingiu o total de horas planejadas',
        );
      }

      console.log(
        `Gerando tarefas para completar ${remainingHours.toFixed(1)}h (de ${targetHours}h total)`,
      );

      // Loop para gerar tarefas ate atingir as horas restantes
      let consecutiveRateLimits = 0;
      const interIterationDelayMs = 3000; // delay fixo entre iteracoes para reduzir 429

      while (
        currentHours < remainingHours &&
        currentIteration < maxIterations
      ) {
        currentIteration++;

        emitProgress(
          'loading',
          `Gerando lote ${currentIteration}/${maxIterations}...`,
        );

        console.log(
          `Iteracao ${currentIteration}: ${currentHours.toFixed(1)}h de ${remainingHours.toFixed(1)}h geradas`,
        );

        // Delay de 1 segundo entre requisicoes para evitar rate limiting (429)
        if (currentIteration > 1) {
          console.log(
            `Aguardando ${interIterationDelayMs}ms antes da proxima requisicao...`,
          );
          await new Promise((resolve) =>
            setTimeout(resolve, interIterationDelayMs),
          );
        }

        // Gera em lotes menores para reduzir risco de 429 e consumo de tokens
        const chunkHours = Math.min(remainingHours - currentHours, 8); // ~16 pomodoros
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
          // sucesso: zera strikes
          consecutiveRateLimits = 0;
        } catch (err: any) {
          if (err?.code === 'RATE_LIMIT') {
            consecutiveRateLimits++;
            const waitMs = Math.min(15000 * consecutiveRateLimits, 45000);
            console.warn(
              `Gemini RATE_LIMIT recebido. Aguardando ${waitMs}ms antes de tentar novamente (strike ${consecutiveRateLimits}).`,
            );
            await new Promise((r) => setTimeout(r, waitMs));
            // tenta proxima iteracao sem contar como iteracao concluida
            continue;
          }
          throw err;
        }

        const suggestions = this.safeParseGeminiJson(aiResponse);

        if (suggestions.length === 0) {
          console.warn(
            'A resposta da IA esta vazia ou malformada nesta iteracao.',
          );
          // Continua tentando nas proximas iteracoes ao inves de quebrar
          continue;
        }

        // Filtra duplicatas por nome (case-insensitive)
        const newSuggestions = (suggestions as AiTaskSuggestionDto[]).filter(
          (newTask) => {
            const normalizedName = newTask.name.toLowerCase().trim();
            return !existingTaskNames.some(
              (existingName) =>
                existingName.toLowerCase().trim() === normalizedName,
            );
          },
        );

        if (newSuggestions.length === 0) {
          console.warn(
            'Nenhuma nova tarefa foi gerada (todas sao duplicatas).',
          );
          break;
        }

        // Adiciona as novas tarefas
        for (const task of newSuggestions) {
          allSuggestions.push(task);
          existingTaskNames.push(task.name);
          // Cada pomodoro = 0.5 horas (25 minutos)
          currentHours += (task.pomodoros || 0) * 0.5;
        }

        // Emite progresso apos adicionar novas tarefas
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
    } catch (error: any) {
      console.error('Erro ao usar a API do Gemini:', error?.message ?? error);
      // Se acumulamos algo, devolve parcial; senao fallback
      if (allSuggestions.length > 0) {
        console.warn('Retornando sugestoes parciais acumuladas devido a erro.');
        return createResponse(
          'partial',
          `Erro parcial: ${allSuggestions.length} tarefas geradas antes do erro`,
        );
      }
      console.warn(
        'Usando fallback de mock por ausencia de sugestoes acumuladas.',
      );
      const mockSuggestions = this.generateMockSuggestions(dto);
      allSuggestions.push(...mockSuggestions);
      currentHours = allSuggestions.reduce(
        (sum, t) => sum + (t.pomodoros || 0) * 0.5,
        0,
      );
      return createResponse(
        'error',
        'Falha na IA. Usando sugestoes de fallback.',
      );
    }
  }

  /**
   * Tenta fazer parse seguro do JSON retornado pelo Gemini.
   * Lida com respostas malformadas, texto extra, e caracteres invalidos.
   */
  private safeParseGeminiJson(response: string): any[] {
    if (!response || typeof response !== 'string') {
      console.warn('Resposta do Gemini e nula ou nao e string');
      return [];
    }

    let cleaned = response.trim();

    // Remove blocos de codigo markdown se presentes
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.slice(7);
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.slice(3);
    }
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.slice(0, -3);
    }
    cleaned = cleaned.trim();

    // Tenta encontrar o array JSON dentro da resposta
    const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      cleaned = arrayMatch[0];
    }

    // Tenta parse direto
    try {
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) {
        return parsed;
      }
      // Se for objeto com array dentro, tenta extrair
      if (parsed && typeof parsed === 'object') {
        const keys = Object.keys(parsed);
        for (const key of keys) {
          if (Array.isArray(parsed[key])) {
            return parsed[key];
          }
        }
      }
      console.warn('JSON parseado nao e um array:', typeof parsed);
      return [];
    } catch (firstError) {
      console.warn('Primeiro parse falhou, tentando limpar JSON...');
    }

    // Tenta corrigir problemas comuns de JSON malformado
    try {
      // Remove trailing commas antes de } ou ]
      cleaned = cleaned.replace(/,\s*([\}\]])/g, '$1');

      // Remove caracteres de controle invalidos
      cleaned = cleaned.replace(/[\x00-\x1F\x7F]/g, ' ');

      // Corrige aspas nao escapadas dentro de strings (heuristica simples)
      // Isso e arriscado mas pode ajudar em alguns casos

      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) {
        return parsed;
      }
      return [];
    } catch (secondError) {
      console.warn(
        'Segundo parse tambem falhou, tentando extrair objetos manualmente...',
      );
    }

    // Ultima tentativa: extrair objetos individualmente usando regex
    try {
      const objectMatches = cleaned.matchAll(/\{[^{}]*\}/g);
      const objects: any[] = [];

      for (const match of objectMatches) {
        try {
          const obj = JSON.parse(match[0]);
          if (obj && typeof obj === 'object' && obj.name) {
            objects.push(obj);
          }
        } catch {
          // Ignora objetos que nao conseguir parsear
        }
      }

      if (objects.length > 0) {
        console.log(
          `Extraidos ${objects.length} objetos manualmente do JSON malformado`,
        );
        return objects;
      }
    } catch {
      // Falhou completamente
    }

    console.error(
      'Nao foi possivel parsear a resposta do Gemini:',
      cleaned.substring(0, 200),
    );
    return [];
  }

  /**
   * Fallback para gerar sugestoes mockadas inteligentes quando a IA nao esta disponivel.
   */
  private generateMockSuggestions(
    dto: GenerateAiSuggestionsDto,
  ): AiTaskSuggestionDto[] {
    const keywords =
      `${dto.projectName} ${dto.shortTermGoal} ${dto.midTermGoal} ${dto.longTermGoal} ${dto.userPrompt}`.toLowerCase();
    const suggestions: AiTaskSuggestionDto[] = [];
    const today = new Date();

    const getDatePlusDays = (days: number) => {
      const date = new Date(today);
      date.setDate(date.getDate() + days);
      return date.toISOString().split('T')[0];
    };

    if (keywords.includes('api') || keywords.includes('backend')) {
      suggestions.push({
        name: 'Definir endpoints da API REST',
        deadline: getDatePlusDays(3),
        pomodoros: 3,
        priority: 4,
        difficulty: 3,
        selected: true,
      });
      suggestions.push({
        name: 'Configurar autenticacao com JWT',
        deadline: getDatePlusDays(7),
        pomodoros: 4,
        priority: 3,
        difficulty: 4,
        selected: false,
      });
    }
    if (
      keywords.includes('ui') ||
      keywords.includes('frontend') ||
      keywords.includes('design')
    ) {
      suggestions.push({
        name: 'Criar prototipo de baixa fidelidade da UI',
        deadline: getDatePlusDays(2),
        pomodoros: 2,
        priority: 4,
        difficulty: 2,
        selected: true,
      });
      suggestions.push({
        name: 'Desenvolver componentes reutilizaveis em Vue/React',
        deadline: getDatePlusDays(10),
        pomodoros: 6,
        priority: 3,
        difficulty: 3,
        selected: true,
      });
    }
    if (keywords.includes('banco de dados') || keywords.includes('database')) {
      suggestions.push({
        name: 'Modelar o esquema do banco de dados',
        deadline: getDatePlusDays(4),
        pomodoros: 4,
        priority: 4,
        difficulty: 3,
        selected: true,
      });
    }
    if (suggestions.length === 0) {
      suggestions.push({
        name: 'Reuniao de brainstorming para definir os proximos passos',
        deadline: getDatePlusDays(1),
        pomodoros: 1,
        priority: 4,
        difficulty: 1,
        selected: true,
      });
      suggestions.push({
        name: 'Pesquisar tecnologias concorrentes',
        deadline: getDatePlusDays(5),
        pomodoros: 3,
        priority: 2,
        difficulty: 2,
        selected: false,
      });
    }

    return suggestions.slice(0, 5);
  }
}
