import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator';
import { DependencyType } from '../../schemas/task-dependency.schema';

export class UpsertDependencyDto {
  @ApiProperty({
    description: 'ID da tarefa dependente (sucessora)',
    example: 'task-123',
  })
  @IsString()
  @IsNotEmpty()
  taskId: string;

  @ApiProperty({
    description: 'ID da tarefa predecessora',
    example: 'task-456',
  })
  @IsString()
  @IsNotEmpty()
  dependsOnTaskId: string;

  @ApiProperty({
    description: 'ID do projeto associado',
    example: 'project-123',
  })
  @IsString()
  @IsNotEmpty()
  projectId: string;

  @ApiProperty({
    description: 'Motivo / explicação da dependência',
    example: 'Dependência técnica devido ao fluxo de dados',
    required: false,
  })
  @IsString()
  @IsOptional()
  reason?: string;

  @ApiProperty({
    description: 'Tipo de relacionamento da dependência',
    enum: DependencyType,
    example: 'finish_to_start',
    required: false,
    default: DependencyType.FINISH_TO_START,
  })
  @IsOptional()
  @IsString()
  relationship?: DependencyType | string = DependencyType.FINISH_TO_START;

  @ApiProperty({
    description: 'Indica se a dependência foi identificada de forma automática',
    example: false,
    required: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isAutoIdentified?: boolean = false;
}
