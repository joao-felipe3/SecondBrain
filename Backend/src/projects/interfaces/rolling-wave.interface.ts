import { Types } from 'mongoose';

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

export interface ReplanTaskDeadlinesResult {
  updatedCount: number;
  skippedConcludedCount: number;
  waveCount: number;
  summaries: Array<{
    waveNumber: number;
    updatedTasks: number;
    skippedConcludedTasks: number;
    effectiveStartDate: string | null;
    effectiveEndDate: string | null;
  }>;
}

export interface DeterministicPartitionResult {
  adjustedDeadline: Date | null;
  waves: Array<{
    waveNumber: number;
    startDate: Date;
    endDate: Date;
    status: 'planned';
    taskIds: Types.ObjectId[];
    description: string;
  }>;
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
  bulkOps: any[];
  summaries: ReplanTaskDeadlinesResult['summaries'];
}

export interface WaveDates {
  effectiveStart: Date;
  effectiveEnd: Date;
}

export interface PendingTasksResult {
  waveUpdatedCount: number;
  bulkOps: any[];
}
