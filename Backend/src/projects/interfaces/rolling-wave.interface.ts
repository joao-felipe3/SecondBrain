import { AnyBulkWriteOperation, Types, Model } from 'mongoose';
import { Logger } from '@nestjs/common';
import { Collection } from 'mongodb';
import { TaskDomainEntity } from '../../tasks/interfaces/task-contexts.interface';

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

export interface ReplanCalculationResult {
  updatedCount: number;
  skippedConcludedCount: number;
  bulkOps: AnyBulkWriteOperation<TaskDomainEntity>[];
  summaries: ReplanTaskDeadlinesResult['summaries'];
}

export interface WaveDates {
  effectiveStart: Date;
  effectiveEnd: Date;
}

export interface PendingTasksResult {
  waveUpdatedCount: number;
  bulkOps: AnyBulkWriteOperation<TaskDomainEntity>[];
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
  deadline?: Date | string | null;
  name?: string;
  description?: string;
  smartObjective?: { summary?: string } | null;
}

export interface DeterministicTaskInput {
  _id?: string | Types.ObjectId;
  id?: string;
  deadline?: Date | string | null;
  pertExpectedMinutes?: number | null;
  pomodorosPlanned?: number | null;
  parentWbsNodeId?: string | Types.ObjectId | null;
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
  bulkOps: AnyBulkWriteOperation<TaskDomainEntity>[];
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
