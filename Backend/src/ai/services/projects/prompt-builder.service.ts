import { Injectable } from '@nestjs/common';
import { WBSNodeDto } from '../../../projects/dto/wbs.dto';
import * as prompts from '../../prompts';

/**
 * Service for building AI prompts for WBS and micro-task generation
 */
@Injectable()
export class PromptBuilderService {
  buildMicroTasksOutlinePrompt(params: {
    project: any;
    node: WBSNodeDto;
    currentPath: string;
    level: number;
    chunkMinutes: number[];
    avoidTaskTitles?: string[];
  }): string {
    return prompts.buildMicroTasksOutlinePrompt(params);
  }

  buildMicroTasksOutlineWithPlanPrompt(params: {
    project: any;
    node: WBSNodeDto;
    currentPath: string;
    level: number;
    chunkMinutes: number[];
    avoidTaskTitles?: string[];
    plan: {
      themes?: Array<{ name: string; criteria?: string }>;
      workflow?: string[];
      milestones?: Array<{ name?: string; goal?: string; atMinutes?: number }>;
    };
  }): string {
    return prompts.buildMicroTasksOutlineWithPlanPrompt(params);
  }

  buildMicroTaskDetailsPrompt(params: {
    project: any;
    node: WBSNodeDto;
    currentPath: string;
    level: number;
    targetMinutes: number;
    outline: {
      name: string;
      microTaskType?: string;
      themeTag?: string;
      contextTag?: string;
      cognitiveMode?: string;
      pomodorosPlanned?: number;
    };
    plan?: {
      themes?: Array<{ name: string; criteria?: string }>;
      workflow?: string[];
    };
  }): string {
    return prompts.buildMicroTaskDetailsPrompt(params);
  }

  buildMicroTaskDetailsBatchPrompt(params: {
    project: any;
    node: WBSNodeDto;
    currentPath: string;
    level: number;
    items: Array<{
      targetMinutes: number;
      outline: {
        name: string;
        microTaskType?: string;
        themeTag?: string;
        contextTag?: string;
        cognitiveMode?: string;
        pomodorosPlanned?: number;
      };
    }>;
    plan?: {
      themes?: Array<{ name: string; criteria?: string }>;
      workflow?: string[];
    };
  }): string {
    return prompts.buildMicroTaskDetailsBatchPrompt(params);
  }

  buildMicroTasksPrompt(params: {
    project: any;
    node: WBSNodeDto;
    currentPath: string;
    level: number;
    chunkMinutes: number[];
    avoidTaskTitles?: string[];
  }): string {
    return prompts.buildMicroTasksPrompt(params);
  }

  buildMicroTasksPlannerPrompt(params: {
    project: any;
    node: WBSNodeDto;
    currentPath: string;
    level: number;
    chunkMinutes: number[];
    themeHints?: string[];
    workflowMix?: Record<string, number>;
  }): string {
    return prompts.buildMicroTasksPlannerPrompt(params);
  }

  buildMicroTasksGeneratorPrompt(params: {
    project: any;
    node: WBSNodeDto;
    currentPath: string;
    level: number;
    chunkMinutes: number[];
    avoidTaskTitles?: string[];
    plan: {
      themes?: Array<{ name: string; criteria?: string }>;
      workflow?: string[];
      milestones?: Array<{ name?: string; goal?: string; atMinutes?: number }>;
    };
  }): string {
    return prompts.buildMicroTasksGeneratorPrompt(params);
  }
}
