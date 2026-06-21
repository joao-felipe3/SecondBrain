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
