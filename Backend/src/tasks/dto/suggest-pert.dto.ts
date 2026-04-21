import { IsEnum, IsString, IsOptional, IsNumber } from 'class-validator';

export enum MicroTaskType {
  SUBTASK = 'subtask',
  QUICK = 'quick',
  COMPLEX = 'complex',
  HABIT = 'habit',
}

/**
 * DTO para solicitar sugestões de estimativas PERT
 */
export class SuggestPertDto {
  @IsEnum(MicroTaskType)
  taskType!: MicroTaskType;

  @IsString()
  description!: string;

  @IsOptional()
  @IsString()
  projectContext?: string;
}

/**
 * Resposta contendo sugestões de estimativas PERT
 * Os valores estão em MINUTOS (não horas)
 */
export class PertSuggestionResponseDto {
  /**
   * Estimativa otimista (melhor caso) em minutos
   */
  optimistic!: number;

  /**
   * Estimativa mais provável em minutos
   */
  likely!: number;

  /**
   * Estimativa pessimista (pior caso) em minutos
   */
  pessimistic!: number;

  /**
   * Tempo esperado calculado: TE = (O + 4M + P) / 6
   */
  expectedTime!: number;

  /**
   * Desvio padrão das estimativas
   */
  standardDeviation!: number;

  /**
   * Recomendação sobre a qualidade/confiança da estimativa
   */
  recommendation!: string;

  /**
   * Se as sugestões vieram do LLM (true) ou fallback (false)
   */
  fromLLM!: boolean;
}

/**
 * DTO para atualizar estimativas PERT de uma tarefa existente
 */
export class UpdatePertDto {
  @IsNumber()
  pertOptimisticMinutes!: number;

  @IsNumber()
  pertMostLikelyMinutes!: number;

  @IsNumber()
  pertPessimisticMinutes!: number;
}
