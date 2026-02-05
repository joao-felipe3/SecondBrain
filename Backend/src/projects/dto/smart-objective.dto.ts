export class SmartObjectiveDto {
  specific: string;      
  measurable: string;    
  achievable: string;    
  relevant: string;      
  temporal: string;      
  summary: string;       
  risks: string[];       
}

export class CatchballRequestDto {
  initialDescription: string;
}

export class CatchballResponseDto {
  questions: string[];
  conversationId: string;
}

export class RefineObjectiveDto {
  conversationId: string;
  answers: string[];
}

export class PlanWithAIResponseDto {
  smart: SmartObjectiveDto;
  nextPhase: string;
}
