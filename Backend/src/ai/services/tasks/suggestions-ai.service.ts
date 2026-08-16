import { Injectable } from '@nestjs/common';
import { GeminiExecutorService } from '../core/gemini-executor.service';
import { extractJsonObject } from '../../../projects/services/wbs/utils/json-parser.util';
import {
  buildTaskSuggestionsPrompt,
  buildCompletionFeedbackPrompt,
  buildGeminiNextStepsPrompt,
} from '../../prompts';
import {
  CompletionFeedbackPromptParams,
  NextStepsPromptParams,
  TaskSuggestionsPromptParams,
} from '../../interfaces';

@Injectable()
export class SuggestionsAiService {
  constructor(private readonly geminiExecutor: GeminiExecutorService) {}

  async generateTaskSuggestions(params: TaskSuggestionsPromptParams): Promise<string> {
    const prompt = buildTaskSuggestionsPrompt(params);

    return this.geminiExecutor.generateContent(prompt, {
      temperature: 0.8,
      topK: 1,
      topP: 1,
      maxOutputTokens: 2048,
      responseMimeType: 'application/json',
    });
  }

  async generateCompletionFeedback(params: CompletionFeedbackPromptParams): Promise<string> {
    const prompt = buildCompletionFeedbackPrompt(params);

    const raw = await this.geminiExecutor.generateContent(prompt, {
      responseMimeType: 'application/json',
      temperature: 0.4,
      topK: 1,
      topP: 1,
      maxOutputTokens: 512,
    });

    const normalize = (value?: string | null): string => (value || '').replace(/\s+/g, ' ').trim();

    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const payload = {
        praise: normalize(typeof parsed?.praise === 'string' ? parsed.praise : null),
        learning: normalize(typeof parsed?.learning === 'string' ? parsed.learning : null),
        nextStep: normalize(typeof parsed?.nextStep === 'string' ? parsed.nextStep : null),
        finalText: typeof parsed?.finalText === 'string' ? parsed.finalText.trim() : '',
      };

      return JSON.stringify(payload);
    } catch {
      return JSON.stringify({
        praise: '',
        learning: '',
        nextStep: '',
        finalText: typeof raw === 'string' ? raw.trim() : '',
      });
    }
  }

  async generateCompletionFeedbackStructured(prompt: string): Promise<{
    celebration: string;
    validation: string;
    question: string;
    suggestion: string;
  }> {
    const raw = await this.geminiExecutor.generateContent(prompt, {
      responseMimeType: this.geminiExecutor.supportsJsonMode() ? 'application/json' : undefined,
      temperature: 0.3,
      maxOutputTokens: 400,
    });

    const parsed = (this.safeParseJson(raw) as Record<string, unknown>) || {};
    const getString = (val: unknown): string => (typeof val === 'string' ? val.trim() : '');

    return {
      celebration: getString(parsed.celebration) || getString(parsed.praise),
      validation: getString(parsed.validation) || getString(parsed.learning),
      question: getString(parsed.question) || getString(parsed.nextStep),
      suggestion: getString(parsed.suggestion) || getString(parsed.finalText),
    };
  }

  async generateNextSteps(
    params: NextStepsPromptParams,
  ): Promise<Array<{ title: string; description: string }>> {
    const { taskName } = params;
    const prompt = buildGeminiNextStepsPrompt(params);

    try {
      const raw = await this.geminiExecutor.generateContent(prompt, {
        responseMimeType: this.geminiExecutor.supportsJsonMode() ? 'application/json' : undefined,
        temperature: 0.4,
        maxOutputTokens: 600,
      });

      const parsed = this.safeParseJson(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return (parsed as Array<Record<string, unknown>>)
          .map((item) => ({
            title: typeof item.title === 'string' ? item.title.trim() : '',
            description: typeof item.description === 'string' ? item.description.trim() : '',
          }))
          .filter((it) => it.title);
      }
    } catch {
      // Ignored: fallback handled below
    }

    return [
      {
        title: `Próximo passo para: ${taskName}`,
        description: 'Dar continuidade ao trabalho avaliando os resultados obtidos.',
      },
    ];
  }

  async getTaskSuggestions(params: {
    projectName: string;
    shortTermGoal?: string;
    midTermGoal?: string;
    longTermGoal?: string;
    userPrompt?: string;
    existingTaskNames?: string[];
    chunkHours?: number;
  }): Promise<{ suggestions: Record<string, unknown>[]; isFallback: boolean }> {
    const {
      projectName,
      shortTermGoal,
      midTermGoal,
      longTermGoal,
      userPrompt,
      existingTaskNames,
      chunkHours,
    } = params;

    try {
      const aiResponse = await this.generateTaskSuggestions({
        projectName,
        shortTermGoal,
        midTermGoal,
        longTermGoal,
        userPrompt,
        existingTaskNames,
        remainingHours: chunkHours,
      });

      const parsed = this.safeParseJson(aiResponse);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        return {
          suggestions: this.generateMockSuggestions(projectName),
          isFallback: true,
        };
      }

      const suggestions = (parsed as Array<Record<string, unknown>>).map((anyItem) => {
        return {
          name: typeof anyItem.name === 'string' ? anyItem.name : '',
          deadline: typeof anyItem.deadline === 'string' ? anyItem.deadline : undefined,
          pomodoros: typeof anyItem.pomodoros === 'number' ? anyItem.pomodoros : 0,
          priority: typeof anyItem.priority === 'number' ? anyItem.priority : 0,
          difficulty: typeof anyItem.difficulty === 'number' ? anyItem.difficulty : 0,
          selected: Boolean(anyItem.selected),
        };
      });

      return { suggestions, isFallback: false };
    } catch {
      return {
        suggestions: this.generateMockSuggestions(projectName),
        isFallback: true,
      };
    }
  }

  generateMockSuggestions(projectName: string): Record<string, unknown>[] {
    const baseName = String(projectName || 'Projeto').trim();
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

  private safeParseJson(str: string): unknown {
    if (!str) return null;
    try {
      return JSON.parse(str);
    } catch {
      const extracted = extractJsonObject<Record<string, unknown>>(str);
      if (extracted) return extracted;
      try {
        const match = str.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
        if (match) return JSON.parse(match[0]);
      } catch {
        // Fallback
      }
      return null;
    }
  }
}
