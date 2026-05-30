import { SchemaFactory, Prop, Schema } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ProjectProgressDocument = ProjectProgress & Document;

@Schema({ timestamps: true })
export class ProjectProgress {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Project' })
  projectId: Types.ObjectId;

  @Prop({ required: true, type: Date })
  date: Date;

  @Prop({ required: true, min: 0 })
  completedHours: number;

  @Prop({ required: true, min: 0 })
  plannedValue: number;

  @Prop({
    required: false,
    enum: ['manual', 'pomodoro', 'completion'],
    default: 'manual',
  })
  source?: 'manual' | 'pomodoro' | 'completion';

  @Prop({ required: false, type: Types.ObjectId, ref: 'Task' })
  taskId?: Types.ObjectId;
}

export const ProjectProgressSchema =
  SchemaFactory.createForClass(ProjectProgress);

ProjectProgressSchema.index({ projectId: 1, date: 1 });
ProjectProgressSchema.index({ projectId: 1, createdAt: -1 });
