import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ProjectWaveDocument = ProjectWave & Document;

/**
 * Fatia de um pacote WBS alocada numa onda (Rolling Wave).
 * Pacotes grandes são divididos em fatias de até ~20h com um objetivo concreto;
 * as micro-tarefas são geradas por fatia, só para o horizonte próximo.
 */
@Schema({ _id: true })
export class WaveSlice {
  _id?: Types.ObjectId;

  @Prop({ required: true })
  wbsNodeId!: string;

  @Prop({ default: '' })
  wbsPath!: string;

  @Prop({ required: true })
  packageName!: string;

  @Prop({ required: true, min: 1 })
  sliceIndex!: number;

  @Prop({ required: true, min: 1 })
  sliceCount!: number;

  @Prop({ default: '' })
  goal!: string;

  @Prop({ required: true, min: 0 })
  hours!: number;

  @Prop({ required: true, enum: ['planned', 'detailed'], default: 'planned' })
  status!: 'planned' | 'detailed';

  @Prop({ type: [Types.ObjectId], default: [] })
  taskIds!: Types.ObjectId[];
}

export const WaveSliceSchema = SchemaFactory.createForClass(WaveSlice);

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

  /** Fatias de pacotes WBS planejadas para esta onda (vazio em ondas do fluxo antigo). */
  @Prop({ type: [WaveSliceSchema], default: [] })
  slices!: WaveSlice[];
}

export const ProjectWaveSchema = SchemaFactory.createForClass(ProjectWave);

// Índices para performance
ProjectWaveSchema.index({ projectId: 1, waveNumber: 1 });
ProjectWaveSchema.index({ projectId: 1, status: 1 });
