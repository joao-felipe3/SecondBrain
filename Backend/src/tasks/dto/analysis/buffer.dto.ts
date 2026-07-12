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

export class BufferHistoryDto {
  @ApiProperty({
    description: 'Data do registro do snapshot do buffer',
    example: '2026-07-11T02:36:56.000Z',
  })
  date: Date;

  @ApiProperty({
    description: 'Quantidade de horas consumidas',
    example: 5.5,
  })
  consumed: number;

  @ApiProperty({
    description: 'Porcentagem utilizada do buffer total',
    example: 32.5,
  })
  percentageUsed: number;
}
