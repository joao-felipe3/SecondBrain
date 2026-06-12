import { IsArray, IsOptional, IsString } from 'class-validator';

export class FindByProjectIdOptionsDto {
  @IsOptional()
  @IsArray()
  taskIds?: string[];

  @IsOptional()
  @IsString()
  parentWbsNodeId?: string;
}
