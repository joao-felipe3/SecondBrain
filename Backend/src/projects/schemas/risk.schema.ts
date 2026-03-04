import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

export type RiskDocument = Risk & Document

@Schema({ timestamps: true })
export class Risk {
  @Prop({ required: true, type: Types.ObjectId })
  projectId: Types.ObjectId

  @Prop({ required: true })
  description: string

  @Prop({ required: true, min: 0, max: 100 })
  probability: number // 0-100 (%)

  @Prop({ required: true, min: 1, max: 5 })
  impact: number // 1-5 (escala de impacto)

  @Prop({
    required: true,
    enum: ['baixa', 'média', 'alta'],
  })
  severity: 'baixa' | 'média' | 'alta'

  @Prop({ type: String, default: null })
  mitigationPlan?: string

  @Prop({
    required: true,
    enum: ['identificado', 'mitigando', 'resolvido', 'aceito'],
    default: 'identificado',
  })
  status: 'identificado' | 'mitigando' | 'resolvido' | 'aceito'

  @Prop({ type: String, default: null })
  owner?: string // URL para referência ao usuário/pessoa responsável

  @Prop({ type: Date, default: null })
  targetResolutionDate?: Date
}

export const RiskSchema = SchemaFactory.createForClass(Risk)

// Índices para performance
RiskSchema.index({ projectId: 1, severity: 1 })
RiskSchema.index({ projectId: 1, status: 1 })
RiskSchema.index({ projectId: 1, createdAt: -1 })
