import { Schema, Document } from 'mongoose';

export interface TaskDocument extends Document {
  name: string;
  description?: string;
  definitionOfDone?: string;
  deadline: Date;
  pomodorosPlanned: number;
  pomodorosDid?: number;
  priority?: number;
  difficult?: number;
  project?: string;
  parentWbsNodeId?: string;
  wbsPath?: string;
  generationBatchId?: string;
  milestoneId?: string;
  experience: number;
  isConcluded: boolean;
  late: boolean;
  prize: number;
  recurrency: string;
  notification: Date;
  microTaskType?: string;
  cognitiveMode?: string;
  contextTag?: string;
  themeTag?: string[];
}

export const TaskSchema = new Schema<TaskDocument>({
  name: { type: String, required: true },
  description: { type: String },
  definitionOfDone: { type: String },
  deadline: { type: Date, required: true },
  pomodorosPlanned: { type: Number, required: true },
  pomodorosDid: { type: Number, default: 0 },
  priority: { type: Number },
  difficult: { type: Number },
  project: { type: Schema.Types.ObjectId, ref: 'Project' },
  parentWbsNodeId: { type: String },
  wbsPath: { type: String },
  generationBatchId: { type: String },
  milestoneId: { type: String },
  experience: { type: Number, default: 0 }, // Calculado automaticamente
  isConcluded: { type: Boolean, required: true },
  late: { type: Boolean, required: true },
  prize: { type: Number, default: 0 }, // Calculado automaticamente
  recurrency: { type: String, required: true },
  notification: { type: Date },
  microTaskType: { type: String },
  cognitiveMode: { type: String },
  contextTag: { type: String },
  themeTag: { type: [String] },
});

TaskSchema.index({ project: 1, generationBatchId: 1 });
TaskSchema.index({ project: 1, parentWbsNodeId: 1 });
TaskSchema.index({ project: 1, themeTag: 1 });
