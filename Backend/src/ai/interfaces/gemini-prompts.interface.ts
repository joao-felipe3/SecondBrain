/**
 * Parameters for generating a simple task checklist.
 */
export interface ChecklistPromptParams {
  taskName: string;
  description?: string;
  microTaskType?: string;
}

/**
 * Parameters for generating a task checklist with historical context.
 */
export interface ChecklistWithHistoryPromptParams extends ChecklistPromptParams {
  historicalContext?: string;
}

/**
 * Parameters for generating PERT (Optimistic, Likely, Pessimistic) estimates.
 */
export interface PertEstimatePromptParams {
  taskType: string;
  description: string;
  projectContext?: string;
}

/**
 * Parameters for generating completion feedback.
 */
export interface CompletionFeedbackPromptParams {
  taskName: string;
  taskDescription?: string;
}

/**
 * Parameters for generating next step suggestions.
 */
export interface NextStepsPromptParams {
  taskName: string;
  feedback: any;
}

/**
 * Parameters for generating a set of task suggestions for a project.
 */
export interface TaskSuggestionsPromptParams {
  projectName: string;
  shortTermGoal?: string;
  midTermGoal?: string;
  longTermGoal?: string;
  userPrompt?: string;
  existingTaskNames?: string[];
  remainingHours?: number;
}
