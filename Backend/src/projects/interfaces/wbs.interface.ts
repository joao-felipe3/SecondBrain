export interface ValidationResult {
  valid: boolean;
  reason?: string;
  suggestion?: string;
}

export interface BudgetValidationSummary {
  budgetHours: number;
  totalLeafHours: number;
  overBudget: boolean;
  deltaHours: number;
  utilizationPct: number;
  weeklyHours?: number;
  weeksAvailable?: number;
}

export interface MicroTaskDraft {
  name: string;
  description?: string;
  definitionOfDone?: string;
  checklist?: string[];
  pomodorosPlanned?: number;
  priority?: number;
  difficult?: number;
  microTaskType?: string;
  themeTag?: string;
  contextTag?: string;
  cognitiveMode?: string;
  milestoneIndex?: number;
}

export interface BufferEntry<T> {
  value: T;
  exp: number;
  projectId: string;
  createdAt: number;
}
