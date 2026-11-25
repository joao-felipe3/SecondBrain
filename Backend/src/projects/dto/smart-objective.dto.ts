import { IsArray, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SmartObjectiveDto {
  specific!: string;
  measurable!: string;
  achievable!: string;
  relevant!: string;
  temporal!: string;
  weeklyHours?: number;
  summary!: string;
  risks!: string[];
}

/*
 * DTOs de ENTRADA do planejamento com IA. O ValidationPipe global usa `whitelist: true`, que
 * remove do corpo qualquer propriedade sem decorador do class-validator. Sem os decoradores
 * abaixo, o serviço recebia tudo vazio e a IA gerava perguntas e sugestões sem contexto.
 */
export class CatchballRequestDto {
  @IsString()
  @IsNotEmpty()
  projectName!: string;

  /** Pode ser vazia: o projeto nem sempre tem descrição */
  @IsString()
  projectDescription!: string;

  @IsOptional()
  @IsString()
  shortTermGoal?: string;

  @IsOptional()
  @IsString()
  midTermGoal?: string;

  @IsOptional()
  @IsString()
  longTermGoal?: string;
}

export class CatchballResponseDto {
  questions!: string[];
  conversationId!: string;
}

export class RefineObjectiveDto {
  @IsString()
  conversationId!: string;

  @IsArray()
  @IsString({ each: true })
  answers!: string[];
}

export class SuggestAnswerDto {
  @IsString()
  conversationId!: string;

  @IsInt()
  questionIndex!: number;

  @IsString()
  @IsNotEmpty()
  question!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  previousAnswers?: string[];

  /** Contexto do projeto enviado pelo cliente; usado quando a conversa não está mais na memória do servidor */
  @IsOptional()
  @IsString()
  projectContext?: string;
}

export class PlanWithAIResponseDto {
  smart!: SmartObjectiveDto;
  nextPhase!: string;
}
