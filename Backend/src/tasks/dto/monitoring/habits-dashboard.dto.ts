import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DueTodayHabitDto {
  @ApiProperty({ example: '66b1f2c4d8f3a2e9c4f1a111' })
  id!: string;

  @ApiProperty({ example: 'Ler 20 páginas' })
  name!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: '2026-05-30T00:00:00.000Z',
  })
  deadline!: Date | null;
}

export class HabitSummaryDto {
  @ApiProperty({ example: '66b1f2c4d8f3a2e9c4f1a111' })
  id!: string;

  @ApiProperty({ example: 'Treinar' })
  name!: string;

  @ApiProperty({ example: 'todo' })
  status!: string;

  @ApiProperty({ example: 5 })
  currentStreak!: number;

  @ApiProperty({ example: 12 })
  longestStreak!: number;

  @ApiProperty({ example: 80 })
  aderencePercent!: number;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: '2026-05-29T00:00:00.000Z',
  })
  lastCompletedDate!: Date | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: '2026-05-30T00:00:00.000Z',
  })
  deadline!: Date | null;
}

export class GetHabitsDashboardResponseDto {
  @ApiPropertyOptional({ example: '66b1f2c4d8f3a2e9c4f1a111' })
  projectId?: string;

  @ApiProperty({ example: 8 })
  totalHabits!: number;

  @ApiProperty({ example: 6 })
  activeHabits!: number;

  @ApiProperty({ example: 72 })
  averageAderencePercent!: number;

  @ApiProperty({ example: 3 })
  streaksOver7Days!: number;

  @ApiProperty({ example: 2 })
  dueTodayCount!: number;

  @ApiProperty({ type: [DueTodayHabitDto] })
  dueTodayHabits!: DueTodayHabitDto[];

  @ApiProperty({ type: [HabitSummaryDto] })
  habits!: HabitSummaryDto[];
}
