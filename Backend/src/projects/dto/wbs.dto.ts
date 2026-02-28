import { IsString, IsNumber, IsOptional, IsArray, IsEnum, IsBoolean } from 'class-validator';
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
  estimatedHours: number;

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
  @Type(() => WBSNodeDto)
  nodes: WBSNodeDto[];

  @ApiPropertyOptional({
    description:
      'If true, automatically audits large estimate vs generated-hours discrepancies per leaf and applies the suggested resolution (rebaseline/simplify) before saving tasks.',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  autoResolveDiscrepancies?: boolean;

  @ApiPropertyOptional({
    description:
      'Discrepancy threshold percentage (generated vs estimated) that triggers auto-audit. Default is 60.',
    example: 60,
  })
  @IsOptional()
  @IsNumber()
  autoAuditThresholdPct?: number;

  @ApiPropertyOptional({
    description: 'Conversion preferences for micro-task granularity and workflow mix',
    example: { targetPomodoros: 2, workflowMix: { prepare: 0.2, practice: 0.4, produce: 0.3, test: 0.1 } }
  })
  @IsOptional()
  preferences?: {
    targetPomodoros?: number;
    workflowMix?: Record<string, number>;
  };
}

export class GetLeafNodesDto {
  @ApiProperty({ description: 'WBS nodes to extract leaf nodes from', type: [WBSNodeDto] })
  @IsArray()
  @Type(() => WBSNodeDto)
  nodes: WBSNodeDto[];
}

export class GenerateTasksForLeafDto {
  @ApiProperty({ description: 'The leaf node to generate tasks for' })
  @Type(() => WBSNodeDto)
  leafNode: WBSNodeDto;

  @ApiProperty({ description: 'Path to this node in the WBS tree' })
  @IsString()
  nodePath: string;

  @ApiPropertyOptional({
    description: 'Conversion preferences for micro-task granularity and workflow mix',
    example: { targetPomodoros: 2, workflowMix: { prepare: 0.2, practice: 0.4, produce: 0.3, test: 0.1 } }
  })
  @IsOptional()
  preferences?: {
    targetPomodoros?: number;
    workflowMix?: Record<string, number>;
    modelOverride?: string;
  };

  @ApiPropertyOptional({
    description:
      'Optional list of upcoming leaf nodes to prefetch in background (buffer). Used to make interactive conversion feel instant.',
    type: [Object],
  })
  @IsOptional()
  @IsArray()
  prefetchLeafs?: Array<{
    leafNode: WBSNodeDto;
    nodePath: string;
  }>;

  @ApiPropertyOptional({ description: 'Whether to save tasks to database or return them only' })
  @IsOptional()
  saveTasks?: boolean;
}

export class AuditLeafDiscrepancyDto {
  @ApiProperty({ description: 'The leaf node being audited' })
  @Type(() => WBSNodeDto)
  leafNode: WBSNodeDto;

  @ApiProperty({ description: 'Path to this node in the WBS tree' })
  @IsString()
  nodePath: string;

  @ApiProperty({ description: 'Generated hours total from micro-tasks for this leaf' })
  @IsNumber()
  generatedHours: number;

  @ApiProperty({ description: 'Task summaries for audit', type: [Object] })
  @IsArray()
  tasks: Array<{
    name: string;
    pomodorosPlanned: number;
    priority?: number;
    microTaskType?: string;
    themeTag?: string;
    contextTag?: string;
    cognitiveMode?: string;
  }>;
}
