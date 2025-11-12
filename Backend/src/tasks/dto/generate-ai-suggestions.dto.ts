export class GenerateAiSuggestionsDto {
  projectName: string;
  projectId?: string; // ID do projeto para buscar tarefas existentes
  shortTermGoal?: string;
  midTermGoal?: string;
  longTermGoal?: string;
  userPrompt?: string;
  targetHours?: number; // Número de horas que as tarefas devem somar
}

export class AiTaskSuggestionDto {
  name: string;
  deadline: string; // ISO date string
  pomodoros: number;
  priority: number;
  difficulty: number;
  selected: boolean;
}
