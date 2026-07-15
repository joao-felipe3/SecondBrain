import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Requirement as RequirementSchema, RequirementDocument } from '../../schemas/requirement.schema';
import { Requirement } from '../../entities/requirement.entity';
import { RequirementMapper } from '../../mappers/requirement.mapper';
import { Task } from '../../entities/task.entity';
import { GeminiService } from '../../../ai/gemini.service';
import { TasksService } from '../../tasks.service';
import { RTMValidationService } from './rtm-validation.service';
import { AutoMapRequirementsResponseDto } from '../../dto';
import { normalizeKind, getLinkedActions, parseJsonArray, levelForKind } from './utils/rtm.utils';
import {
  buildAutoMapBatchPrompt,
  formatTasksForPrompt,
  processMappingResponse,
  applyFallbackMapping,
} from './utils/rtm-ai.utils';

@Injectable()
export class RTMMappingService {
  private readonly logger = new Logger(RTMMappingService.name);

  constructor(
    @InjectModel(RequirementSchema.name)
    private readonly requirementModel: Model<RequirementDocument>,
    private readonly geminiService: GeminiService,
    private readonly validationService: RTMValidationService,
  ) {}

  // ===========================================================================
  // 1. Auto-mapping: Tasks → Journey Actions
  // ===========================================================================

  async autoMapRequirementsToTasks(
    projectId: string,
    tasks: Task[],
  ): Promise<AutoMapRequirementsResponseDto> {
    const startedAt = Date.now();
    this.logger.log(
      `[auto-map] projectId=${projectId} iniciando auto-vinculo de ${tasks.length} tarefas`,
    );

    try {
      const { allItems, actionItems } = await this.fetchJourneyItems(projectId);

      const earlyExit = this.checkEarlyExitConditions(allItems, actionItems);
      if (earlyExit) return earlyExit;

      const tasksToMap = this.filterUnmappedTasks(tasks, actionItems);
      if (tasksToMap.length === 0) {
        return this.handleNoTasksToMap(projectId);
      }

      const { mappedCount, createdRequirementsCount } = await this.executeMappingFlow({
        projectId,
        tasksToMap,
        actionItems,
        allItems,
      });

      return this.buildSuccessResult({
        projectId,
        mappedCount,
        createdRequirementsCount,
        startedAt,
      });
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`[auto-map] projectId=${projectId} erro: ${err.message}`);
      return this.buildErrorResult(`Erro ao mapear: ${err.message}`);
    }
  }

  private async fetchJourneyItems(projectId: string): Promise<{
    allItems: Requirement[];
    actionItems: Requirement[];
  }> {
    const allItemsDocs = await this.requirementModel.find({ projectId });
    const allItems = allItemsDocs.map(RequirementMapper.toDomain);
    const actionItems = allItems.filter(
      (item: Requirement) => normalizeKind(item.kind || item.type) === 'action',
    );
    return { allItems, actionItems };
  }

  private async handleNoTasksToMap(projectId: string): Promise<AutoMapRequirementsResponseDto> {
    const validation = await this.validationService.validateRTM(projectId);
    return {
      success: true,
      mappedCount: 0,
      createdRequirementsCount: 0,
      coverage: validation.coverage,
      validation,
      message: 'Todas as tarefas já estão vinculadas às ações da jornada.',
      timestamp: new Date().toISOString(),
    };
  }

  private async executeMappingFlow(params: {
    projectId: string;
    tasksToMap: Task[];
    actionItems: Requirement[];
    allItems: Requirement[];
  }): Promise<{ mappedCount: number; createdRequirementsCount: number }> {
    const { projectId, tasksToMap, actionItems, allItems } = params;

    const { mappings, orphanTasks } = await this.runBatchMapping(tasksToMap, actionItems);

    const createdRequirementsCount = await this.handleOrphanTasks({
      orphanTasks,
      allItems,
      projectId,
      mappings,
    });

    const mappedCount = await this.applyMappings(mappings);

    return { mappedCount, createdRequirementsCount };
  }

  private async buildSuccessResult(params: {
    projectId: string;
    mappedCount: number;
    createdRequirementsCount: number;
    startedAt: number;
  }): Promise<AutoMapRequirementsResponseDto> {
    const { projectId, mappedCount, createdRequirementsCount, startedAt } = params;
    const validation = await this.validationService.validateRTM(projectId);
    const elapsed = Date.now() - startedAt;

    this.logger.log(
      `[auto-map] projectId=${projectId} completo: ${mappedCount} tarefas vinculadas, ${createdRequirementsCount} ações criadas, ${validation.coverage}% cobertura - ${elapsed}ms`,
    );

    return {
      success: true,
      mappedCount,
      createdRequirementsCount,
      coverage: validation.coverage,
      validation,
      message: `Auto-vínculo concluído: ${mappedCount} tarefa(s) vinculada(s) + ${createdRequirementsCount} ação(ões) criada(s). Cobertura: ${validation.coverage}%`,
      timestamp: new Date().toISOString(),
    };
  }

  // ===========================================================================
  // Private helpers — auto-mapping
  // ===========================================================================

  private checkEarlyExitConditions(
    allItems: Requirement[],
    actionItems: Requirement[],
  ): AutoMapRequirementsResponseDto | null {
    if (allItems.length === 0) {
      return {
        success: false,
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
        timestamp: new Date().toISOString(),
      };
    }
    if (actionItems.length === 0) {
      return {
        success: false,
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
        timestamp: new Date().toISOString(),
      };
    }
    return null;
  }

  private filterUnmappedTasks(tasks: Task[], actionItems: Requirement[]): Task[] {
    const alreadyMappedIds = new Set<string>();
    for (const item of actionItems) {
      for (const taskId of getLinkedActions(item)) {
        alreadyMappedIds.add(String(taskId));
      }
    }
    return tasks.filter((task) => !alreadyMappedIds.has(String(task.id)));
  }

  private async runBatchMapping(
    tasksToMap: Task[],
    actionItems: Requirement[],
  ): Promise<{ mappings: Record<string, string[]>; orphanTasks: Task[] }> {
    const batchSize = 10;
    const mappings: Record<string, string[]> = {};
    const orphanTasks: Task[] = [];
    const actionsDesc = actionItems.map((a) => `[ID: ${a.id}] ${a.description}`).join('\n');

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
        applyFallbackMapping(batch, String(actionItems[0].id), mappings);
      }
    }

    return { mappings, orphanTasks };
  }

  private async handleOrphanTasks(params: {
    orphanTasks: Task[];
    allItems: Requirement[];
    projectId: string;
    mappings: Record<string, string[]>;
  }): Promise<number> {
    const { orphanTasks, allItems, projectId, mappings } = params;
    if (orphanTasks.length === 0) return 0;

    const stageItems = allItems.filter(
      (item: Requirement) => normalizeKind(item.kind || item.type) === 'stage',
    );
    const fallbackParent = stageItems.length > 0 ? stageItems[0] : allItems[0];
    const fallbackParentId = fallbackParent ? String(fallbackParent.id) : undefined;

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
        traceableItems: group.map((task) => String(task.id)),
        traceableActionItems: group.map((task) => String(task.id)),
        status: 'satisfied',
      });

      mappings[String(newAction._id)] = group.map((task) => String(task.id));
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

  private buildErrorResult(message: string): AutoMapRequirementsResponseDto {
    return {
      success: false,
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
      timestamp: new Date().toISOString(),
    };
  }
}
