import { Types } from 'mongoose';

export interface ChecklistValidationResult {
  isValid: boolean;
  reason?: string;
}

export interface TaskHistorySummary {
  name: string;
  description?: string;
  checklist?: Array<{ item: string }>;
}

export type ChecklistHistoryProjectRef =
  | string
  | Types.ObjectId
  | {
      _id: string | Types.ObjectId;
    };
