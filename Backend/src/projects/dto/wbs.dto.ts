import { IsString, IsNumber, IsOptional, IsArray, IsIn, IsObject, IsDefined } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class WBSNodeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  _id?: string;

  @ApiProperty({ description: 'Name of the WBS node' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ description: 'Description of the WBS node' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'Hierarchy level (1 = project root)' })
  @IsNumber()
  level!: number;

  @ApiPropertyOptional({ description: 'Parent node ID' })
  @IsOptional()
  @IsString()
  parentId?: string;

  @ApiProperty({ description: 'Estimated hours for this work package' })
  @IsNumber()
  estimatedHours!: number;

  @ApiPropertyOptional({ description: 'Sort order' })
  @IsOptional()
  @IsNumber()
  order?: number;

  @ApiPropertyOptional({ description: 'Children nodes' })
  @IsOptional()
  @IsArray()
  @Type(() => WBSNodeDto)
  children?: WBSNodeDto[];
}

export class GenerateWBSDto {
  @ApiProperty({ description: 'SMART objective specific field' })
  @IsString()
  specific!: string;

  @ApiProperty({ description: 'SMART objective measurable field' })
  @IsString()
  measurable!: string;

  @ApiProperty({ description: 'SMART objective achievable field' })
  @IsString()
  achievable!: string;

  @ApiProperty({ description: 'SMART objective relevant field' })
  @IsString()
  relevant!: string;

  @ApiProperty({ description: 'SMART objective temporal field' })
  @IsString()
  temporal!: string;

  @ApiPropertyOptional({ description: 'Executive summary' })
  @IsOptional()
  @IsString()
  summary?: string;

  @ApiPropertyOptional({
    description: 'Weekly available hours for execution capacity',
  })
  @IsOptional()
  @IsNumber()
  weeklyHours?: number;

  @ApiPropertyOptional({
    description: 'Optional explicit global budget hours for WBS generation',
  })
  @IsOptional()
  @IsNumber()
  budgetHours?: number;
}

export class SaveWBSDto {
  @ApiProperty({ description: 'WBS nodes to save', type: [WBSNodeDto] })
  @IsArray()
  @Type(() => WBSNodeDto)
  nodes!: WBSNodeDto[];
}

export class SuggestDecompositionDto {
  @ApiProperty({ description: 'Name of the node to decompose' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ description: 'Description of the node' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'Current estimated hours' })
  @IsNumber()
  estimatedHours!: number;
}

export class ValidateWBSResponseDto {
  @ApiProperty()
  valid!: boolean;

  @ApiPropertyOptional()
  reason?: string;

  @ApiPropertyOptional()
  suggestion?: string;
}

export class CompleteLeafTasksDto {
  @ApiProperty({ description: 'The leaf node that needs more micro-tasks' })
  @IsDefined()
  @IsObject()
  @Type(() => WBSNodeDto)
  leafNode!: WBSNodeDto;

  @ApiProperty({ description: 'Path to this node in the WBS tree' })
  @IsString()
  nodePath!: string;

  @ApiProperty({
    description: 'Names of the micro-tasks the leaf already has (to avoid repeating them)',
  })
  @IsArray()
  @IsString({ each: true })
  existingTaskNames!: string[];

  @ApiProperty({ description: 'Hours still missing to reach the leaf estimate' })
  @IsNumber()
  missingHours!: number;

  @ApiPropertyOptional({ description: 'Conversion preferences (model override etc.)' })
  @IsOptional()
  preferences?: {
    targetPomodoros?: number;
    workflowMix?: Record<string, number>;
    modelOverride?: string;
  };
}

export class AuditLeafDiscrepancyDto {
  // Mesmo caso de GenerateTasksForLeafDto: sem decorador o whitelist remove o campo.
  @ApiProperty({ description: 'The leaf node being audited' })
  @IsDefined()
  @IsObject()
  @Type(() => WBSNodeDto)
  leafNode!: WBSNodeDto;

  @ApiProperty({ description: 'Path to this node in the WBS tree' })
  @IsString()
  nodePath!: string;

  @ApiProperty({
    description: 'Generated hours total from micro-tasks for this leaf',
  })
  @IsNumber()
  generatedHours!: number;

  @ApiProperty({ description: 'Task summaries for audit', type: [Object] })
  @IsArray()
  tasks!: Array<{
    name: string;
    pomodorosPlanned: number;
    priority?: number;
    microTaskType?: string;
    themeTag?: string;
    contextTag?: string;
    cognitiveMode?: string;
  }>;
}

export class ResolveWBSBudgetDto {
  @ApiProperty({
    description: 'WBS nodes to resolve against a budget',
    type: [WBSNodeDto],
  })
  @IsArray()
  @Type(() => WBSNodeDto)
  nodes!: WBSNodeDto[];

  @ApiProperty({ description: 'Target global budget hours for WBS leaves' })
  @IsNumber()
  budgetHours!: number;

  @ApiProperty({
    description: 'Resolution strategy for over-budget trees',
    enum: ['normalize', 'reject'],
  })
  @IsString()
  @IsIn(['normalize', 'reject'])
  strategy!: 'normalize' | 'reject';
}
