import { Schema, Document } from 'mongoose';

export interface WBSNodeDocument extends Document {
  projectId: string;
  name: string;
  description: string;
  level: number;
  parentId?: string;
  estimatedHours: number;
  status: 'planned' | 'in-progress' | 'completed' | 'on-hold';
  order: number;
  children?: WBSNodeDocument[];
  createdAt: Date;
}

export const WBSNodeSchema = new Schema<WBSNodeDocument>({
  projectId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  description: { type: String, default: '' },
  level: { type: Number, required: true, default: 1 },
  parentId: { type: String, default: null, index: true },
  estimatedHours: { type: Number, required: true, default: 0 },
  status: {
    type: String,
    enum: ['planned', 'in-progress', 'completed', 'on-hold'],
    default: 'planned',
  },
  order: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
});

// Compound index for fast hierarchical queries
WBSNodeSchema.index({ projectId: 1, parentId: 1, order: 1 });
WBSNodeSchema.index({ projectId: 1, level: 1 });
