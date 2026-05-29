import { IsOptional, IsString } from 'class-validator';

export class GetHabitsDashboardDto {
  @IsOptional()
  @IsString()
  projectId?: string;
}