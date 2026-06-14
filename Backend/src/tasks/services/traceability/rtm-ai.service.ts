import { Injectable } from '@nestjs/common';
import { RequirementType, JourneyKind } from '../../schemas/requirement.schema';
import { TaskDocument } from '../../schemas/task.schema';
import { RTMValidation } from '../../interfaces/rtm.interface';
import { RTMJourneyService } from './rtm-journey.service';
import { RTMMappingService } from './rtm-mapping.service';

@Injectable()
export class RTMAiService {
  constructor(
    private readonly journeyService: RTMJourneyService,
    private readonly mappingService: RTMMappingService,
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

  autoMapRequirementsToTasks(
    projectId: string,
    tasks: TaskDocument[],
  ): Promise<{
    mappedCount: number;
    createdRequirementsCount: number;
    coverage: number;
    validation: RTMValidation;
    message: string;
  }> {
    return this.mappingService.autoMapRequirementsToTasks(projectId, tasks);
  }

  generateTasksForUnmappedRequirements(projectId: string): Promise<{
    createdTasksCount: number;
    coverage: number;
    validation: RTMValidation;
    message: string;
  }> {
    return this.mappingService.generateTasksForUnmappedRequirements(projectId);
  }
}
