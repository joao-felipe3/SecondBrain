import { Schema, Document, Types } from 'mongoose';

export interface TaskCompletionFeedbackDocument extends Document {
  task: Types.ObjectId; // ObjectId ref to Task
  project?: Types.ObjectId; // ObjectId ref to Project
  modelName?: string; // e.g., 'gemini-2.0-flash'
  promptVersion?: string; // e.g., 'v1'
  inputSnapshot?: any; // snapshot of task details at time of generation
  feedback?: string; // LLM-generated feedback
  error?: string; // if generation failed
  createdAt?: Date;
}

export const TaskCompletionFeedbackSchema =
  new Schema<TaskCompletionFeedbackDocument>({
    task: { type: Schema.Types.ObjectId, ref: 'Task', required: true },
    project: { type: Schema.Types.ObjectId, ref: 'Project' },
    modelName: { type: String },
    promptVersion: { type: String },
    inputSnapshot: { type: Schema.Types.Mixed },
    feedback: { type: String },
    error: { type: String },
    createdAt: { type: Date, default: Date.now },
  });

// Index for quick lookup: find latest feedback for a task
TaskCompletionFeedbackSchema.index({ task: 1, createdAt: -1 });
// Index for project-level analytics
TaskCompletionFeedbackSchema.index({ project: 1, createdAt: -1 });
