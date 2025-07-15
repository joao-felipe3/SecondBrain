import { Schema, Document } from 'mongoose';

export interface TaskDocument extends Document {
  name: string;
  description?: string;
  deadline: Date;
  pomodorosPlanned: number;
  pomodorosDid?: number;
  priority?: number;
  difficult?: number;
  project?: string;
  experience: number;
  isConcluded: boolean;
  late: boolean;
  prize: number;
  recurrency: string;
  notification: Date;
}

export const TaskSchema = new Schema<TaskDocument>({
  name: { type: String, required: true },
  description: { type: String },
  deadline: { type: Date, required: true },
  pomodorosPlanned: { type: Number, required: true },
  pomodorosDid: { type: Number, default: 0 }, // Adicione isso para sempre ter o campo
  priority: { type: Number },
  difficult: { type: Number },
  project: { type: String },
  experience: { type: Number, required: true },
  isConcluded: { type: Boolean, required: true },
  late: { type: Boolean, required: true },
  prize: { type: Number, required: true },
  recurrency: { type: String, required: true },
  notification: { type: Date },
});
