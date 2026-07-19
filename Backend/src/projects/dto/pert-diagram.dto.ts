import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PertDiagramNode {
  @ApiProperty({ description: 'ID of the task/node' })
  id!: string;

  @ApiProperty({ description: 'Name of the task/node' })
  name!: string;

  @ApiProperty({ description: 'Duration of the task in hours' })
  durationHours!: number;

  @ApiProperty({ description: 'Early start time' })
  earlyStart!: number;

  @ApiProperty({ description: 'Early finish time' })
  earlyFinish!: number;

  @ApiProperty({ description: 'Late start time' })
  lateStart!: number;

  @ApiProperty({ description: 'Late finish time' })
  lateFinish!: number;

  @ApiProperty({ description: 'Slack/Float time' })
  slack!: number;

  @ApiProperty({ description: 'Whether the task is on the critical path' })
  isCritical!: boolean;

  @ApiProperty({ description: 'Progress percentage (0-1)' })
  progress!: number;

  @ApiProperty({ description: 'Whether the task has been concluded' })
  isConcluded!: boolean;

  @ApiProperty({ description: 'Task priority level (1-4)' })
  priority!: number;

  @ApiPropertyOptional({ description: 'Parent WBS node ID if linked' })
  parentWbsNodeId?: string;

  @ApiPropertyOptional({ description: 'Full WBS path if linked' })
  wbsPath?: string;

  @ApiProperty({ description: 'Calculated layout X coordinate' })
  x!: number;

  @ApiProperty({ description: 'Calculated layout Y coordinate' })
  y!: number;
}

export class PertDiagramEdge {
  @ApiProperty({ description: 'Edge unique ID' })
  id!: string;

  @ApiProperty({ description: 'Source task/node ID' })
  source!: string;

  @ApiProperty({ description: 'Target task/node ID' })
  target!: string;

  @ApiProperty({
    description: 'Type of CPM relationship',
    enum: ['finish-to-start', 'start-to-start', 'finish-to-finish'],
  })
  relationship!: 'finish-to-start' | 'start-to-start' | 'finish-to-finish';

  @ApiPropertyOptional({ description: 'Reason for the dependency' })
  reason?: string;

  @ApiProperty({ description: 'Whether the dependency was auto-identified' })
  isAutoIdentified!: boolean;

  @ApiProperty({ description: 'Whether the edge connects two critical tasks' })
  isCriticalEdge!: boolean;
}

export class PertDiagramStatistics {
  @ApiProperty({ description: 'Total number of tasks in the network' })
  totalTasks!: number;

  @ApiProperty({ description: 'Number of critical tasks' })
  criticalTasks!: number;

  @ApiProperty({ description: 'Percentage of tasks on the critical path' })
  criticalPercent!: number;

  @ApiProperty({ description: 'Total dependencies/edges' })
  totalEdges!: number;

  @ApiProperty({ description: 'Maximum potential parallelism level' })
  maxParallelism!: number;
}

export class PackageCriticalityDto {
  @ApiProperty({ description: 'ID of the WBS package/node' })
  packageId!: string;

  @ApiPropertyOptional({ description: 'Hierarchy path of the package' })
  packagePath?: string;

  @ApiProperty({ description: 'Total task count in this package' })
  taskCount!: number;

  @ApiProperty({ description: 'Number of critical tasks in this package' })
  criticalTaskCount!: number;

  @ApiProperty({ description: 'Ratio of critical tasks to total tasks (0-1)' })
  criticalRatio!: number;

  @ApiProperty({ description: 'Minimum slack among tasks in this package' })
  minSlack!: number;

  @ApiProperty({ description: 'Critical path duration in hours' })
  criticalDuration!: number;

  @ApiProperty({ description: 'Number of tasks directly on the critical path' })
  criticalPathTaskCount!: number;

  @ApiProperty({ description: 'Weighted risk/criticality score' })
  score!: number;
}

export class PertDiagramDataResponse {
  @ApiProperty({ description: 'ID of the associated project' })
  projectId!: string;

  @ApiProperty({ description: 'Name of the associated project' })
  projectName!: string;

  @ApiProperty({ description: 'Total project duration in hours' })
  projectDurationHours!: number;

  @ApiProperty({ type: [PertDiagramNode], description: 'PERT network nodes' })
  nodes!: PertDiagramNode[];

  @ApiProperty({ type: [PertDiagramEdge], description: 'PERT network edges' })
  edges!: PertDiagramEdge[];

  @ApiProperty({ type: [String], description: 'List of task IDs in the critical path' })
  criticalPath!: string[];

  @ApiProperty({ type: [String], description: 'Actionable scheduling alerts/anomalies' })
  alerts!: string[];

  @ApiProperty({ type: PertDiagramStatistics, description: 'PERT/CPM summary statistics' })
  statistics!: PertDiagramStatistics;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    description: 'Diagnostic metadata',
  })
  diagnostics?: Record<string, any>;

  @ApiPropertyOptional({
    type: [PackageCriticalityDto],
    description: 'Criticality metrics calculated per WBS package',
  })
  packageCriticality?: PackageCriticalityDto[];
}
