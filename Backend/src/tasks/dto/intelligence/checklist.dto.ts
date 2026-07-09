import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsNumber, IsBoolean } from 'class-validator';
import { ChecklistHistoryProjectRef } from '../../interfaces';

export class FindSimilarTasksDto {
  @ApiProperty({
    description: 'ID do projeto',
    example: 'project-123',
  })
  @IsString()
  @IsNotEmpty()
  projectId: string;

  @ApiProperty({
    description: 'Tipo de micro-tarefa',
    example: 'habit',
    required: false,
  })
  @IsString()
  @IsOptional()
  microTaskType?: string;

  @ApiProperty({
    description: 'Limite de tarefas similares a serem retornadas',
    example: 3,
    required: false,
  })
  @IsNumber()
  @IsOptional()
  limit?: number;
}

export class UpdateChecklistTaskItemDto {
  @ApiProperty({
    description: 'ID da tarefa',
    example: 'task-123',
  })
  @IsString()
  @IsNotEmpty()
  taskId: string;

  @ApiProperty({
    description: 'Índice do item do checklist a ser atualizado',
    example: '0',
  })
  @IsString()
  @IsNotEmpty()
  itemIndex: string;

  @ApiProperty({
    description: 'Novo estado de conclusão do item',
    example: true,
  })
  @IsBoolean()
  @IsNotEmpty()
  completed: boolean;
}

export class GenerateChecklistDto {
  @ApiProperty({
    description: 'Nome da tarefa',
    example: 'Implementar autenticação JWT',
  })
  @IsString()
  @IsNotEmpty()
  taskName: string;

  @ApiProperty({
    description: 'Descrição da tarefa',
    example: 'Criar rotas de login/registro e middleware de verificação',
    required: false,
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    description: 'Tipo de micro-tarefa',
    example: 'subtask',
    required: false,
  })
  @IsString()
  @IsOptional()
  microTaskType?: string;
}

export class GenerateChecklistWithHistoryDto {
  @ApiProperty({
    description: 'Nome da tarefa',
    example: 'Implementar autenticação JWT',
  })
  @IsString()
  @IsNotEmpty()
  taskName: string;

  @ApiProperty({
    description: 'Descrição da tarefa',
    example: 'Criar rotas de login/registro e middleware de verificação',
    required: false,
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    description: 'Tipo de micro-tarefa',
    example: 'subtask',
    required: false,
  })
  @IsString()
  @IsOptional()
  microTaskType?: string;

  @ApiProperty({
    description: 'Referência ao projeto para resgatar histórico',
    required: false,
  })
  @IsOptional()
  projectId?: ChecklistHistoryProjectRef;
}
