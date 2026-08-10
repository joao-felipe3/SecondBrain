import { Types } from 'mongoose';
import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsDate,
  IsArray,
  IsIn,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ChecklistItemDto {
  @ApiProperty({ description: 'Item text' })
  @IsString()
  item!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  completed?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  order?: number;
}

export class RecurringExceptionDto {
  @Type(() => Date)
  @IsDate()
  date!: Date;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class RecurringRuleDto {
  @IsString()
  frequency!: string;

  @IsNumber()
  interval!: number;

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  daysOfWeek?: number[];

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endDate?: Date;

  @IsOptional()
  @IsArray()
  exceptions?: Array<Date | RecurringExceptionDto>;
}

export class CreateTaskDto {
  @ApiProperty({ description: 'Task title / name' })
  @IsString()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  definitionOfDone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  checklist?: Array<string | ChecklistItemDto>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  pomodorosPlanned?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  pomodorosDid?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  pertOptimisticMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  pertMostLikelyMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  pertPessimisticMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  pertExpectedMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  pertVariance?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  requirementIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  journeyItemIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  rtmRisk?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  rtmRiskReason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  evmProgress?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  evmPlannedValueMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  evmEarnedValueMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  evmSchedulePerformanceIndex?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  evmAlert?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  deadline?: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  priority?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  difficult?: number;

  @ApiPropertyOptional()
  @IsOptional()
  project?: string | Types.ObjectId;

  @ApiPropertyOptional()
  @IsOptional()
  parentTaskId?: string | Types.ObjectId;

  @ApiPropertyOptional()
  @IsOptional()
  parentWbsNodeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  wbsPath?: string;

  @ApiPropertyOptional()
  @IsOptional()
  generationBatchId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  milestoneId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  experience?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isConcluded?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  late?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  prize?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  recurrency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  notification?: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  microTaskType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  parentRecurringId?: string | Types.ObjectId;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isRecurringInstance?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['pending', 'completed', 'skipped'])
  recurringState?: 'pending' | 'completed' | 'skipped';

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => RecurringRuleDto)
  recurringRule?: RecurringRuleDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cognitiveMode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contextTag?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  themeTag?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['todo', 'doing', 'review', 'done'])
  status?: 'todo' | 'doing' | 'review' | 'done';
}

export class RecurringTaskOccurrenceDto extends CreateTaskDto {
  @ApiProperty()
  @IsNumber()
  kanbanOrder!: number;

  @ApiProperty()
  @Type(() => Date)
  @IsDate()
  statusUpdatedAt!: Date;
}
