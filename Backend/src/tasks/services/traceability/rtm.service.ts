import { Injectable } from '@nestjs/common';
import {
  Requirement,
  RequirementDocument,
  RequirementType,
  JourneyKind,
} from '../../schemas/requirement.schema';
import { TaskDocument } from '../../schemas/task.schema';
import { RTMValidation, RTMMatrixData } from '../../interfaces/rtm.interface';
import { RTMCrudService } from './rtm-crud.service';
import { RTMAiService } from './rtm-ai.service';
import { RTMValidationService } from './rtm-validation.service';

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

  getRequirements(projectId: string): Promise<RequirementDocument[]> {
    return this.crud.getRequirements(projectId);
  }

  saveRequirements(
    projectId: string,
    requirementsData: Array<{
      description: string;
      type?: string;
      source?: string;
      kind?: string;
      ref?: string;
      parentRef?: string;
    }>,
  ): Promise<RequirementDocument[]> {
    return this.crud.saveRequirements(projectId, requirementsData);
  }

  deleteRequirement(requirementId: string): Promise<boolean> {
    return this.crud.deleteRequirement(requirementId);
  }

  deleteAllRequirements(projectId: string): Promise<number> {
    return this.crud.deleteAllRequirements(projectId);
  }

  mapRequirementToTask(
    projectId: string,
    requirementId: string,
    taskId: string,
  ): Promise<Requirement | null> {
    return this.crud.mapRequirementToTask(projectId, requirementId, taskId);
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
    tasks: TaskDocument[],
  ): Promise<{
    mappedCount: number;
    createdRequirementsCount: number;
    coverage: number;
    validation: RTMValidation;
    message: string;
  }> {
    return this.ai.autoMapRequirementsToTasks(projectId, tasks);
  }

  generateTasksForUnmappedRequirements(projectId: string): Promise<{
    createdTasksCount: number;
    coverage: number;
    validation: RTMValidation;
    message: string;
  }> {
    return this.ai.generateTasksForUnmappedRequirements(projectId);
  }

  // ===========================================================================
  // Validation — delegações para RTMValidationService
  // ===========================================================================

  validateRTM(projectId: string): Promise<RTMValidation> {
    return this.validation.validateRTM(projectId);
  }

  getRTMMatrix(projectId: string, tasks: TaskDocument[]): Promise<RTMMatrixData> {
    return this.validation.getRTMMatrix(projectId, tasks);
  }
}
