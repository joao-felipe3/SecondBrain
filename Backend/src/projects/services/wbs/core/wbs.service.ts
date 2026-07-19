import { Injectable } from '@nestjs/common';
import { WBSNodeDocument } from '../../../schemas/wbs-node.schema';
import { WBSNodeDto } from '../../../dto/wbs.dto';
import { WbsPersistenceService } from './wbs-persistence.service';
import { WbsGenerationService } from './wbs-generation.service';
import { WbsConversionOrchestrationService } from '../conversion/wbs-conversion-orchestrator.service';
import { getLeafNodesWithPaths } from '../utils/wbs-helpers.util';
import { WbsAiService } from '../../../../ai/services/projects/wbs-ai.service';
import {
  GenerateTasksForSingleLeafParams,
  GenerateWbsInput,
  GenerateTasksForSingleLeafResult,
} from '../../../interfaces';

@Injectable()
export class WBSService {
  constructor(
    private readonly wbsAiService: WbsAiService,
    private readonly persistence: WbsPersistenceService,
    private readonly generation: WbsGenerationService,
    private readonly orchestrator: WbsConversionOrchestrationService,
  ) {}

  validateWBSNode(node: WBSNodeDto): { valid: boolean; reason?: string } {
    const isLeaf = !node.children || node.children.length === 0;
    if (!isLeaf) {
      return { valid: true };
    }

    if (node.estimatedHours < 8) {
      return {
        valid: false,
        reason: `"${node.name}" é muito pequeno (${node.estimatedHours}h). Pacotes de trabalho devem ter no mínimo 8 horas. Combine com outras tarefas ou aumente o escopo.`,
      };
    }

    if (node.estimatedHours > 80) {
      return {
        valid: false,
        reason: `"${node.name}" é muito grande (${node.estimatedHours}h). Pacotes de trabalho devem ter no máximo 80 horas. Decomponha em sub-pacotes menores.`,
      };
    }

    return { valid: true };
  }

  validateWBS(nodes: WBSNodeDto[]): {
    valid: boolean;
    violations: Array<{ valid: boolean; reason?: string }>;
  } {
    const violations: Array<{ valid: boolean; reason?: string }> = [];

    const traverse = (nodeList: WBSNodeDto[]) => {
      for (const node of nodeList) {
        const result = this.validateWBSNode(node);
        if (!result.valid) {
          violations.push(result);
        }
        if (node.children && node.children.length > 0) {
          traverse(node.children);
        }
      }
    };

    traverse(nodes);
    return { valid: violations.length === 0, violations };
  }

  async suggestDecomposition(node: {
    name: string;
    description?: string;
    estimatedHours: number;
  }): Promise<string> {
    return this.wbsAiService.suggestDecomposition(node);
  }

  // Extract all leaf nodes from WBS tree with their full paths
  getLeafNodesWithPaths(nodes: WBSNodeDto[]): Array<{
    node: WBSNodeDto;
    path: string;
    level: number;
  }> {
    return getLeafNodesWithPaths(nodes);
  }

  // Generate a WBS from a SMART objective using Gemini (delegate to generation service)
  async generateWBS(smartObjective: GenerateWbsInput): Promise<WBSNodeDto[]> {
    return this.generation.generate(smartObjective);
  }

  // Generate tasks for a single leaf node only (interactive mode)
  // Delegates to WbsConversionOrchestrationService and enriches result for backward compatibility
  async generateTasksForSingleLeaf(
    params: GenerateTasksForSingleLeafParams,
  ): Promise<GenerateTasksForSingleLeafResult> {
    return this.orchestrator.generateTasksForSingleLeaf(params);
  }

  async saveWBS(projectId: string, nodes: WBSNodeDto[]): Promise<WBSNodeDocument[]> {
    return this.persistence.save(projectId, nodes);
  }

  async getWBS(projectId: string): Promise<WBSNodeDto[]> {
    return this.persistence.get(projectId);
  }
}
