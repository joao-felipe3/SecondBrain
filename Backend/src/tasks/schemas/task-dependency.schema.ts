import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { ApiProperty } from '@nestjs/swagger';

export type TaskDependencyDocument = TaskDependency & Document;

/**
 * Tipos de relação entre tarefas
 * finish-to-start: Tarefa B começa após Tarefa A terminar
 * start-to-start: Tarefa B começa quando Tarefa A começa
 * finish-to-finish: Tarefa B termina quando Tarefa A termina
 */
export enum DependencyType {
  FINISH_TO_START = 'finish-to-start',
  START_TO_START = 'start-to-start',
  FINISH_TO_FINISH = 'finish-to-finish',
}

@Schema({ timestamps: true })
export class TaskDependency {
  @ApiProperty({
    description: 'ID da tarefa que depende',
    example: '507f1f77bcf86cd799439011',
  })
  @Prop({ required: true })
  taskId: string;

  @ApiProperty({
    description: 'ID da tarefa predecessor (predecessora)',
    example: '507f1f77bcf86cd799439012',
  })
  @Prop({ required: true })
  dependsOnTaskId: string;

  @ApiProperty({
    description: 'Tipo de relação de dependência',
    enum: DependencyType,
    example: 'finish-to-start',
  })
  @Prop({
    type: String,
    enum: Object.values(DependencyType),
    default: DependencyType.FINISH_TO_START,
  })
  relationship: DependencyType;

  @ApiProperty({
    description: 'Motivo ou justificativa da dependência',
    example: 'Resultado da Tarefa A é entrada para Tarefa B',
  })
  @Prop({ type: String, default: '' })
  reason?: string;

  @ApiProperty({
    description: 'ID do projeto para facilitar queries',
    example: '507f1f77bcf86cd799439013',
  })
  @Prop({ required: true })
  projectId: string;

  @ApiProperty({
    description: 'Se a dependência foi identificada automaticamente por IA',
    example: true,
  })
  @Prop({ type: Boolean, default: false })
  isAutoIdentified?: boolean;

  @ApiProperty({
    description: 'Timestamps automáticos',
  })
  createdAt?: Date;

  @ApiProperty({
    description: 'Timestamp da última atualização',
  })
  updatedAt?: Date;
}

export const TaskDependencySchema =
  SchemaFactory.createForClass(TaskDependency);

// Índices para performance
TaskDependencySchema.index({ taskId: 1, projectId: 1 });
TaskDependencySchema.index({ dependsOnTaskId: 1, projectId: 1 });
TaskDependencySchema.index({ projectId: 1 });
