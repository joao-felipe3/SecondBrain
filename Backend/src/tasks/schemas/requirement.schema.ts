import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongoSchema } from 'mongoose';

export type RequirementDocument = Requirement & Document;
export type RequirementType =
  | 'functional'
  | 'non_functional'
  | 'constraint'
  | 'objective'
  | 'habit'
  | 'stage'
  | 'action';

export type JourneyKind = 'objective' | 'habit' | 'stage' | 'action';

@Schema({ timestamps: true, collection: 'requirements' })
export class Requirement {
  @Prop({ required: true, type: MongoSchema.Types.ObjectId })
  projectId: string;

  @Prop({ required: true, type: String })
  description: string;

  // Campo legado mantido por compatibilidade de contrato
  @Prop({ type: String, default: 'functional' })
  type: RequirementType;

  // Modelo pessoal: objetivo -> hábito -> etapa -> ação
  @Prop({ type: String, enum: ['objective', 'habit', 'stage', 'action'], default: 'action' })
  kind: JourneyKind;

  @Prop({ type: MongoSchema.Types.ObjectId })
  parentItemId?: string;

  @Prop({ type: Number, default: 3 })
  hierarchyLevel: number;

  @Prop({ type: String })
  title?: string;

  // Campo legado mantido por compatibilidade
  @Prop({ type: [MongoSchema.Types.ObjectId], default: [] })
  traceableItems: string[]; // Array de taskIds que rastreiam este requisito

  // Campo novo semântico para ações rastreadas
  @Prop({ type: [MongoSchema.Types.ObjectId], default: [] })
  traceableActionItems: string[];

  @Prop({ type: String })
  source?: string; // De onde veio (ex: "SMART objective", "user input", "IA extracted")

  @Prop({ type: String, enum: ['open', 'satisfied', 'at_risk'], default: 'open' })
  status: 'open' | 'satisfied' | 'at_risk';

  @Prop({ type: Date })
  createdAt?: Date;

  @Prop({ type: Date })
  updatedAt?: Date;
}

export const RequirementSchema = SchemaFactory.createForClass(Requirement);

// Índices de performance
RequirementSchema.index({ projectId: 1 });
RequirementSchema.index({ projectId: 1, status: 1 });
RequirementSchema.index({ traceableItems: 1 });
RequirementSchema.index({ projectId: 1, kind: 1, parentItemId: 1 });
