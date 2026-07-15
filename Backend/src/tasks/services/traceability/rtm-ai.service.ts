import { Injectable } from '@nestjs/common';
import { RequirementType, JourneyKind } from '../../schemas/requirement.schema';
import { Task } from '../../entities/task.entity';
import { RTMJourneyService } from './rtm-journey.service';
import { RTMMappingService } from './rtm-mapping.service';
import { RTMTaskGeneratorService } from './rtm-task-generator.service';
import { AutoMapRequirementsResponseDto, GenerateTasksResponseDto } from '../../dto';

@Injectable()
export class RTMAiService {
  constructor(
    private readonly journeyService: RTMJourneyService,
    private readonly mappingService: RTMMappingService,
    private readonly taskGeneratorService: RTMTaskGeneratorService,
  ) {}

  generateRequirements(smartObjective: Record<string, string | undefined>): Promise<
    Array<{
      description: string;
      type: RequirementType;
      kind?: JourneyKind;
      ref?: string;
      parentRef?: string;
    }>
  > {
    return this.journeyService.generateRequirements(smartObjective);
  }

  autoMapRequirementsToTasks(projectId: string, tasks: Task[]): Promise<AutoMapRequirementsResponseDto> {
    return this.mappingService.autoMapRequirementsToTasks(projectId, tasks);
  }

  generateTasksForUnmappedRequirements(projectId: string): Promise<GenerateTasksResponseDto> {
    return this.taskGeneratorService.generateTasksForUnmappedRequirements(projectId);
  }
}
