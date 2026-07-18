import { Injectable } from '@nestjs/common';
import { GeminiExecutorService } from './gemini-executor.service';
import { ChecklistAiService } from '../tasks/checklist-ai.service';
import { PertAiService } from '../tasks/pert-ai.service';
import { SuggestionsAiService } from '../tasks/suggestions-ai.service';
import { DependencyAiService } from '../tasks/dependency-ai.service';
import {
  ChecklistPromptParams,
  ChecklistWithHistoryPromptParams,
  CompletionFeedbackPromptParams,
  NextStepsPromptParams,
  PertEstimatePromptParams,
  TaskSuggestionsPromptParams,
} from '../../interfaces';

@Injectable()
export class GeminiService {
  constructor(
    private readonly geminiExecutor: GeminiExecutorService,
    private readonly checklistAiService: ChecklistAiService,
    private readonly pertAiService: PertAiService,
    private readonly suggestionsAiService: SuggestionsAiService,
    private readonly dependencyAiService: DependencyAiService,
  ) {}

  generateChecklistForTask(params: ChecklistPromptParams): Promise<string[]> {
    return this.checklistAiService.generateChecklistForTask(params);
  }

  generateChecklistWithHistory(params: ChecklistWithHistoryPromptParams): Promise<string[]> {
    return this.checklistAiService.generateChecklistWithHistory(params);
  }

  suggestPertEstimates(params: PertEstimatePromptParams): Promise<{
    optimistic: number;
    likely: number;
    pessimistic: number;
    expectedTime: number;
    standardDeviation: number;
    recommendation: string;
    fromLLM: boolean;
  }> {
    return this.pertAiService.suggestPertEstimates(params);
  }

  generateTaskSuggestions(params: TaskSuggestionsPromptParams): Promise<string> {
    return this.suggestionsAiService.generateTaskSuggestions(params);
  }

  generateCompletionFeedback(params: CompletionFeedbackPromptParams): Promise<string> {
    return this.suggestionsAiService.generateCompletionFeedback(params);
  }

  generateCompletionFeedbackStructured(prompt: string): Promise<{
    celebration: string;
    validation: string;
    question: string;
    suggestion: string;
  }> {
    return this.suggestionsAiService.generateCompletionFeedbackStructured(prompt);
  }

  generateNextSteps(params: NextStepsPromptParams): Promise<Array<{ title: string; description: string }>> {
    return this.suggestionsAiService.generateNextSteps(params);
  }

  getTaskSuggestions(params: {
    projectName: string;
    shortTermGoal?: string;
    midTermGoal?: string;
    longTermGoal?: string;
    userPrompt?: string;
    existingTaskNames?: string[];
    chunkHours?: number;
  }): Promise<{ suggestions: any[]; isFallback: boolean }> {
    return this.suggestionsAiService.getTaskSuggestions(params);
  }

  generateMockSuggestions(projectName: string): any[] {
    return this.suggestionsAiService.generateMockSuggestions(projectName);
  }

  inferDependencies(params: {
    prompt: string;
    maxOutputTokens: number;
    model?: string;
  }): Promise<any[]> {
    return this.dependencyAiService.inferDependencies(params);
  }

  generateEmbedding(text: string): Promise<number[]> {
    return this.geminiExecutor.generateEmbedding(text);
  }

  generateContent(
    prompt: string,
    options?: {
      model?: string;
      responseMimeType?: string;
      maxOutputTokens?: number;
      temperature?: number;
      topK?: number;
      topP?: number;
    },
  ): Promise<string> {
    return this.geminiExecutor.generateContent(prompt, options);
  }

  supportsJsonMode(): boolean {
    return this.geminiExecutor.supportsJsonMode();
  }

  getModelName(): string {
    return this.geminiExecutor.getModelName();
  }

  getStrongModelName(): string | undefined {
    return this.geminiExecutor.getStrongModelName();
  }
}
