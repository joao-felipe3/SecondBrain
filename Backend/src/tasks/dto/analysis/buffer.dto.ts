import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsArray, IsNotEmpty } from 'class-validator';
import { BufferTaskMetrics, BufferCalculationResult } from '../../interfaces';

export class CalculateBufferDto {
  @ApiProperty({
    description: 'ID do projeto associado',
    example: 'project-123',
  })
  @IsString()
  @IsNotEmpty()
  projectId: string;

  @ApiProperty({
    description: 'Métricas das tarefas do projeto',
    type: 'array',
  })
  @IsArray()
  tasks: BufferTaskMetrics[];

  @ApiProperty({
    description: 'Caminho crítico contendo os IDs das tarefas',
    example: ['task-1', 'task-2'],
    type: [String],
  })
  @IsArray()
  criticalPath: string[];
}

export class UpdateOrCreateBufferDto {
  projectId: string;
  calculationResult: BufferCalculationResult;
  criticalTasks: BufferTaskMetrics[];
}

