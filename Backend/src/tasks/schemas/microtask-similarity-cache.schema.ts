import { Schema, Document } from 'mongoose';

export interface MicroTaskSimilarityCacheDocument extends Document {
  project?: string;
  taskIdA: string;
  taskIdB: string;
  score: number;
  method?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export const MicroTaskSimilarityCacheSchema = new Schema<MicroTaskSimilarityCacheDocument>({
  project: { type: Schema.Types.ObjectId, ref: 'Project' },
  taskIdA: { type: Schema.Types.ObjectId, ref: 'Task', required: true },
  taskIdB: { type: Schema.Types.ObjectId, ref: 'Task', required: true },
  score: { type: Number, required: true },
  method: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

MicroTaskSimilarityCacheSchema.index({ project: 1, taskIdA: 1, taskIdB: 1 }, { unique: true });
MicroTaskSimilarityCacheSchema.index({ project: 1, score: -1 });
MicroTaskSimilarityCacheSchema.index({ updatedAt: -1 });
