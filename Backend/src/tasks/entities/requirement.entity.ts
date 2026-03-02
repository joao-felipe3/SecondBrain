import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongoSchema } from 'mongoose';

export type RequirementDocument = Requirement & Document;

@Schema({ timestamps: true, collection: 'requirements' })
export class Requirement {
  @Prop({ required: true, type: MongoSchema.Types.ObjectId })
  projectId: string;

  @Prop({ required: true, type: String })
  description: string;

  @Prop({ type: String, default: 'functional' })
  type: 'functional' | 'non_functional' | 'constraint';

  @Prop({ type: [MongoSchema.Types.ObjectId], default: [] })
  traceableItems: string[];

  @Prop({ type: String })
  source?: string;

  @Prop({ type: String, enum: ['open', 'satisfied', 'at_risk'], default: 'open' })
  status: 'open' | 'satisfied' | 'at_risk';

  @Prop({ type: Date })
  createdAt?: Date;

  @Prop({ type: Date })
  updatedAt?: Date;
}

export const RequirementSchema = SchemaFactory.createForClass(Requirement);

RequirementSchema.index({ projectId: 1 });
RequirementSchema.index({ projectId: 1, status: 1 });
RequirementSchema.index({ traceableItems: 1 });
