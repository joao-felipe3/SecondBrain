import { Injectable } from '@nestjs/common';
import { WBSNodeDto } from '../../dto/wbs.dto';
import { DraftPlanGenerationService } from './draft-plan-generation.service';
import { DraftSinglePassGenerationService } from './draft-single-pass-generation.service';
import { DraftWithPlanGenerationService } from './draft-with-plan-generation.service';

@Injectable()
export class DraftGenerationService {
  constructor(
    private readonly planGeneration: DraftPlanGenerationService,
    private readonly withPlanGeneration: DraftWithPlanGenerationService,
    private readonly singlePassGeneration: DraftSinglePassGenerationService,
  ) {}

  async generateMicroTasksPlanForLeaf(params: {
    project: any;
    node: WBSNodeDto;
    currentPath: string;
    level: number;
    chunkMinutes: number[];
    workflowMix?: Record<string, number>;
    modelOverride?: string;
  }): Promise<{
    themes: Array<{ name: string; criteria?: string }>;
    workflow: string[];
    milestones?: Array<{ name?: string; goal?: string; atMinutes?: number }>;
    constraints?: any;
  }> {
    return this.planGeneration.generateMicroTasksPlanForLeaf(params);
  }

  async generateMicroTasksDraftsForLeaf(
    params: {
      project: any;
      node: WBSNodeDto;
      currentPath: string;
      level: number;
    },
    chunkMinutes: number[],
    modelOverride?: string,
  ): Promise<
    Array<{
      name: string;
      description?: string;
      checklist: string[];
      definitionOfDone: string;
      pomodorosPlanned: number;
      priority: number;
      difficult: number;
      microTaskType?: string;
      themeTag?: string;
      contextTag?: string;
      cognitiveMode?: string;
    }>
  > {
    return this.singlePassGeneration.generateMicroTasksDraftsForLeaf(params, chunkMinutes, modelOverride);
  }

  async generateMicroTasksDraftsForLeafWithPlan(
    params: {
      project: any;
      node: WBSNodeDto;
      currentPath: string;
      level: number;
      plan: {
        themes?: Array<{ name: string; criteria?: string }>;
        workflow?: string[];
        milestones?: Array<{ name?: string; goal?: string; atMinutes?: number }>;
      };
      modelOverride?: string;
    },
    chunkMinutes: number[],
  ): Promise<
    Array<{
      name: string;
      description?: string;
      checklist: string[];
      definitionOfDone: string;
      pomodorosPlanned: number;
      priority: number;
      difficult: number;
      microTaskType?: string;
      themeTag?: string;
      contextTag?: string;
      cognitiveMode?: string;
    }>
  > {
    return this.withPlanGeneration.generateMicroTasksDraftsForLeafWithPlan(params, chunkMinutes);
  }
}
