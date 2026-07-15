import { Injectable } from '@nestjs/common';
import { DraftPlanGenerationService } from './draft-plan-generation.service';
import { DraftSinglePassGenerationService } from './draft-single-pass-generation.service';
import { DraftWithPlanGenerationService } from './draft-with-plan-generation.service';
import {
  WBSLeafPlanParamsDto,
  WBSLeafPlanResultDto,
  MicroTaskDraft,
  GenerateLeafDraftsDto,
  GenerateLeafDraftsWithPlanDto,
} from '../../interfaces/drafts.interface';

@Injectable()
export class DraftGenerationService {
  constructor(
    private readonly planGeneration: DraftPlanGenerationService,
    private readonly withPlanGeneration: DraftWithPlanGenerationService,
    private readonly singlePassGeneration: DraftSinglePassGenerationService,
  ) {}

  async generateMicroTasksPlanForLeaf(params: WBSLeafPlanParamsDto): Promise<WBSLeafPlanResultDto> {
    return this.planGeneration.generateMicroTasksPlanForLeaf(params);
  }

  async generateMicroTasksDraftsForLeaf(dto: GenerateLeafDraftsDto): Promise<MicroTaskDraft[]> {
    return this.singlePassGeneration.generateMicroTasksDraftsForLeaf(dto);
  }

  async generateMicroTasksDraftsForLeafWithPlan(
    dto: GenerateLeafDraftsWithPlanDto,
  ): Promise<MicroTaskDraft[]> {
    return this.withPlanGeneration.generateMicroTasksDraftsForLeafWithPlan(dto);
  }
}
