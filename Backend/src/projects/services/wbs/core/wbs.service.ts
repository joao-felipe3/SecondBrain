import { Injectable } from '@nestjs/common';
import { WBSNodeDocument } from '../../../schemas/wbs-node.schema';
import { WBSNodeDto } from '../../../dto/wbs.dto';
import { WbsPersistenceService } from './wbs-persistence.service';
import { WbsGenerationService } from './wbs-generation.service';
import { WbsConversionOrchestrationService } from '../conversion/wbs-conversion-orchestrator.service';
import { getLeafNodesWithPaths } from '../utils/wbs-helpers.util';
import { WbsAiService } from '../../../../ai/wbs-ai.service';
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
  ) { }

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
    const {
      leafNode,
      nodePath,
      projectId,
      project,
      tasksService,
      preferences,
      saveTasks = false,
    } = params;

    // Use orchestrator to convert WBS node to tasks
    const result = await this.orchestrator.convertWbsToTasks({
      node: leafNode,
      project,
      path: nodePath,
      options: {
        strategy: 'two-phase',
        modelOverride: preferences?.modelOverride,
        logVerbose: true,
        throwOnError: false,
      },
    });

    if (!result.success && result.error) {
      console.error(`Erro na conversão: ${result.error.stage} - ${result.error.message}`);
      if (result.error.originalError) {
        throw result.error.originalError;
      }
      throw new Error(`WBS conversion failed: ${result.error.message}`);
    }

    // Save tasks if requested
    let generatedTasks = result.tasks;
    if (saveTasks && generatedTasks.length > 0) {
      const tasksToSave = generatedTasks.map((task) => ({
        ...task,
        project: projectId,
      }));

      try {
        if (typeof tasksService.createMany === 'function') {
          const created = await tasksService.createMany(tasksToSave, {
            resolveProject: false,
            recalculateProjectStats: false,
          });
          generatedTasks = created;
        } else {
          // Fallback: sequential create()
          const created: any[] = [];
          for (let i = 0; i < tasksToSave.length; i++) {
            try {
              const createdTask = await tasksService.create(tasksToSave[i]);
              created.push(createdTask);
            } catch (error: any) {
              console.error(`Erro ao criar task:`, error?.message || error);
            }
          }
          generatedTasks = created;
        }
      } catch (error: any) {
        console.error(`Erro ao criar tasks em lote:`, error?.message || error);
      }
    }

    // Calculate summary metrics
    const pomodorosGenerated = generatedTasks.reduce(
      (sum, task) => sum + (task.pomodorosPlanned || 0),
      0,
    );
    const generatedHours = pomodorosGenerated * 0.5;

    return {
      tasks: generatedTasks,
      leafNode,
      nodePath,
      estimatedHours: leafNode.estimatedHours,
      generatedHours,
      pomodorosGenerated,
    };
  }

  async saveWBS(projectId: string, nodes: WBSNodeDto[]): Promise<WBSNodeDocument[]> {
    return this.persistence.save(projectId, nodes);
  }

  async getWBS(projectId: string): Promise<WBSNodeDto[]> {
    return this.persistence.get(projectId);
  }
}
