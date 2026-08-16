import { IsString, IsOptional, IsNumber, IsDate } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateProjectDto {
  @ApiProperty({ description: 'Project name' })
  @IsString()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startDate?: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  deadline?: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  totalHoursWorked?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  plannedHours?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  shortTermGoal?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  midTermGoal?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  longTermGoal?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  progressPercentage?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  experience?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  reward?: number;
}
