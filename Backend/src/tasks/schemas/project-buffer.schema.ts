import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongoSchema } from 'mongoose';

export type ProjectBufferDocument = ProjectBuffer & Document;

@Schema({ timestamps: true, collection: 'project-buffers' })
export class ProjectBuffer {
  @Prop({ required: true, type: MongoSchema.Types.ObjectId })
  projectId!: string;

  @Prop({ required: true, type: Number, min: 0 })
  projectBuffer!: number;

  @Prop({ required: true, type: Number, min: 0, default: 0 })
  consumed!: number;

  @Prop({ required: true, type: Number, min: 0, max: 100, default: 75 })
  threshold!: number;

  @Prop({ type: Number, min: 0 })
  criticalPathDuration?: number;

  @Prop({ type: Number, min: 0 })
  totalVariance?: number;

  @Prop({ type: Number, min: 0 })
  standardDeviation?: number;

  @Prop({ type: [{ taskId: String, variance: Number }], default: [] })
  taskVariances!: Array<{ taskId: string; variance: number }>;

  @Prop({ type: Date })
  createdAt?: Date;

  @Prop({ type: Date })
  updatedAt?: Date;
}

export const ProjectBufferSchema = SchemaFactory.createForClass(ProjectBuffer);

// Índices de performance
ProjectBufferSchema.index({ projectId: 1 });
ProjectBufferSchema.index({ createdAt: 1 });
