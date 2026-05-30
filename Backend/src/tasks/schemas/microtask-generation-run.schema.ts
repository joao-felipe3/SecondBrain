import { Schema, Document } from 'mongoose';

export interface MicroTaskGenerationRunDocument extends Document {
  project?: string;
  generationBatchId?: string;
  parentWbsNodeId?: string;
  wbsPath?: string;
  promptVersion?: string;
  modelName?: string;
  input?: any;
  metrics?: any;
  error?: string;
  cost?: number;
  createdAt?: Date;
}

export const MicroTaskGenerationRunSchema = new Schema<MicroTaskGenerationRunDocument>({
  project: { type: Schema.Types.ObjectId, ref: 'Project' },
  generationBatchId: { type: String },
  parentWbsNodeId: { type: String },
  wbsPath: { type: String },
  promptVersion: { type: String },
  modelName: { type: String },
  input: { type: Schema.Types.Mixed },
  metrics: { type: Schema.Types.Mixed },
  error: { type: String },
  cost: { type: Number },
  createdAt: { type: Date, default: Date.now },
});

MicroTaskGenerationRunSchema.index({ project: 1, generationBatchId: 1 });
MicroTaskGenerationRunSchema.index({ project: 1, parentWbsNodeId: 1 });
MicroTaskGenerationRunSchema.index({ project: 1, createdAt: -1 });
