import { AiTaskSuggestionDto } from '../dto/intelligence/generate-ai-suggestions.dto';

export interface SuggestionState {
  targetHours: number;
  alreadyPlannedHours: number;
  currentHours: number;
  currentIteration: number;
  maxIterations: number;
  allSuggestions: AiTaskSuggestionDto[];
  existingTaskNames: string[];
}
