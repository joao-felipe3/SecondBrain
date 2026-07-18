import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { GeminiService } from '../core/gemini.service';
import { z } from 'zod';
import { extractJsonObject } from '../../../projects/services/wbs/utils/json-parser.util';

@Injectable()
export class DependencyAiService {
  constructor(
    @Inject(forwardRef(() => GeminiService))
    private readonly geminiService: GeminiService,
  ) {}

  async inferDependencies(params: {
    prompt: string;
    maxOutputTokens: number;
    model?: string;
  }): Promise<any[]> {
    const { prompt, maxOutputTokens, model } = params;
    const response = await this.geminiService.generateContent(prompt, {
      model,
      responseMimeType: 'application/json',
      maxOutputTokens,
      temperature: 0.2,
    });

    const dependencyObjectSchema = z.object({
      taskId: z.string().min(1),
      dependsOnTaskId: z.string().min(1),
      relationship: z.string().optional(),
      reason: z.string().optional(),
      confidence: z.number().min(0).max(1).optional(),
    });

    const dependencyTupleSchema = z.tuple([
      z.string().min(1),
      z.string().min(1),
      z.string().min(1).optional(),
    ]);

    const schema = z
      .object({
        dependencies: z.array(z.union([dependencyObjectSchema, dependencyTupleSchema])).default([]),
      })
      .passthrough();

    const parsed = extractJsonObject<Record<string, unknown>>(response);
    const validated = schema.parse(parsed);

    const rawDeps = validated.dependencies || [];
    return rawDeps.map((dep) => {
      if (Array.isArray(dep)) {
        return {
          taskId: String(dep[0] || '').trim(),
          dependsOnTaskId: String(dep[1] || '').trim(),
          relationship: String(dep[2] || 'FINISH_TO_START').trim(),
        };
      }
      return {
        taskId: String(dep.taskId || '').trim(),
        dependsOnTaskId: String(dep.dependsOnTaskId || '').trim(),
        relationship: String(dep.relationship || 'FINISH_TO_START').trim(),
        reason: dep.reason ? String(dep.reason).trim() : undefined,
        confidence: typeof dep.confidence === 'number' ? dep.confidence : undefined,
      };
    });
  }
}
