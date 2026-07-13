import { createHash } from 'crypto';
import {
  MicroTaskOutline,
  MicroTaskDetails,
  MicroTaskDraft,
  DraftBatchItem,
  DraftBatchResult,
  ConcurrencyParams,
} from '../../../interfaces/drafts.interface';
import {
  plannerSchema,
  draftSchema,
  draftsSchema,
  draftOutlineSchema,
  draftOutlinesSchema,
  draftDetailsSchema,
} from '../../../schemas/drafts-validation.schema';

export function validateDraftOutlines(outlines: any[]): any[] {
  const parsed = draftOutlinesSchema.safeParse(outlines);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join('.') || 'root'}: ${i.message}`)
      .join('; ');
    throw new Error(`Outlines inválidos: ${issues}`);
  }
  return parsed.data as any;
}

export function validateDraftDetails(details: any): {
  checklist: string[];
  definitionOfDone: string;
  description?: string;
} {
  const parsed = draftDetailsSchema.safeParse(details);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join('.') || 'root'}: ${i.message}`)
      .join('; ');
    throw new Error(`Details inválidos: ${issues}`);
  }
  return parsed.data as any;
}

export function validatePlannerPlan(plan: any): {
  themes: Array<{ name: string; criteria?: string }>;
  workflow: string[];
  milestones?: Array<{ name?: string; goal?: string; atMinutes?: number }>;
  constraints?: any;
} {
  const parsed = plannerSchema.safeParse(plan);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join('.') || 'root'}: ${i.message}`)
      .join('; ');
    throw new Error(`Plano inválido: ${issues}`);
  }
  return parsed.data;
}

export function validateDrafts(drafts: any[]): any[] {
  const parsed = draftsSchema.safeParse(drafts);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join('.') || 'root'}: ${i.message}`)
      .join('; ');
    throw new Error(`Drafts inválidos: ${issues}`);
  }
  return parsed.data as any;
}

export function safeEnv(name: string): string {
  const v = process.env[name];
  return String(v ?? '').trim();
}

export function isTimingDebugEnabled(): boolean {
  const toggle = String(process.env.WBS_TIMING_DEBUG || '')
    .trim()
    .toLowerCase();
  return toggle === '1' || toggle === 'true' || toggle === 'yes';
}

export function logWithTimestamp(message: string) {
  if (!isTimingDebugEnabled()) return;
  console.log(`[draft-generation][${new Date().toISOString()}] ${message}`);
}

export function getNumericEnv(name: string, fallback: number): number {
  const raw = safeEnv(name);
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

export function isTwoPassEnabled(): boolean {
  const v = String(process.env.WBS_TWO_PASS_DETAILS || '')
    .trim()
    .toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

export function isCacheDebugEnabled(): boolean {
  const v = String(process.env.WBS_CACHE_DEBUG || '')
    .trim()
    .toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

export function getProjectId(project: any): string {
  return String(project?._id || project?.id || project || '').trim();
}

export function hashKey(input: any): string {
  const raw = typeof input === 'string' ? input : JSON.stringify(input);
  return createHash('sha1').update(raw).digest('hex').slice(0, 16);
}

export function buildDraftsCacheKey(params: {
  prefix: 'drafts' | 'drafts_with_plan';
  projectId: string;
  fingerprint: any;
}): string {
  const h = hashKey(params.fingerprint);
  return `${params.prefix}:${params.projectId}:${h}`;
}

export function getWbsGenerationModelOverride(): string | undefined {
  const m = safeEnv('WBS_GEMINI_MODEL') || safeEnv('WBS_FAST_MODEL') || safeEnv('WBS_MODEL_OVERRIDE');
  return m || undefined;
}

export function getDetailsModelOverride(fallback?: string): string | undefined {
  const v = safeEnv('WBS_DETAILS_MODEL');
  return v || fallback;
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const limit = Math.max(1, Math.floor(concurrency || 1));
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  const runOne = async () => {
    while (true) {
      const current = nextIndex++;
      if (current >= items.length) return;
      results[current] = await worker(items[current], current);
    }
  };

  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(limit, items.length); i++) {
    workers.push(runOne());
  }
  await Promise.all(workers);
  return results;
}

export function createBatches(
  outlines: MicroTaskOutline[],
  sliceMinutes: number[],
  batchSize: number,
): DraftBatchItem[] {
  const batches: DraftBatchItem[] = [];
  for (let i = 0; i < outlines.length; i += batchSize) {
    batches.push({
      start: i,
      outlines: outlines.slice(i, i + batchSize),
      minutes: sliceMinutes.slice(i, i + batchSize),
    });
  }
  return batches;
}

export function assembleEnrichedBatches(
  outlines: MicroTaskOutline[],
  batchResults: DraftBatchResult[],
): MicroTaskDraft[] {
  const enriched = new Array<MicroTaskDraft>(outlines.length);
  for (const r of batchResults) {
    for (let j = 0; j < r.detailsList.length; j++) {
      const idx = r.start + j;
      enriched[idx] = { ...outlines[idx], ...r.detailsList[j] } as MicroTaskDraft;
    }
  }
  return enriched;
}

export function isJsonishError(err: any): boolean {
  const msg = String(err?.message || err || '').toLowerCase();
  return (
    msg.includes('json') ||
    msg.includes('truncad') ||
    msg.includes('incomplet') ||
    msg.includes('parse') ||
    msg.includes('array') ||
    msg.includes('object')
  );
}

export function getConcurrencyParams(): ConcurrencyParams {
  const detailsConcurrency = getNumericEnv('WBS_DETAILS_CONCURRENCY', 6);
  const detailsBatchSize = getNumericEnv('WBS_DETAILS_BATCH_SIZE', 1);
  const detailsBatchConcurrency =
    detailsBatchSize > 1
      ? getNumericEnv(
          'WBS_DETAILS_BATCH_CONCURRENCY',
          Math.max(1, Math.floor(detailsConcurrency / Math.max(1, detailsBatchSize))),
        )
      : detailsConcurrency;

  if (detailsBatchSize > 1) {
    logWithTimestamp(
      `details batching enabled batchSize=${detailsBatchSize} batchConcurrency=${detailsBatchConcurrency}`,
    );
  }

  return { detailsConcurrency, detailsBatchSize, detailsBatchConcurrency };
}
