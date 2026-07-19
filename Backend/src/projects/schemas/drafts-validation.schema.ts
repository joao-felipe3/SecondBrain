import { z } from 'zod';
import { MicroTaskDraft, WBSLeafPlanResultDto, MicroTaskOutline } from '../interfaces/drafts.interface';

const safeString = (v: unknown): string => {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return '';
};

const safeStringOrUndefined = (v: unknown): string | undefined => {
  if (v === undefined || v === null) return undefined;
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return undefined;
};

export const plannerSchema: z.ZodType<WBSLeafPlanResultDto> = z
  .object({
    themes: z
      .array(
        z
          .object({
            name: z.string().min(1),
            criteria: z.string().optional(),
          })
          .passthrough(),
      )
      .min(0),
    workflow: z.array(z.string().min(1)).min(1),
    milestones: z
      .array(
        z
          .object({
            name: z.string().optional(),
            goal: z.string().optional(),
            atMinutes: z.number().optional(),
          })
          .passthrough(),
      )
      .optional(),
    constraints: z.record(z.string(), z.any()).optional(),
  })
  .passthrough();

export const draftSchema = z
  .object({
    name: z.string().min(1),
    description: z.preprocess(safeStringOrUndefined, z.string().optional()).optional(),
    checklist: z
      .array(z.preprocess((v) => safeString(v).trim(), z.string().min(1)))
      .min(2)
      .max(8),
    definitionOfDone: z.preprocess((v) => safeString(v).trim(), z.string().min(1)),
    pomodorosPlanned: z.preprocess(
      (v) => (v === undefined || v === null || v === '' ? v : Number(v)),
      z.number().int().min(1).max(6),
    ),
    priority: z.preprocess(
      (v) => (v === undefined || v === null || v === '' ? v : Number(v)),
      z.number().int().min(1).max(4),
    ),
    difficult: z.preprocess(
      (v) => (v === undefined || v === null || v === '' ? v : Number(v)),
      z.number().int().min(1).max(4),
    ),
    microTaskType: z.string().min(1),
    themeTag: z.string().min(1),
    contextTag: z.string().min(1),
    cognitiveMode: z.string().min(1),
    milestoneIndex: z
      .preprocess(
        (v) => (v === undefined || v === null || v === '' ? v : Number(v)),
        z.number().int().min(1),
      )
      .optional(),
  })
  .passthrough();

export const draftsSchema: z.ZodType<MicroTaskDraft[]> = z.array(draftSchema).min(1);

export const draftOutlineSchema = z
  .object({
    name: z.string().min(1),
    pomodorosPlanned: z.preprocess(
      (v) => (v === undefined || v === null || v === '' ? v : Number(v)),
      z.number().int().min(1).max(6),
    ),
    priority: z.preprocess(
      (v) => (v === undefined || v === null || v === '' ? v : Number(v)),
      z.number().int().min(1).max(4),
    ),
    difficult: z.preprocess(
      (v) => (v === undefined || v === null || v === '' ? v : Number(v)),
      z.number().int().min(1).max(4),
    ),
    microTaskType: z.string().min(1),
    themeTag: z.string().min(1),
    contextTag: z.string().min(1),
    cognitiveMode: z.string().min(1),
    milestoneIndex: z
      .preprocess(
        (v) => (v === undefined || v === null || v === '' ? v : Number(v)),
        z.number().int().min(1),
      )
      .optional(),
  })
  .passthrough();

export const draftOutlinesSchema: z.ZodType<MicroTaskOutline[]> = z.array(draftOutlineSchema).min(1);

export const draftDetailsSchema = z
  .object({
    checklist: z
      .array(z.preprocess((v) => safeString(v).trim(), z.string().min(1)))
      .min(2)
      .max(8),
    definitionOfDone: z.preprocess((v) => safeString(v).trim(), z.string().min(1)),
    description: z.preprocess(safeStringOrUndefined, z.string().optional()).optional(),
  })
  .passthrough();
