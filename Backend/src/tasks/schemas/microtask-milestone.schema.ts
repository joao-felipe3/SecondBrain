import { Schema, Document } from 'mongoose';

export interface MicroTaskMilestoneDocument extends Document {
  name: string;
  objective?: string;
  project?: string;
  parentWbsNodeId?: string;
  wbsPath?: string;
  generationBatchId?: string;
  targetEffortMinutes?: number;
  order?: number;
  themeTag?: string;
  createdAt?: Date;
}

export const MicroTaskMilestoneSchema = new Schema<MicroTaskMilestoneDocument>({
  name: { type: String, required: true },
  objective: { type: String },
  project: { type: Schema.Types.ObjectId, ref: 'Project' },
  parentWbsNodeId: { type: String },
  wbsPath: { type: String },
  generationBatchId: { type: String },
  targetEffortMinutes: { type: Number },
  order: { type: Number },
  themeTag: { type: String },
  createdAt: { type: Date, default: Date.now },
});

MicroTaskMilestoneSchema.index({ project: 1, generationBatchId: 1 });
MicroTaskMilestoneSchema.index({ project: 1, parentWbsNodeId: 1 });
MicroTaskMilestoneSchema.index({ project: 1, themeTag: 1 });
