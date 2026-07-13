import {
  AiTaskSuggestionDto,
  AiSuggestionsResponseDto,
  AiSuggestionsProgressDto,
  GenerateAiSuggestionsDto,
} from '../../../dto/intelligence/generate-ai-suggestions.dto';
import { SuggestionState } from '../../../interfaces';

// Filters a list of new task suggestions to only include those that are not already present
// in the existing task names.
export function filterDuplicateSuggestions(
  taskSuggestions: AiTaskSuggestionDto[],
  existingTaskNames: string[],
): AiTaskSuggestionDto[] {
  return taskSuggestions.filter((newTask) => {
    const normalizedNew = newTask.name.toLowerCase().trim();
    return !existingTaskNames.some(
      (existingName) => existingName.toLowerCase().trim() === normalizedNew,
    );
  });
}

// Calculates the total estimated hours for a list of suggestions based on pomodoros
export function calculateSuggestionsHours(suggestions: AiTaskSuggestionDto[]): number {
  return suggestions.reduce((sum, task) => sum + (task.pomodoros || 0) * 0.5, 0);
}

// Maps the current SuggestionState to an AiSuggestionsProgressDto structure.
export function buildSuggestionsProgress(params: {
  state: SuggestionState;
  status: 'loading' | 'success' | 'error' | 'partial';
  message: string;
}): AiSuggestionsProgressDto {
  const { state, status, message } = params;
  return {
    currentIteration: state.currentIteration,
    maxIterations: state.maxIterations,
    currentHours: state.alreadyPlannedHours + state.currentHours,
    targetHours: state.targetHours,
    tasksGenerated: state.allSuggestions.length,
    status,
    message,
  };
}

// Maps the current SuggestionState to an AiSuggestionsResponseDto structure.
export function buildSuggestionsResponse(params: {
  state: SuggestionState;
  status: 'loading' | 'success' | 'error' | 'partial';
  message: string;
}): AiSuggestionsResponseDto {
  const { state, status, message } = params;
  return {
    suggestions: state.allSuggestions,
    progress: buildSuggestionsProgress({ state, status, message }),
  };
}

/**
 * Creates the initial suggestion state configuration.
 */
export function createInitialState(dto: GenerateAiSuggestionsDto): SuggestionState {
  return {
    targetHours: dto.targetHours || 0,
    alreadyPlannedHours: 0,
    currentHours: 0,
    currentIteration: 0,
    maxIterations: 15,
    allSuggestions: [],
    existingTaskNames: [],
  };
}

/**
 * Reduces a list of database task records to calculate total hours and extract names.
 */
export function calculateExistingTasksHoursAndNames(
  existingTasks: { name: string; pomodorosPlanned?: number }[],
): { hours: number; names: string[] } {
  const hours = existingTasks.reduce((total, task) => {
    return total + (task.pomodorosPlanned || 0) * 0.5;
  }, 0);
  const names = existingTasks.map((task) => task.name);
  return { hours, names };
}

/**
 * Appends new suggestions to the state, updates existing task names list, and updates state.currentHours.
 */
export function addSuggestionsToState(
  state: SuggestionState,
  newSuggestions: AiTaskSuggestionDto[],
): void {
  for (const task of newSuggestions) {
    state.allSuggestions.push(task);
    state.existingTaskNames.push(task.name);
    state.currentHours += (task.pomodoros || 0) * 0.5;
  }
}
