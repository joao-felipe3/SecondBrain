import { Schema, Document, Types } from 'mongoose';

export interface TaskAlertDocument extends Document {
  userId?: Types.ObjectId | string;
  task?: Types.ObjectId;
  project?: Types.ObjectId;
  type: 'warning' | 'error' | 'info';
  message: string;
  recommendation?: string;
  createdAt?: Date;
  isRead?: boolean;
}

export const TaskAlertSchema = new Schema<TaskAlertDocument>({
  userId: { type: Schema.Types.Mixed },
  task: { type: Schema.Types.ObjectId, ref: 'Task' },
  project: { type: Schema.Types.ObjectId, ref: 'Project' },
  type: {
    type: String,
    enum: ['warning', 'error', 'info'],
    default: 'warning',
  },
  message: { type: String, required: true },
  recommendation: { type: String },
  createdAt: { type: Date, default: Date.now },
  isRead: { type: Boolean, default: false },
});

TaskAlertSchema.index({ userId: 1, isRead: 1, createdAt: -1 });
TaskAlertSchema.index({ task: 1, createdAt: -1 });
