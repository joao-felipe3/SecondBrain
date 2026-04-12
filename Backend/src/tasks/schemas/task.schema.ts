import { Schema, Document } from 'mongoose';

export interface TaskDocument extends Document {
  name: string;
  description?: string;
  definitionOfDone?: string;
  checklist?: string[];
  deadline: Date;
  pomodorosPlanned: number;
  pomodorosDid?: number;
  pertOptimisticMinutes?: number;
  pertMostLikelyMinutes?: number;
  pertPessimisticMinutes?: number;
  pertExpectedMinutes?: number;
  pertVariance?: number;
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
  requirementIds?: string[];
  journeyItemIds?: string[];
  rtmRisk?: boolean;
  rtmRiskReason?: string;
  evmProgress?: number;
  evmPlannedValueMinutes?: number;
  evmEarnedValueMinutes?: number;
  evmSchedulePerformanceIndex?: number;
  evmAlert?: string;
  createdAt?: Date;
}

export const TaskSchema = new Schema<TaskDocument>({
  name: { type: String, required: true },
  description: { type: String },
  definitionOfDone: { type: String },
  checklist: { type: [String] },
  // Required, but we provide a default to support AI-generated tasks that omit it.
  deadline: { type: Date, required: true, default: Date.now },
  pomodorosPlanned: { type: Number, required: true },
  pomodorosDid: { type: Number, default: 0 },
  pertOptimisticMinutes: { type: Number },
  pertMostLikelyMinutes: { type: Number },
  pertPessimisticMinutes: { type: Number },
  pertExpectedMinutes: { type: Number },
  pertVariance: { type: Number },
  priority: { type: Number },
  difficult: { type: Number },
  project: { type: Schema.Types.ObjectId, ref: 'Project' },
  parentWbsNodeId: { type: String },
  wbsPath: { type: String },
  generationBatchId: { type: String },
  milestoneId: { type: String },
  experience: { type: Number, default: 0 }, // Calculado automaticamente
  isConcluded: { type: Boolean, required: true, default: false },
  late: { type: Boolean, required: true, default: false },
  prize: { type: Number, default: 0 }, // Calculado automaticamente
  recurrency: { type: String, required: true, default: 'no-recurrence' },
  notification: { type: Date },
  microTaskType: { type: String },
  cognitiveMode: { type: String },
  contextTag: { type: String },
  themeTag: { type: [String] },
  requirementIds: { type: [String] },
  journeyItemIds: { type: [String] },
  rtmRisk: { type: Boolean },
  rtmRiskReason: { type: String },
  evmProgress: { type: Number },
  evmPlannedValueMinutes: { type: Number },
  evmEarnedValueMinutes: { type: Number },
  evmSchedulePerformanceIndex: { type: Number },
  evmAlert: { type: String },
  createdAt: { type: Date, default: Date.now },
});

TaskSchema.index({ project: 1, generationBatchId: 1 });
TaskSchema.index({ project: 1, parentWbsNodeId: 1 });
TaskSchema.index({ project: 1, themeTag: 1 });
