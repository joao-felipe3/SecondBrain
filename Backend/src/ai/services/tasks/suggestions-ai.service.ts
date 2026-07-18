import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { GeminiService } from '../core/gemini.service';
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
  constructor(
    @Inject(forwardRef(() => GeminiService))
    private readonly geminiService: GeminiService,
  ) {}

  async generateTaskSuggestions(params: TaskSuggestionsPromptParams): Promise<string> {
    const prompt = buildTaskSuggestionsPrompt(params);

    return this.geminiService.generateContent(prompt, {
      temperature: 0.8,
      topK: 1,
      topP: 1,
      maxOutputTokens: 2048,
      responseMimeType: 'application/json',
    });
  }

  async generateCompletionFeedback(params: CompletionFeedbackPromptParams): Promise<string> {
    const prompt = buildCompletionFeedbackPrompt(params);

    const raw = await this.geminiService.generateContent(prompt, {
      responseMimeType: 'application/json',
      temperature: 0.4,
      topK: 1,
      topP: 1,
      maxOutputTokens: 512,
    });

    const normalize = (value: unknown): string =>
      String(value ?? '')
        .replace(/\s+/g, ' ')
        .trim();

    try {
      const parsed = JSON.parse(raw);
      const payload = {
        praise: normalize(parsed?.praise),
        learning: normalize(parsed?.learning),
        nextStep: normalize(parsed?.nextStep),
        finalText: String(parsed?.finalText ?? '').trim(),
      };

      return JSON.stringify(payload);
    } catch {
      return JSON.stringify({
        praise: '',
        learning: '',
        nextStep: '',
        finalText: String(raw ?? '').trim(),
      });
    }
  }

  async generateCompletionFeedbackStructured(prompt: string): Promise<{
    celebration: string;
    validation: string;
    question: string;
    suggestion: string;
  }> {
    const raw = await this.geminiService.generateContent(prompt, {
      responseMimeType: this.geminiService.supportsJsonMode() ? 'application/json' : undefined,
      temperature: 0.3,
      maxOutputTokens: 400,
    });

    const parsed = this.safeParseJson(raw) || {};
    return {
      celebration: String(parsed.celebration || parsed.praise || '').trim(),
      validation: String(parsed.validation || parsed.learning || '').trim(),
      question: String(parsed.question || parsed.nextStep || '').trim(),
      suggestion: String(parsed.suggestion || parsed.finalText || '').trim(),
    };
  }

  async generateNextSteps(params: NextStepsPromptParams): Promise<Array<{ title: string; description: string }>> {
    const { taskName, feedback } = params;
    const prompt = buildGeminiNextStepsPrompt(params);

    try {
      const raw = await this.geminiService.generateContent(prompt, {
        responseMimeType: this.geminiService.supportsJsonMode() ? 'application/json' : undefined,
        temperature: 0.4,
        maxOutputTokens: 600,
      });

      const parsed = this.safeParseJson(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed
          .map((item: any) => ({
            title: String(item.title || '').trim(),
            description: String(item.description || '').trim(),
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
  }): Promise<{ suggestions: any[]; isFallback: boolean }> {
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

      const suggestions = parsed.map((item: any) => {
        const anyItem = item as Record<string, unknown>;
        return {
          name: String(anyItem.name || ''),
          deadline: anyItem.deadline ? String(anyItem.deadline) : undefined,
          pomodoros: Number.isFinite(anyItem.pomodoros) ? Number(anyItem.pomodoros) : 0,
          priority: Number.isFinite(anyItem.priority) ? Number(anyItem.priority) : 0,
          difficulty: Number.isFinite(anyItem.difficulty) ? Number(anyItem.difficulty) : 0,
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

  generateMockSuggestions(projectName: string): any[] {
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

  private safeParseJson(str: string): any {
    if (!str) return null;
    try {
      return JSON.parse(str);
    } catch {
      const extracted = extractJsonObject<any>(str);
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
