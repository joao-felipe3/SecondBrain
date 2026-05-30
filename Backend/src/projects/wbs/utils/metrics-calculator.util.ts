/**
 * Calculation utilities for metrics, PERT, chunks, embeddings, etc
 */

import {
  MICRO_TASK_MIN_MINUTES,
  MICRO_TASK_HARD_MAX_MINUTES,
  MICRO_TASK_MAX_PER_LEAF,
  MICRO_TASK_PREFERRED_MINUTES,
} from '../constants/wbs.constants';
import {
  normalizeTitle,
  templateTitle,
  extractVerb,
  normalizePreferredPomodoros,
} from './normalizers.util';
import { WBSNodeDto } from '../../dto/wbs.dto';

/**
 * Compute PERT estimates from minutes
 */
export function computePertFromMinutes(minutes: number): {
  optimistic: number;
  mostLikely: number;
  pessimistic: number;
  expected: number;
  variance: number;
} {
  const base = Math.max(5, Math.round(minutes));
  const optimistic = Math.max(5, Math.round(base * 0.75));
  const mostLikely = Math.max(optimistic, base);
  const pessimistic = Math.max(mostLikely, Math.round(base * 1.5));
  const expected = Math.round((optimistic + 4 * mostLikely + pessimistic) / 6);
  const variance = Number(Math.pow((pessimistic - optimistic) / 6, 2).toFixed(2));

  return { optimistic, mostLikely, pessimistic, expected, variance };
}

/**
 * Estimate total micro-task count from WBS nodes
 */
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

/**
 * Compute how to split total minutes into optimal micro-task chunks
 */
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

  // Minimum chunks needed to respect hard max
  const minChunks = Math.max(1, Math.ceil(minutes / hardMaxM));
  // Prefer smaller chunks (roughly 1–3 pomodoros)
  const preferredChunks = Math.max(1, Math.ceil(minutes / preferredM));
  // Avoid too many chunks per leaf unless required by hard max
  let chunks = Math.min(preferredChunks, MICRO_TASK_MAX_PER_LEAF);
  chunks = Math.max(chunks, minChunks);

  // Also do not create chunks smaller than the minimum size
  const maxChunksByMin = Math.max(1, Math.floor(minutes / minM));
  chunks = Math.min(chunks, maxChunksByMin);
  chunks = Math.max(chunks, minChunks);

  // Distribute minutes as evenly as possible
  let base = Math.floor(minutes / chunks);
  let remainder = minutes % chunks;

  // If the base is still too large (can happen with caps), increase chunks as needed
  while (base > hardMaxM) {
    chunks++;
    base = Math.floor(minutes / chunks);
    remainder = minutes % chunks;
  }

  const chunkMinutes: number[] = [];
  for (let i = 0; i < chunks; i++) {
    const m = base + (i < remainder ? 1 : 0);
    chunkMinutes.push(m);
  }

  // If chunks are still very large, try to split down towards the soft max.
  // (but never exceed the max-per-leaf cap unless needed)
  const average = minutes / chunkMinutes.length;
  if (average > softMaxM) {
    const targetChunks = Math.min(
      Math.max(minChunks, Math.ceil(minutes / softMaxM)),
      Math.max(minChunks, MICRO_TASK_MAX_PER_LEAF),
    );
    if (targetChunks > chunkMinutes.length) {
      const newBase = Math.floor(minutes / targetChunks);
      const newRemainder = minutes % targetChunks;
      const next: number[] = [];
      for (let i = 0; i < targetChunks; i++) {
        next.push(newBase + (i < newRemainder ? 1 : 0));
      }
      return next;
    }
  }

  return chunkMinutes;
}

/**
 * Compute batch metrics for quality assessment
 */
export function computeBatchMetrics(
  tasks: Array<{
    name?: string;
    description?: string;
    themeTag?: string;
    microTaskType?: string;
  }>,
  options?: {
    inferCognitiveType?: (title?: string, description?: string) => string;
  },
): {
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
} {
  const total = tasks.length || 0;
  if (!total) {
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

/**
 * Infer cognitive type from title/description
 */
function inferCognitiveTypeDefault(title?: string, description?: string): string {
  const text = `${title || ''} ${description || ''}`.toLowerCase();
  if (/\b(coletar|compilar|baixar|buscar|encontrar|reunir)\b/.test(text)) return 'capture';
  if (/\b(revisar|reler|verificar)\b/.test(text)) return 'review';
  if (/\b(testar|avaliar|quiz|simulad[ao])\b/.test(text)) return 'test';
  if (/\b(criar|redigir|escrever|produzir|implementar)\b/.test(text)) return 'deep';
  return 'other';
}

/**
 * Cosine similarity between two vectors
 */
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

/**
 * Normalize vector to unit length
 */
export function normalizeVector(vec: number[]): number[] {
  const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
  if (!norm) return vec;
  return vec.map((v) => v / norm);
}

/**
 * Simple k-means clustering for embeddings
 */
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
      const next = new Array(c.length).fill(0);
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
