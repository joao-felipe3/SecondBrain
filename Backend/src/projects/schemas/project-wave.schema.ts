import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ProjectWaveDocument = ProjectWave & Document;

@Schema({ timestamps: true })
export class ProjectWave {
  @Prop({ required: true, type: Types.ObjectId })
  projectId!: Types.ObjectId;

  @Prop({ required: true })
  waveNumber!: number;

  @Prop({ required: true })
  startDate!: Date;

  @Prop({ required: true })
  endDate!: Date;

  @Prop({
    required: true,
    enum: ['planned', 'active', 'completed'],
    default: 'planned',
  })
  status!: 'planned' | 'active' | 'completed';

  @Prop({ type: [Types.ObjectId], default: [] })
  taskIds!: Types.ObjectId[];

  @Prop({ type: String, default: null })
  description?: string;
}

export const ProjectWaveSchema = SchemaFactory.createForClass(ProjectWave);

// Índices para performance
ProjectWaveSchema.index({ projectId: 1, waveNumber: 1 });
ProjectWaveSchema.index({ projectId: 1, status: 1 });
