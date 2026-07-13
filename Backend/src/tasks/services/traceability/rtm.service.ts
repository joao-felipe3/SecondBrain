import { Injectable } from '@nestjs/common';
import { RequirementDocument, RequirementType, JourneyKind } from '../../schemas/requirement.schema';
import { Task } from '../../entities/task.entity';
import { Requirement } from '../../entities/requirement.entity';
import { RTMValidation, RTMMatrixData } from '../../interfaces/rtm.interface';
import { RTMCrudService } from './rtm-crud.service';
import { RTMAiService } from './rtm-ai.service';
import { RTMValidationService } from './rtm-validation.service';
import {
  MapRequirementToTaskDto,
  SaveRequirementDto,
  AutoMapRequirementsResponseDto,
  GenerateTasksResponseDto,
} from '../../dto';

// Re-export interfaces for backwards compatibility
export { RTMValidation, RTMMatrixData } from '../../interfaces/rtm.interface';

@Injectable()
export class RTMService {
  constructor(
    private readonly crud: RTMCrudService,
    private readonly ai: RTMAiService,
    private readonly validation: RTMValidationService,
  ) {}

  // ===========================================================================
  // CRUD — delegações para RTMCrudService
  // ===========================================================================

  getRequirements(projectId: string): Promise<Requirement[]> {
    return this.crud.getRequirements(projectId);
  }

  saveRequirements(
    projectId: string,
    requirementsData: SaveRequirementDto[],
  ): Promise<Requirement[]> {
    return this.crud.saveRequirements(projectId, requirementsData);
  }

  deleteRequirement(requirementId: string): Promise<boolean> {
    return this.crud.deleteRequirement(requirementId);
  }

  deleteAllRequirements(projectId: string): Promise<number> {
    return this.crud.deleteAllRequirements(projectId);
  }

  mapRequirementToTask(dto: MapRequirementToTaskDto): Promise<Requirement | null> {
    return this.crud.mapRequirementToTask(dto);
  }

  unmapRequirementFromTask(requirementId: string, taskId: string): Promise<Requirement | null> {
    return this.crud.unmapRequirementFromTask(requirementId, taskId);
  }

  // ===========================================================================
  // AI — delegações para RTMAiService
  // ===========================================================================

  generateRequirements(smartObjective: Record<string, string | undefined>): Promise<
    Array<{
      description: string;
      type: RequirementType;
      kind?: JourneyKind;
      ref?: string;
      parentRef?: string;
    }>
  > {
    return this.ai.generateRequirements(smartObjective);
  }

  autoMapRequirementsToTasks(
    projectId: string,
    tasks: Task[],
  ): Promise<AutoMapRequirementsResponseDto> {
    return this.ai.autoMapRequirementsToTasks(projectId, tasks);
  }

  generateTasksForUnmappedRequirements(projectId: string): Promise<GenerateTasksResponseDto> {
    return this.ai.generateTasksForUnmappedRequirements(projectId);
  }

  // ===========================================================================
  // Validation — delegações para RTMValidationService
  // ===========================================================================

  validateRTM(projectId: string): Promise<RTMValidation> {
    return this.validation.validateRTM(projectId);
  }

  getRTMMatrix(projectId: string, tasks: Task[]): Promise<RTMMatrixData> {
    return this.validation.getRTMMatrix(projectId, tasks);
  }
}
