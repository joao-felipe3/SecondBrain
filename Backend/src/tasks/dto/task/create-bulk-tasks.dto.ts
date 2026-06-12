import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsIn, IsOptional, IsString } from 'class-validator';
import { CreateTaskDto } from './create-task.dto';

export class BulkAutoDependenciesDto {
  @IsOptional()
  @IsIn(['none', 'within-leaf', 'within-and-between-leafs', 'heuristic-phases', 'ai-per-leaf'])
  mode?: 'none' | 'within-leaf' | 'within-and-between-leafs' | 'heuristic-phases' | 'ai-per-leaf';

  @IsOptional()
  @IsString()
  relationship?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class CreateBulkTasksDto {
  @IsArray()
  @ArrayNotEmpty()
  @Type(() => CreateTaskDto)
  tasks!: CreateTaskDto[];

  @IsOptional()
  @Type(() => BulkAutoDependenciesDto)
  autoDependencies?: BulkAutoDependenciesDto;
}
