import {
  MICRO_TASK_MIN_MINUTES,
  MICRO_TASK_HARD_MAX_MINUTES,
  MICRO_TASK_MAX_PER_LEAF,
} from '../constants/wbs.constants';
import {
  normalizeTitle,
  templateTitle,
  extractVerb,
  normalizePreferredPomodoros,
} from './normalizers.util';
import { WBSNodeDto } from '../../../dto/wbs.dto';
import {
  PertCalculationResult,
  BatchMetricInputTask,
  BatchMetricsOptions,
  BatchMetricsResult,
  ChunkMinutesParams,
  RefineChunksParams,
} from '../../../interfaces';

// Compute PERT estimates from minutes
export function computePertFromMinutes(minutes: number): PertCalculationResult {
  const base = Math.max(5, Math.round(minutes));
  const optimistic = Math.max(5, Math.round(base * 0.75));
  const mostLikely = Math.max(optimistic, base);
  const pessimistic = Math.max(mostLikely, Math.round(base * 1.5));
  const expected = Math.round((optimistic + 4 * mostLikely + pessimistic) / 6);
  const variance = Number(Math.pow((pessimistic - optimistic) / 6, 2).toFixed(2));

  return { optimistic, mostLikely, pessimistic, expected, variance };
}

// Estimate total micro-task count from WBS nodes
export function estimateMicroTaskCount(nodes: WBSNodeDto[]): number {
  let count = 0;
  const traverse = (list: WBSNodeDto[]) => {
    for (const node of list) {
      if (!node.children || node.children.length === 0) {
        const totalMinutes = Math.max(0, Math.round((node.estimatedHours || 0) * 60));
        count += computeChunkMinutes(totalMinutes).length;
      } else {
        traverse(node.children);
      }
    }
  };
  traverse(nodes);
  return count;
}

function calculateTargetChunks(params: ChunkMinutesParams): number {
  const { minutes, preferredM, hardMaxM, minM } = params;
  const minChunks = Math.max(1, Math.ceil(minutes / hardMaxM));
  const preferredChunks = Math.max(1, Math.ceil(minutes / preferredM));
  let chunks = Math.min(preferredChunks, MICRO_TASK_MAX_PER_LEAF);
  chunks = Math.max(chunks, minChunks);

  const maxChunksByMin = Math.max(1, Math.floor(minutes / minM));
  chunks = Math.min(chunks, maxChunksByMin);
  return Math.max(chunks, minChunks);
}

function distributeMinutes(minutes: number, chunks: number): number[] {
  const base = Math.floor(minutes / chunks);
  const remainder = minutes % chunks;
  return Array.from({ length: chunks }, (_, i) => base + (i < remainder ? 1 : 0));
}

function refineChunksForSoftMax(params: RefineChunksParams): number[] {
  const { minutes, chunksList, softMaxM, minChunks } = params;
  const average = minutes / chunksList.length;
  if (average <= softMaxM) return chunksList;

  const targetChunks = Math.min(
    Math.max(minChunks, Math.ceil(minutes / softMaxM)),
    Math.max(minChunks, MICRO_TASK_MAX_PER_LEAF),
  );
  if (targetChunks > chunksList.length) {
    return distributeMinutes(minutes, targetChunks);
  }
  return chunksList;
}

// Compute how to split total minutes into optimal micro-task chunks
export function computeChunkMinutes(
  totalMinutes: number,
  options?: {
    preferredPomodoros?: number;
  },
): number[] {
  const minutes = Math.max(1, Math.round(totalMinutes));
  const minM = MICRO_TASK_MIN_MINUTES;
  const preferredPomodoros = normalizePreferredPomodoros(options?.preferredPomodoros);
  const preferredM = preferredPomodoros * 25;
  const softMaxM = Math.min(MICRO_TASK_HARD_MAX_MINUTES, Math.max(preferredM, preferredPomodoros * 40));
  const hardMaxM = MICRO_TASK_HARD_MAX_MINUTES;

  // 1. Calculate target chunk count
  let chunks = calculateTargetChunks({ minutes, preferredM, hardMaxM, minM });

  // 2. Adjust chunk count if base size exceeds hard max (e.g. due to capping/bounds)
  while (Math.floor(minutes / chunks) > hardMaxM) {
    chunks++;
  }

  // 3. Distribute minutes evenly
  const chunkMinutes = distributeMinutes(minutes, chunks);

  // 4. Refine chunks towards soft max if needed
  const minChunks = Math.max(1, Math.ceil(minutes / hardMaxM));
  return refineChunksForSoftMax({ minutes, chunksList: chunkMinutes, softMaxM, minChunks });
}

function createZeroMetrics(): BatchMetricsResult {
  return {
    total: 0,
    uniqueTitles: 0,
    dupScore: 0,
    uniqueTemplates: 0,
    similarScore: 0,
    verbVariety: 0,
    verbsCount: 0,
    cognitiveVariety: 0,
    cognitiveTypesCount: 0,
    themesCount: 0,
  };
}

// Compute batch metrics for quality assessment
export function computeBatchMetrics(
  tasks: BatchMetricInputTask[],
  options?: BatchMetricsOptions,
): BatchMetricsResult {
  const total = tasks.length || 0;
  if (!total) return createZeroMetrics();

  const normalizedTitles = tasks.map((t) => normalizeTitle(t.name));
  const templateTitles = tasks.map((t) => templateTitle(t.name));
  const verbs = tasks.map((t) => extractVerb(t.name));
  const themes = tasks.flatMap((t) => {
    if (Array.isArray(t.themeTag)) return t.themeTag.filter((x) => x);
    if (t.themeTag) return [t.themeTag];
    if (t.microTaskType) return [t.microTaskType];
    return [];
  });

  const inferCognitive = options?.inferCognitiveType || inferCognitiveTypeDefault;
  const cognitiveTypes = tasks.map((t) => {
    const mapped = mapMicroTaskTypeToCognitiveType(t.microTaskType);
    if (mapped) return mapped;
    return inferCognitive(t.name, t.description);
  });

  const uniqueTitles = new Set(normalizedTitles).size;
  const uniqueTemplates = new Set(templateTitles).size;
  const uniqueVerbs = new Set(verbs).size;
  const uniqueThemes = new Set(themes).size;
  const uniqueCognitiveTypes = new Set(cognitiveTypes.filter((t) => t !== 'other')).size;

  const dupScore = 1 - uniqueTitles / total;
  const similarScore = 1 - uniqueTemplates / total;
  const verbVariety = uniqueVerbs / total;
  const cognitiveVariety = uniqueCognitiveTypes / total;

  return {
    total,
    uniqueTitles,
    dupScore,
    uniqueTemplates,
    similarScore,
    verbVariety,
    verbsCount: uniqueVerbs,
    cognitiveVariety,
    cognitiveTypesCount: uniqueCognitiveTypes,
    themesCount: uniqueThemes,
  };
}

function mapMicroTaskTypeToCognitiveType(
  microTaskType?: string,
): 'capture' | 'review' | 'test' | 'deep' | undefined {
  const t = String(microTaskType || '')
    .trim()
    .toLowerCase();
  if (!t) return undefined;

  // Keep this mapping intentionally small and stable; it exists to make metrics reflect the pipeline.
  if (t === 'prepare') return 'capture';
  if (t === 'review' || t === 'consolidate') return 'review';
  if (t === 'test') return 'test';
  if (t === 'produce' || t === 'practice') return 'deep';

  return undefined;
}

// Infer cognitive type from title/description
function inferCognitiveTypeDefault(title?: string, description?: string): string {
  const text = `${title || ''} ${description || ''}`.toLowerCase();
  if (/\b(coletar|compilar|baixar|buscar|encontrar|reunir)\b/.test(text)) return 'capture';
  if (/\b(revisar|reler|verificar)\b/.test(text)) return 'review';
  if (/\b(testar|avaliar|quiz|simulad[ao])\b/.test(text)) return 'test';
  if (/\b(criar|redigir|escrever|produzir|implementar)\b/.test(text)) return 'deep';
  return 'other';
}

// Cosine similarity between two vectors
export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a.length || !b.length || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// Normalize vector to unit length
export function normalizeVector(vec: number[]): number[] {
  const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
  if (!norm) return vec;
  return vec.map((v) => v / norm);
}

// Simple k-means clustering for embeddings
export function kMeansClusters(
  vectors: number[][],
  k: number,
): { clusters: number[][]; centroids: number[][] } {
  const safeK = Math.max(1, Math.min(k, vectors.length));
  const centroids = vectors.slice(0, safeK).map((v) => normalizeVector([...v]));
  const clusters: number[][] = Array.from({ length: safeK }, () => []);

  for (let iter = 0; iter < 6; iter++) {
    for (const c of clusters) c.length = 0;

    vectors.forEach((v, idx) => {
      let best = 0;
      let bestScore = -Infinity;
      centroids.forEach((c, cIdx) => {
        const score = cosineSimilarity(v, c);
        if (score > bestScore) {
          bestScore = score;
          best = cIdx;
        }
      });
      clusters[best].push(idx);
    });

    centroids.forEach((c, cIdx) => {
      const members = clusters[cIdx];
      if (!members.length) return;
      const next: number[] = new Array<number>(c.length).fill(0);
      members.forEach((idx) => {
        const v = vectors[idx];
        for (let i = 0; i < v.length; i++) next[i] += v[i];
      });
      for (let i = 0; i < next.length; i++) next[i] = next[i] / members.length;
      centroids[cIdx] = normalizeVector(next);
    });
  }

  return { clusters, centroids };
}
