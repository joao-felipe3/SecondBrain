import {
  IsString,
  IsDateString,
  IsEnum,
  IsOptional,
  IsArray,
  IsNumber,
} from 'class-validator';

export class CreateWaveDto {
  @IsNumber()
  waveNumber: number;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

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
