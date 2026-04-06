import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

export type XMatrixSnapshotDocument = XMatrixSnapshot & Document

@Schema({ timestamps: true })
export class XMatrixSnapshot {
  @Prop({ required: true, type: Types.ObjectId, index: true, unique: true })
  projectId: Types.ObjectId

  @Prop({ type: Object, required: true })
  data: Record<string, any>
}

export const XMatrixSnapshotSchema = SchemaFactory.createForClass(XMatrixSnapshot)
XMatrixSnapshotSchema.index({ projectId: 1 }, { unique: true })
