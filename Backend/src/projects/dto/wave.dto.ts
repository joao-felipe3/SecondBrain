import {
  IsString,
  IsDateString,
  IsEnum,
  IsOptional,
  IsArray,
  IsNumber,
  IsObject,
} from 'class-validator';

export class CreateWaveDto {
  @IsNumber()
  waveNumber!: number;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsEnum(['planned', 'active', 'completed'])
  @IsOptional()
  status?: 'planned' | 'active' | 'completed';

  @IsArray()
  @IsOptional()
  taskIds?: string[];

  @IsString()
  @IsOptional()
  description?: string;
}

export class UpdateWaveDto {
  @IsEnum(['planned', 'active', 'completed'])
  @IsOptional()
  status?: 'planned' | 'active' | 'completed';

  @IsArray()
  @IsOptional()
  taskIds?: string[];

  @IsString()
  @IsOptional()
  description?: string;
}

export class GenerateWaveSliceTasksDto {
  // Preferências de geração (modelo forte, nonce de regeneração etc.). Objeto livre.
  @IsObject()
  @IsOptional()
  preferences?: {
    targetPomodoros?: number;
    workflowMix?: Record<string, number>;
    modelOverride?: string;
    regenerateNonce?: string;
  };

  /** Próximas fatias da mesma onda, geradas em segundo plano para a revisão ficar instantânea. */
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  prefetchSliceIds?: string[];
}

export class CommitWaveTasksDto {
  /** Re-baselines feitos na revisão: novas horas por fatia. */
  @IsArray()
  @IsOptional()
  sliceHours?: Array<{ sliceId: string; hours: number }>;
}
