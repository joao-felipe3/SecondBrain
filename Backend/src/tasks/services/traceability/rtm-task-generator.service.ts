import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Requirement as RequirementSchema, RequirementDocument } from '../../schemas/requirement.schema';
import { Requirement } from '../../entities/requirement.entity';
import { RequirementMapper } from '../../mappers/requirement.mapper';
import { CreateTaskDto } from '../../dto/task/create-task.dto';
import { GeminiService } from '../../../ai/gemini.service';
import { TasksService } from '../../tasks.service';
import { RTMValidation } from '../../interfaces/rtm.interface';
import { RTMValidationService } from './rtm-validation.service';
import { GenerateTasksResponseDto } from '../../dto';
import { normalizeKind, parseJsonArray } from './utils/rtm.utils';
import { buildGenerateTasksPrompt } from './utils/rtm-ai.utils';

@Injectable()
export class RTMTaskGeneratorService {
  private readonly logger = new Logger(RTMTaskGeneratorService.name);

  constructor(
    @InjectModel(RequirementSchema.name)
    private readonly requirementModel: Model<RequirementDocument>,
    private readonly geminiService: GeminiService,
    @Inject(forwardRef(() => TasksService))
    private readonly tasksService: TasksService,
    private readonly validationService: RTMValidationService,
  ) {}

  // ===========================================================================
  // 1. Task Generation for Unmapped Actions
  // ===========================================================================

  async generateTasksForUnmappedRequirements(projectId: string): Promise<GenerateTasksResponseDto> {
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

      const requirementsDocs = await this.requirementModel.find({
        _id: { $in: validation.unmappedRequirements },
      });
      const requirements = requirementsDocs.map(RequirementMapper.toDomain);

      const actionItems = requirements.filter(
        (item: Requirement) => normalizeKind(item.kind || item.type) === 'action',
      );

      if (actionItems.length === 0) {
        return {
          createdTasksCount: 0,
          coverage: validation.coverage,
          validation,
          message:
            'Não há ações órfãs; complete primeiro a hierarquia objetivo -> hábito -> etapa -> ação.',
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
  // Private helpers
  // ===========================================================================

  private async generateAndLinkTasks(actionItems: Requirement[], projectId: string): Promise<number> {
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

        const taskIds = await this.persistGeneratedTasks({ tasksToCreate, projectId, req });
        createdTasksCount += taskIds.length;

        if (taskIds.length > 0) {
          await this.requirementModel.updateOne(
            { _id: new Types.ObjectId(String(req.id)) },
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
        this.logger.warn(`[gen-tasks] erro ao gerar tarefas para ação ${req.id}: ${err.message}`);
      }
    }

    return createdTasksCount;
  }

  private async persistGeneratedTasks(params: {
    tasksToCreate: unknown[];
    projectId: string;
    req: Requirement;
  }): Promise<string[]> {
    const { tasksToCreate, projectId, req } = params;
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
          requirementIds: [String(req.id)],
          journeyItemIds: [String(req.id)],
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
