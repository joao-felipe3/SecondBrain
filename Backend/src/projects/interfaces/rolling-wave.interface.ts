import { AnyBulkWriteOperation, Types, Model } from 'mongoose';
import { Logger } from '@nestjs/common';
import { Collection } from 'mongodb';
import { TaskDocument } from '../../tasks/schemas/task.schema';

export interface WaveTask {
  id: string;
  hours: number;
  deadlineTime: number | null;
  groupKey: string;
}

export interface WbsNodeFlat {
  id: string;
  parentId?: string;
  level: number;
  name: string;
}

export interface AIPlanWave {
  waveNumber: number;
  name: string;
  description: string;
  durationDays: number;
  focus: string;
  wbsAllocation: Record<string, number>;
  taskIds: string[];
}

export interface AIPlan {
  waves: AIPlanWave[];
  rationale: string;
}

export interface AIWaveStructure {
  recommendedWaveCount: number;
  totalDurationDays: number;
  description: string;
  reasoning: string;
}

export interface WaveReplanSummary {
  waveNumber: number;
  updatedTasks: number;
  skippedConcludedTasks: number;
  effectiveStartDate: string | null;
  effectiveEndDate: string | null;
}

export interface ReplanTaskDeadlinesResult {
  updatedCount: number;
  skippedConcludedCount: number;
  waveCount: number;
  summaries: WaveReplanSummary[];
}

export interface DeterministicWaveResult {
  waveNumber: number;
  startDate: Date;
  endDate: Date;
  status: 'planned';
  taskIds: Types.ObjectId[];
  description: string;
}

export interface DeterministicPartitionResult {
  adjustedDeadline: Date | null;
  waves: DeterministicWaveResult[];
}

export interface TimelineMetrics {
  safeWaveLengthDays: number;
  dayMs: number;
  deadline: Date;
  plannedDurationDays: number;
  effectiveDurationDays: number;
  adjustedDeadline: Date | null;
  waveLengthMs: number;
  waveCount: number;
  waveCapacityHours: number;
}

export interface ReplanCalculationResult {
  updatedCount: number;
  skippedConcludedCount: number;
  bulkOps: AnyBulkWriteOperation<TaskDocument>[];
  summaries: ReplanTaskDeadlinesResult['summaries'];
}

export interface WaveDates {
  effectiveStart: Date;
  effectiveEnd: Date;
}

export interface PendingTasksResult {
  waveUpdatedCount: number;
  bulkOps: AnyBulkWriteOperation<TaskDocument>[];
}

export interface FreshMongoExecuteDto<T> {
  waveModel: Model<any>;
  operation: (collection: Collection) => Promise<T>;
  operationName: string;
  logger: Logger;
  maxAttempts?: number;
}

export interface WaveDataInput {
  waveNumber: number;
  startDate: Date;
  endDate: Date;
  status: 'planned';
  taskIds: Types.ObjectId[];
  description?: string;
}

export interface PersistWaveChunkedDto {
  waveModel: Model<any>;
  projectId: string;
  wave: WaveDataInput;
  logger: Logger;
  chunkSize?: number;
}

export interface DeterministicProjectInput {
  deadline: Date | string;
}

export interface DeterministicTaskInput {
  _id?: string | Types.ObjectId;
  id?: string;
  deadline?: Date | string | null;
  pertExpectedMinutes?: number | null;
  pomodorosPlanned?: number | null;
  parentWbsNodeId?: string | Types.ObjectId | null;
}

export interface DeterministicWbsNodeInput {
  _id?: string | Types.ObjectId;
  id?: string;
  parentId?: string | Types.ObjectId;
  level?: number;
  name?: string;
  children?: DeterministicWbsNodeInput[];
}

export interface PartitionTasksDeterministicDto {
  project: DeterministicProjectInput;
  tasks: DeterministicTaskInput[];
  wbsTree: DeterministicWbsNodeInput[];
  dailyCapacityHours: number;
  waveLengthDays: number;
  today: Date;
}

export interface TimelineMetricsOptions {
  project: DeterministicProjectInput;
  tasks: DeterministicTaskInput[];
  dailyCapacityHours: number;
  waveLengthDays: number;
  today: Date;
}

export interface NormalizeTasksOptions {
  tasks: DeterministicTaskInput[];
  wbsTree: DeterministicWbsNodeInput[];
  today: Date;
  effectiveDurationDays: number;
  dayMs: number;
}

export interface WaveAssignerInterface {
  getTaskIdsForWave(waveIndex: number): Types.ObjectId[];
  getUsedHours(): number[];
  pushToWave(waveIndex: number, task: WaveTask): void;
  findWaveIndexWithCapacity(preferredIndex: number, taskHours: number): number;
  findLeastLoadedWave(): number;
}

export interface AllocateTasksWithDeadlineOptions {
  assigner: WaveAssignerInterface;
  normalizedTasks: WaveTask[];
  today: Date;
  waveLengthMs: number;
  waveCount: number;
}

export interface BuildWavesOptions {
  assigner: WaveAssignerInterface;
  waveCount: number;
  waveLengthMs: number;
  today: Date;
  currentDeadline: Date;
}

export interface ReplanWaveInput {
  status: 'planned' | 'active' | 'completed' | (string & {});
  taskIds: Array<string | Types.ObjectId>;
  waveNumber: number;
  startDate: Date | string;
  endDate: Date | string;
}

export interface ReplanTaskInput {
  _id?: string | Types.ObjectId;
  id?: string;
  deadline?: Date | string | null;
  createdAt?: Date | string;
  isConcluded?: boolean;
  pertExpectedMinutes?: number | null;
  pomodorosPlanned?: number | null;
}

export interface CalculateReplannedDeadlinesDto {
  waves: ReplanWaveInput[];
  tasks: ReplanTaskInput[];
  now: Date;
}

export interface CalculateEffectiveWaveDatesOptions {
  wave: ReplanWaveInput;
  index: number;
  anchorWaveIndex: number;
  cursor: Date;
  dayMs: number;
}

export interface GenerateBulkOpsForPendingTasksOptions {
  pendingTasks: ReplanTaskInput[];
  effectiveStart: Date;
  effectiveEnd: Date;
  dayMs: number;
}

export interface BuildTaskUpdateOpOptions {
  task: ReplanTaskInput;
  cumulativeHours: number;
  totalHours: number;
  availableDays: number;
  effectiveStart: Date;
}

export interface ProcessWaveReplanOptions {
  wave: ReplanWaveInput;
  taskById: Map<string, ReplanTaskInput>;
  anchorWaveIndex: number;
  index: number;
  cursor: Date;
  dayMs: number;
}

export interface WaveReplanResult {
  waveUpdatedCount: number;
  skippedConcludedTasks: number;
  bulkOps: AnyBulkWriteOperation<TaskDocument>[];
  summary: WaveReplanSummary;
  nextCursor: Date;
}

export interface BuildWaveSummaryOptions {
  waveNumber: number;
  updatedTasks: number;
  skippedConcludedTasks: number;
  startDate: Date | null;
  endDate: Date | null;
}

export interface PlanWaveStructureParams {
  project: { name?: string; deadline: Date | string };
  tasks: Array<{ pertExpectedMinutes?: number | null; pomodorosPlanned?: number | null }>;
  dailyCapacityHours: number;
}

export interface PlanWaveGroupingParams {
  project: { name?: string; deadline: Date | string };
  tasks: Array<{
    _id?: string | Types.ObjectId | null;
    id?: string | null;
    name?: string;
    wbsPath?: string;
    pertExpectedMinutes?: number | null;
    pomodorosPlanned?: number | null;
  }>;
  waveCount: number;
  wbsTree: unknown[];
  dailyCapacityHours: number;
}
