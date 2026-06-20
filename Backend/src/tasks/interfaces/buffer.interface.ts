export interface BufferTaskMetrics {
  taskId: string;
  estimatedHours: number;
  variance?: number;
  isCritical?: boolean;
}

export interface BufferStatus {
  total: number;
  consumed: number;
  remaining: number;
  percentageUsed: number;
  isAlert: boolean;
}

export interface BufferAlert {
  severity: 'warning' | 'critical';
  message: string;
  recommendation: string;
  percentageUsed: number;
}

export interface BufferCalculationResult {
  criticalPathDuration: number;
  totalVariance: number;
  standardDeviation: number;
  projectBuffer: number;
}
