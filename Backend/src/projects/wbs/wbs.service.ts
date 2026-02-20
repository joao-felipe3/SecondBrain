import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { WBSNodeDocument } from '../schemas/wbs-node.schema';
import { WBSNodeDto } from '../dto/wbs.dto';
import {
  WbsPersistenceService,
  WbsGenerationService,
  WbsConversionOrchestrationService,
} from './services';
import {
  getLeafNodesWithPaths,
} from './utils/wbs-helpers.util';


export interface ValidationResult {
  valid: boolean;
  reason?: string;
  suggestion?: string;
}

@Injectable()
export class WBSService {
  constructor(
    @InjectModel('WBSNode')
    private readonly wbsNodeModel: Model<WBSNodeDocument>,
    private readonly persistence: WbsPersistenceService,
    private readonly generation: WbsGenerationService,
    private readonly orchestrator: WbsConversionOrchestrationService,
  ) {} 

  
  // Extract all leaf nodes from WBS tree with their full paths
  getLeafNodesWithPaths(nodes: WBSNodeDto[]): Array<{
    node: WBSNodeDto;
    path: string;
    level: number;
  }> {
    return getLeafNodesWithPaths(nodes);
  }


  // Generate a WBS from a SMART objective using Gemini (delegate to generation service)
  async generateWBS(smartObjective: {
    specific: string;
    measurable: string;
    achievable: string;
    relevant: string;
    temporal: string;
    summary?: string;
  }): Promise<WBSNodeDto[]> {
    return this.generation.generate(smartObjective);
  }


  // Generate tasks for a single leaf node only (interactive mode)
  // Delegates to WbsConversionOrchestrationService and enriches result for backward compatibility
  async generateTasksForSingleLeaf(
    leafNode: WBSNodeDto,
    nodePath: string,
    projectId: string,
    project: any,
    tasksService: { create: (dto: any) => Promise<any> },
    preferences?: {
      targetPomodoros?: number;
      workflowMix?: Record<string, number>;
      modelOverride?: string;
    },
    saveTasks: boolean = false,
  ): Promise<{
    tasks: any[];
    leafNode: WBSNodeDto;
    nodePath: string;
    estimatedHours: number;
    generatedHours: number;
    pomodorosGenerated: number;
  }> {

    // Use orchestrator to convert WBS node to tasks
    const result = await this.orchestrator.convertWbsToTasks(
      leafNode,
      project,
      nodePath,
      {
        strategy: 'two-phase', // Orchestrator will fallback to legacy if needed
        modelOverride: preferences?.modelOverride,
        logVerbose: true, // Enable verbose logging for interactive mode
        throwOnError: false, // Don't throw, return error in result
      },
    );

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
      const tasksToSave = generatedTasks.map(task => ({
        ...task,
        project: projectId,
      }));

      try {
        if (typeof (tasksService as any).createMany === 'function') {
          const created = await (tasksService as any).createMany(tasksToSave, {
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
