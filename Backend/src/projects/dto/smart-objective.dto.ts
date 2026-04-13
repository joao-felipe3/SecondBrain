export class SmartObjectiveDto {
  specific: string;      
  measurable: string;    
  achievable: string;    
  relevant: string;      
  temporal: string;      
  weeklyHours?: number;
  summary: string;       
  risks: string[];       
}

export class CatchballRequestDto {
  projectName: string;
  projectDescription: string;
  shortTermGoal?: string;
  midTermGoal?: string;
  longTermGoal?: string;
}

export class CatchballResponseDto {
  questions: string[];
  conversationId: string;
}

export class RefineObjectiveDto {
  conversationId: string;
  answers: string[];
}

export class SuggestAnswerDto {
  conversationId: string;
  questionIndex: number;
  question: string;
  previousAnswers: string[];
}

export class PlanWithAIResponseDto {
  smart: SmartObjectiveDto;
  nextPhase: string;
}
