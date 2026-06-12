import { IsBoolean, IsOptional } from 'class-validator';

export class CreateManyTasksOptionsDto {
  @IsOptional()
  @IsBoolean()
  resolveProject?: boolean;

  @IsOptional()
  @IsBoolean()
  recalculateProjectStats?: boolean;

  @IsOptional()
  @IsBoolean()
  ordered?: boolean;
}
