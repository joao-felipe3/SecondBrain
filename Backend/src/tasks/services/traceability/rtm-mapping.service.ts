import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Requirement, RequirementDocument } from '../../schemas/requirement.schema';
import { TaskDocument } from '../../schemas/task.schema';
import { CreateTaskDto } from '../../dto/create-task.dto';
import { GeminiService } from '../../../ai/gemini.service';
import { TasksService } from '../../tasks.service';
import { RTMValidation } from '../../interfaces/rtm.interface';
import { RTMValidationService } from './rtm-validation.service';
import { normalizeKind, levelForKind, getLinkedActions, parseJsonArray } from './rtm.utils';
import {
  buildAutoMapBatchPrompt,
  buildGenerateTasksPrompt,
  formatTasksForPrompt,
  processMappingResponse,
  applyFallbackMapping,
} from './rtm-ai.utils';

@Injectable()
export class RTMMappingService {
  private readonly logger = new Logger(RTMMappingService.name);

  constructor(
    @InjectModel(Requirement.name)
    private readonly requirementModel: Model<RequirementDocument>,
    private readonly geminiService: GeminiService,
    @Inject(forwardRef(() => TasksService))
    private readonly tasksService: TasksService,
    private readonly validationService: RTMValidationService,
  ) {}

  // ===========================================================================
  // 1. Auto-mapping: Tasks → Journey Actions
  // ===========================================================================

  async autoMapRequirementsToTasks(
    projectId: string,
    tasks: TaskDocument[],
  ): Promise<{
    mappedCount: number;
    createdRequirementsCount: number;
    coverage: number;
    validation: RTMValidation;
    message: string;
  }> {
    const startedAt = Date.now();
    this.logger.log(
      `[auto-map] projectId=${projectId} iniciando auto-vinculo de ${tasks.length} tarefas`,
    );

    try {
      const allItems = await this.requirementModel.find({ projectId });
      const actionItems = allItems.filter(
        (item: RequirementDocument) => normalizeKind(item.kind || item.type) === 'action',
      );

      const earlyExit = this.checkEarlyExitConditions(allItems, actionItems);
      if (earlyExit) return earlyExit;

      const tasksToMap = this.filterUnmappedTasks(tasks, actionItems);
      if (tasksToMap.length === 0) {
        const validation = await this.validationService.validateRTM(projectId);
        return {
          mappedCount: 0,
          createdRequirementsCount: 0,
          coverage: validation.coverage,
          validation,
          message: 'Todas as tarefas já estão vinculadas às ações da jornada.',
        };
      }

      const { mappings, orphanTasks } = await this.runBatchMapping(
        tasksToMap,
        actionItems,
      );

      const createdRequirementsCount = await this.handleOrphanTasks(
        orphanTasks,
        allItems,
        projectId,
        mappings,
      );

      const mappedCount = await this.applyMappings(mappings);

      const validation = await this.validationService.validateRTM(projectId);
      const elapsed = Date.now() - startedAt;
      this.logger.log(
        `[auto-map] projectId=${projectId} completo: ${mappedCount} tarefas vinculadas, ${createdRequirementsCount} ações criadas, ${validation.coverage}% cobertura - ${elapsed}ms`,
      );

      return {
        mappedCount,
        createdRequirementsCount,
        coverage: validation.coverage,
        validation,
        message: `Auto-vínculo concluído: ${mappedCount} tarefa(s) vinculada(s) + ${createdRequirementsCount} ação(ões) criada(s). Cobertura: ${validation.coverage}%`,
      };
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`[auto-map] projectId=${projectId} erro: ${err.message}`);
      return this.buildErrorResult(`Erro ao mapear: ${err.message}`);
    }
  }

  // ===========================================================================
  // 2. Task Generation for Unmapped Actions
  // ===========================================================================

  async generateTasksForUnmappedRequirements(projectId: string): Promise<{
    createdTasksCount: number;
    coverage: number;
    validation: RTMValidation;
    message: string;
  }> {
    const startedAt = Date.now();
    this.logger.log(`[gen-tasks] projectId=${projectId} gerando tarefas para ações órfãs`);

    try {
      const validation = await this.validationService.validateRTM(projectId);

      if (validation.unmappedRequirements.length === 0) {
        return {
          createdTasksCount: 0,
          coverage: validation.coverage,
          validation,
          message: 'Todos os itens da jornada já possuem rastreabilidade.',
        };
      }

      const requirements = await this.requirementModel.find({
        _id: { $in: validation.unmappedRequirements },
      });

      const actionItems = requirements.filter(
        (item: RequirementDocument) => normalizeKind(item.kind || item.type) === 'action',
      );

      if (actionItems.length === 0) {
        return {
          createdTasksCount: 0,
          coverage: validation.coverage,
          validation,
          message: 'Não há ações órfãs; complete primeiro a hierarquia objetivo -> hábito -> etapa -> ação.',
        };
      }

      const createdTasksCount = await this.generateAndLinkTasks(actionItems, projectId);

      const finalValidation = await this.validationService.validateRTM(projectId);
      const elapsed = Date.now() - startedAt;
      this.logger.log(
        `[gen-tasks] projectId=${projectId} concluído: ${createdTasksCount} tarefas criadas, ${finalValidation.coverage}% cobertura - ${elapsed}ms`,
      );

      return {
        createdTasksCount,
        coverage: finalValidation.coverage,
        validation: finalValidation,
        message: `${createdTasksCount} tarefa(s) gerada(s) para ações órfãs. Cobertura final: ${finalValidation.coverage}%`,
      };
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`[gen-tasks] projectId=${projectId} erro: ${err.message}`);
      return {
        createdTasksCount: 0,
        coverage: 0,
        validation: {
          isValid: false,
          coverage: 0,
          unmappedRequirements: [],
          risks: [`Erro ao gerar tarefas: ${err.message}`],
        },
        message: `Erro: ${err.message}`,
      };
    }
  }

  // ===========================================================================
  // Private helpers — auto-mapping
  // ===========================================================================

  private checkEarlyExitConditions(
    allItems: RequirementDocument[],
    actionItems: RequirementDocument[],
  ) {
    if (allItems.length === 0) {
      return {
        mappedCount: 0,
        createdRequirementsCount: 0,
        coverage: 0,
        validation: {
          isValid: false,
          coverage: 0,
          unmappedRequirements: [],
          risks: ['Nenhum item de jornada encontrado. Gere a estrutura primeiro.'],
        },
        message: 'Falha: nenhum item de jornada disponível para mapear.',
      };
    }
    if (actionItems.length === 0) {
      return {
        mappedCount: 0,
        createdRequirementsCount: 0,
        coverage: 0,
        validation: {
          isValid: false,
          coverage: 0,
          unmappedRequirements: [],
          risks: ['Nenhuma ação disponível para receber tarefas.'],
        },
        message: 'Falha: não há ações na jornada para vincular tarefas.',
      };
    }
    return null;
  }

  private filterUnmappedTasks(
    tasks: TaskDocument[],
    actionItems: RequirementDocument[],
  ): TaskDocument[] {
    const alreadyMappedIds = new Set<string>();
    for (const item of actionItems) {
      for (const taskId of getLinkedActions(item)) {
        alreadyMappedIds.add(String(taskId));
      }
    }
    return tasks.filter((task) => !alreadyMappedIds.has(String(task._id || task.id)));
  }

  private async runBatchMapping(
    tasksToMap: TaskDocument[],
    actionItems: RequirementDocument[],
  ): Promise<{ mappings: Record<string, string[]>; orphanTasks: TaskDocument[] }> {
    const batchSize = 10;
    const mappings: Record<string, string[]> = {};
    const orphanTasks: TaskDocument[] = [];
    const actionsDesc = actionItems.map((a) => `[ID: ${a._id}] ${a.description}`).join('\n');

    for (let i = 0; i < tasksToMap.length; i += batchSize) {
      const batch = tasksToMap.slice(i, i + batchSize);
      const tasksDesc = formatTasksForPrompt(batch);
      const prompt = buildAutoMapBatchPrompt(tasksDesc, actionsDesc);

      try {
        const response = await this.geminiService.generateContent(prompt, {
          responseMimeType: 'application/json',
          temperature: 0.3,
          maxOutputTokens: 2048,
        });

        const mappingArray = parseJsonArray(response);
        if (!mappingArray) throw new Error('Resposta JSON inválida no auto-vínculo');

        processMappingResponse(mappingArray, batch, mappings, orphanTasks);
      } catch {
        applyFallbackMapping(batch, String(actionItems[0]._id), mappings);
      }
    }

    return { mappings, orphanTasks };
  }

  private async handleOrphanTasks(
    orphanTasks: TaskDocument[],
    allItems: RequirementDocument[],
    projectId: string,
    mappings: Record<string, string[]>,
  ): Promise<number> {
    if (orphanTasks.length === 0) return 0;

    const stageItems = allItems.filter(
      (item: RequirementDocument) => normalizeKind(item.kind || item.type) === 'stage',
    );
    const fallbackParent = stageItems.length > 0 ? stageItems[0] : allItems[0];
    const fallbackParentId = fallbackParent ? String(fallbackParent._id) : undefined;

    let createdCount = 0;
    const groupSize = Math.max(1, Math.ceil(orphanTasks.length / 3));

    for (let i = 0; i < orphanTasks.length; i += groupSize) {
      const group = orphanTasks.slice(i, i + groupSize);
      const description = `Ação criada automaticamente para ${group.length} tarefa(s) órfã(s)`;

      const newAction = await this.requirementModel.create({
        projectId,
        description,
        title: description,
        type: 'action',
        kind: 'action',
        hierarchyLevel: levelForKind('action'),
        parentItemId: fallbackParentId,
        source: 'auto_mapped_from_orphan_tasks',
        traceableItems: group.map((task) => String(task._id || task.id)),
        traceableActionItems: group.map((task) => String(task._id || task.id)),
        status: 'satisfied',
      });

      mappings[String(newAction._id)] = group.map((task) => String(task._id || task.id));
      createdCount += 1;
    }

    return createdCount;
  }

  private async applyMappings(mappings: Record<string, string[]>): Promise<number> {
    let mappedCount = 0;
    for (const [itemId, taskIds] of Object.entries(mappings)) {
      if (!taskIds.length) continue;
      try {
        await this.requirementModel.updateOne(
          { _id: new Types.ObjectId(itemId) },
          {
            $addToSet: {
              traceableItems: { $each: taskIds },
              traceableActionItems: { $each: taskIds },
            },
            $set: { status: 'satisfied' },
          },
        );
        mappedCount += taskIds.length;
      } catch (updateError: unknown) {
        const err = updateError as Error;
        this.logger.warn(`[auto-map] erro ao atualizar item ${itemId}: ${err.message}`);
      }
    }
    return mappedCount;
  }

  private buildErrorResult(message: string) {
    return {
      mappedCount: 0,
      createdRequirementsCount: 0,
      coverage: 0,
      validation: {
        isValid: false,
        coverage: 0,
        unmappedRequirements: [] as string[],
        risks: [message],
      },
      message: `Erro: ${message}`,
    };
  }

  // ===========================================================================
  // Private helpers — task generation
  // ===========================================================================

  private async generateAndLinkTasks(
    actionItems: RequirementDocument[],
    projectId: string,
  ): Promise<number> {
    let createdTasksCount = 0;

    for (const req of actionItems) {
      try {
        const prompt = buildGenerateTasksPrompt(req.description);
        const response = await this.geminiService.generateContent(prompt, {
          responseMimeType: 'application/json',
          temperature: 0.35,
          maxOutputTokens: 512,
        });

        const tasksToCreate = parseJsonArray(response);
        if (!tasksToCreate || tasksToCreate.length === 0) continue;

        const taskIds = await this.persistGeneratedTasks(tasksToCreate, projectId, req);
        createdTasksCount += taskIds.length;

        if (taskIds.length > 0) {
          await this.requirementModel.updateOne(
            { _id: new Types.ObjectId(String(req._id)) },
            {
              $addToSet: {
                traceableItems: { $each: taskIds },
                traceableActionItems: { $each: taskIds },
              },
              $set: { status: 'satisfied' },
            },
          );
        }
      } catch (genError: unknown) {
        const err = genError as Error;
        this.logger.warn(`[gen-tasks] erro ao gerar tarefas para ação ${req._id}: ${err.message}`);
      }
    }

    return createdTasksCount;
  }

  private async persistGeneratedTasks(
    tasksToCreate: unknown[],
    projectId: string,
    req: RequirementDocument,
  ): Promise<string[]> {
    const taskIds: string[] = [];

    for (const taskData of tasksToCreate) {
      try {
        const anyTaskData = taskData as Record<string, unknown>;
        const createDto: CreateTaskDto = {
          name: String(anyTaskData.title || 'Nova Tarefa'),
          description: String(anyTaskData.description || ''),
          project: projectId,
          pomodorosPlanned: 3,
          deadline: new Date(),
          isConcluded: false,
          late: false,
          recurrency: 'none',
          notification: new Date(),
          requirementIds: [String(req._id)],
          journeyItemIds: [String(req._id)],
        };

        const newTask = await this.tasksService.create(createDto);
        taskIds.push(String(newTask._id));
      } catch (taskError: unknown) {
        const err = taskError as Error;
        this.logger.warn(`[gen-tasks] erro ao criar tarefa: ${err.message}`);
      }
    }

    return taskIds;
  }
}
