export interface ITaskPertEstimate {
  optimistic: number;
  mostLikely: number;
  pessimistic: number;
  expected: number;
  variance: number;
  standardDeviation?: number;
}

export interface ITaskEvmMetrics {
  plannedValue: number;
  earnedValue: number;
  actualCost?: number;
  spi: number;
  cpi?: number;
}

export interface IChecklistItem {
  title: string;
  completed: boolean;
}

export interface ITaskDomain {
  id?: string;
  project?: string;
  name: string;
  description?: string;
  status?: 'todo' | 'in_progress' | 'done';
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  estimatedHours?: number;
  pomodorosPlanned?: number;
  pomodorosExecuted?: number;
  isConcluded?: boolean;
  deadline?: Date;
  pertEstimate?: ITaskPertEstimate;
  evmMetrics?: ITaskEvmMetrics;
  checklist?: IChecklistItem[];
}
