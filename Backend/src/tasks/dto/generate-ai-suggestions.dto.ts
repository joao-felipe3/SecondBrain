export class GenerateAiSuggestionsDto {
  projectName: string;
  shortTermGoal?: string;
  midTermGoal?: string;
  longTermGoal?: string;
  userPrompt?: string;
}

export class AiTaskSuggestionDto {
  name: string;
  deadline: string; // ISO date string
  pomodoros: number;
  priority: number;
  difficulty: number;
  selected: boolean;
}
