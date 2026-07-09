import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class MapRequirementToTaskDto {
  @ApiProperty({
    description: 'ID do projeto',
    example: 'project-123',
  })
  @IsString()
  @IsNotEmpty()
  projectId: string;

  @ApiProperty({
    description: 'ID do item da jornada (requisito)',
    example: 'requirement-456',
  })
  @IsString()
  @IsNotEmpty()
  requirementId: string;

  @ApiProperty({
    description: 'ID da tarefa',
    example: 'task-789',
  })
  @IsString()
  @IsNotEmpty()
  taskId: string;
}
