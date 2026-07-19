import { IsString, IsNumber, IsEnum, IsOptional } from 'class-validator';

export class CreateRiskDto {
  @IsString()
  description!: string;

  @IsNumber()
  probability!: number; // 0-100 (%)

  @IsNumber()
  impact!: number; // 1-5

  @IsEnum(['baixa', 'média', 'alta'])
  @IsOptional()
  severity?: 'baixa' | 'média' | 'alta';

  @IsString()
  @IsOptional()
  mitigationPlan?: string;

  @IsEnum(['identificado', 'mitigando', 'resolvido', 'aceito'])
  @IsOptional()
  status?: 'identificado' | 'mitigando' | 'resolvido' | 'aceito';

  @IsString()
  @IsOptional()
  owner?: string;

  @IsString()
  @IsOptional()
  targetResolutionDate?: string;
}

export class UpdateRiskDto {
  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  @IsOptional()
  probability?: number;

  @IsNumber()
  @IsOptional()
  impact?: number;

  @IsEnum(['baixa', 'média', 'alta'])
  @IsOptional()
  severity?: 'baixa' | 'média' | 'alta';

  @IsString()
  @IsOptional()
  mitigationPlan?: string;

  @IsEnum(['identificado', 'mitigando', 'resolvido', 'aceito'])
  @IsOptional()
  status?: 'identificado' | 'mitigando' | 'resolvido' | 'aceito';

  @IsString()
  @IsOptional()
  owner?: string;

  @IsString()
  @IsOptional()
  targetResolutionDate?: string;
}

export class AssessRisksDto {
  @IsString()
  projectDescription!: string;
}
