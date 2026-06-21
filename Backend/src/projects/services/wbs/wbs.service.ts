import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { WBSNodeDocument } from '../../schemas/wbs-node.schema';
import { WBSNodeDto } from '../../dto/wbs.dto';
import { GeminiService } from '../../../ai/gemini.service';
import { WbsPersistenceService } from './wbs-persistence.service';
import { WbsGenerationService } from './wbs-generation.service';
import { WbsConversionOrchestrationService } from './wbs-conversion-orchestrator.service';
import { getLeafNodesWithPaths } from './utils/wbs-helpers.util';

import { ValidationResult } from '../../interfaces';

@Injectable()
export class WBSService {
  constructor(
    @InjectModel('WBSNode')
    private readonly wbsNodeModel: Model<WBSNodeDocument>,
    @Inject(forwardRef(() => GeminiService))
    private readonly geminiService: GeminiService,
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
    const prompt = `Você é um consultor de gestão de projetos especializado em WBS (Work Breakdown Structure).

O seguinte pacote de trabalho viola a regra 8/80 (deve ter entre 8 e 80 horas):

Nome: "${node.name}"
Descrição: "${node.description || 'Sem descrição'}"
Horas Estimadas: ${node.estimatedHours}h

${
  node.estimatedHours > 80
    ? `Este pacote é MUITO GRANDE (${node.estimatedHours}h > 80h). Sugira como decompor em sub-pacotes menores, cada um entre 8-80 horas.`
    : `Este pacote é MUITO PEQUENO (${node.estimatedHours}h < 8h). Sugira como combinar com outras atividades ou expandir o escopo para atingir pelo menos 8 horas.`
}

Retorne APENAS um array JSON com os sub-pacotes sugeridos:
[{
  "name": "Nome do sub-pacote",
  "description": "Descrição",
  "estimatedHours": 20,
  "level": 3,
  "order": 1,
  "children": []
}]`;

    try {
      return await this.geminiService.generateContent(prompt);
    } catch (error) {
      console.error('Erro ao gerar sugestão de decomposição:', error);
      throw new Error('Não foi possível gerar sugestão de decomposição');
    }
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
  async generateWBS(smartObjective: {
    specific: string;
    measurable: string;
    achievable: string;
    relevant: string;
    temporal: string;
    weeklyHours?: number;
    budgetHours?: number;
    weeksAvailable?: number;
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
    const result = await this.orchestrator.convertWbsToTasks(leafNode, project, nodePath, {
      strategy: 'two-phase', // Orchestrator will fallback to legacy if needed
      modelOverride: preferences?.modelOverride,
      logVerbose: true, // Enable verbose logging for interactive mode
      throwOnError: false, // Don't throw, return error in result
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
