export interface PertCalculationResult {
  optimistic: number;
  mostLikely: number;
  pessimistic: number;
  expected: number;
  variance: number;
}

export interface BatchMetricInputTask {
  name?: string;
  description?: string;
  themeTag?: string | string[];
  microTaskType?: string;
}

export interface BatchMetricsOptions {
  inferCognitiveType?: (title?: string, description?: string) => string;
}

export interface BatchMetricsResult {
  total: number;
  uniqueTitles: number;
  dupScore: number;
  uniqueTemplates: number;
  similarScore: number;
  verbVariety: number;
  verbsCount: number;
  cognitiveVariety: number;
  cognitiveTypesCount: number;
  themesCount: number;
}

export interface ChunkMinutesParams {
  minutes: number;
  preferredM: number;
  hardMaxM: number;
  minM: number;
}

export interface RefineChunksParams {
  minutes: number;
  chunksList: number[];
  softMaxM: number;
  minChunks: number;
}
