import {
  AiTaskSuggestionDto,
  GenerateAiSuggestionsDto,
} from '../dto/intelligence/generate-ai-suggestions.dto';

export interface SuggestionState {
  targetHours: number;
  alreadyPlannedHours: number;
  currentHours: number;
  currentIteration: number;
  maxIterations: number;
  allSuggestions: AiTaskSuggestionDto[];
  existingTaskNames: string[];
}

export interface FetchSuggestionsParams {
  dto: GenerateAiSuggestionsDto;
  existingTaskNames: string[];
  chunkHours?: number;
}
