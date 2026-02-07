import { IsString, IsNumber, IsOptional, IsArray, ValidateNested, IsEnum, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class WBSNodeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  _id?: string;

  @ApiProperty({ description: 'Name of the WBS node' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: 'Description of the WBS node' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'Hierarchy level (1 = project root)' })
  @IsNumber()
  level: number;

  @ApiPropertyOptional({ description: 'Parent node ID' })
  @IsOptional()
  @IsString()
  parentId?: string;

  @ApiProperty({ description: 'Estimated hours for this work package' })
  @IsNumber()
  @Min(0)
  estimatedHours: number;

  @ApiPropertyOptional({ description: 'Sort order' })
  @IsOptional()
  @IsNumber()
  order?: number;

  @ApiPropertyOptional({ description: 'Children nodes' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WBSNodeDto)
  children?: WBSNodeDto[];
}

export class GenerateWBSDto {
  @ApiProperty({ description: 'SMART objective specific field' })
  @IsString()
  specific: string;

  @ApiProperty({ description: 'SMART objective measurable field' })
  @IsString()
  measurable: string;

  @ApiProperty({ description: 'SMART objective achievable field' })
  @IsString()
  achievable: string;

  @ApiProperty({ description: 'SMART objective relevant field' })
  @IsString()
  relevant: string;

  @ApiProperty({ description: 'SMART objective temporal field' })
  @IsString()
  temporal: string;

  @ApiPropertyOptional({ description: 'Executive summary' })
  @IsOptional()
  @IsString()
  summary?: string;
}

export class SaveWBSDto {
  @ApiProperty({ description: 'WBS nodes to save', type: [WBSNodeDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WBSNodeDto)
  nodes: WBSNodeDto[];
}

export class SuggestDecompositionDto {
  @ApiProperty({ description: 'Name of the node to decompose' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: 'Description of the node' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'Current estimated hours' })
  @IsNumber()
  estimatedHours: number;
}

export class ValidateWBSResponseDto {
  @ApiProperty()
  valid: boolean;

  @ApiPropertyOptional()
  reason?: string;

  @ApiPropertyOptional()
  suggestion?: string;
}

export class ConvertWBSToTasksDto {
  @ApiProperty({ description: 'WBS nodes to convert to tasks', type: [WBSNodeDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WBSNodeDto)
  nodes: WBSNodeDto[];
}
