import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateTaskDto } from '../../dto/create-task.dto';
import { CreateMicroTaskDto } from '../../dto/create-micro-task.dto';
import { TaskDocument } from '../../schemas/task.schema';
import { ProjectDocument } from '../../../projects/schemas/project.schema';
import { ProjectsService } from '../../../projects/projects.service';
import { TasksMetricsService } from '../analysis/metrics.service';
import { CreateManyTasksOptionsDto } from '../../dto/create-many-tasks-options.dto';
import { MoveTaskStatusDto } from '../../dto/move-task-status.dto';
import { TasksInputService } from './input.service';
import { TasksChecklistService } from '../intelligence/checklist.service';
import { ChecklistService } from '../shared/checklist.service';
import { TasksCompletionService } from './completion.service';
import { InsertManyError } from '../../interfaces/db-errors';

@Injectable()
export class TasksWriteService {
  constructor(
    @InjectModel('Task') private readonly taskModel: Model<TaskDocument>,
    @InjectModel('Project')
    private readonly projectModel: Model<ProjectDocument>,
    private readonly projectsService: ProjectsService,
    private readonly metricsService: TasksMetricsService,
    private readonly tasksInputService: TasksInputService,
    private readonly tasksChecklistService: TasksChecklistService,
    private readonly checklistService: ChecklistService,
    private readonly tasksCompletionService: TasksCompletionService,
  ) {}

  public async createMany(
    createTaskDtos: CreateTaskDto[],
    options?: CreateManyTasksOptionsDto,
  ): Promise<TaskDocument[]> {
    const tasks = Array.isArray(createTaskDtos) ? createTaskDtos : [];
    if (tasks.length === 0) return [];

    const resolveProject = Boolean(options?.resolveProject);
    const shouldRecalculateStats = Boolean(options?.recalculateProjectStats);
    const ordered = Boolean(options?.ordered);

    if (resolveProject) {
      for (const task of tasks) {
        await this.resolveProject(task);
      }
    }

    for (const task of tasks) {
      this.applyDerivedFields(task);
    }

    let inserted: TaskDocument[] = [];
    try {
      inserted = await this.taskModel.insertMany(tasks, { ordered });
    } catch (err: unknown) {
      const insertError = err as InsertManyError;
      inserted = insertError.insertedDocs || [];

      const writeErrors = Array.isArray(insertError.writeErrors)
        ? insertError.writeErrors.length
        : undefined;

      console.warn('[TasksWriteService][createMany] insertMany error (partial inserts possible)', {
        message: insertError.message,
        inserted: inserted.length,
        writeErrors,
      });
    }

    if (shouldRecalculateStats) {
      const uniqueProjectIds = new Set(
        inserted.map((task: TaskDocument) => task.project?.toString?.() ?? task.project).filter(Boolean),
      );

      for (const pid of uniqueProjectIds) {
        await this.projectsService.recalculateProjectStats(String(pid));
      }
    }

    return inserted;
  }

  public async createMicroTask(createMicroTaskDto: CreateMicroTaskDto): Promise<TaskDocument> {
    this.tasksInputService.validatePertInput(createMicroTaskDto);

    const checklistWasProvided: boolean = 'checklist' in createMicroTaskDto;

    const normalizedChecklist = this.tasksInputService.normalizeChecklist(createMicroTaskDto.checklist);
    const payload: CreateTaskDto = {
      ...createMicroTaskDto,
      checklist: normalizedChecklist as CreateTaskDto['checklist'],
      isRecurringInstance: Boolean(createMicroTaskDto.isRecurringInstance),
    };

    if (
      checklistWasProvided &&
      createMicroTaskDto.autoGenerateChecklist === false &&
      (!normalizedChecklist || normalizedChecklist.length === 0)
    ) {
      throw new BadRequestException(
        'Checklist inválido: informe ao menos um item válido ou habilite autoGenerateChecklist.',
      );
    }

    const shouldGenerateChecklist =
      createMicroTaskDto.autoGenerateChecklist !== false &&
      (!payload.checklist || payload.checklist.length === 0);

    if (shouldGenerateChecklist) {
      const generated = await this.tasksChecklistService.generateChecklistWithHistory(
        payload.name,
        payload.description,
        payload.microTaskType,
        payload.project,
      );
      payload.checklist = this.tasksInputService.normalizeChecklist(generated);
    }

    if (normalizedChecklist && normalizedChecklist.length > 0) {
      const validation = this.checklistService.validateChecklistStructure(
        normalizedChecklist.map((item) => ({
          item: item.item,
          completed: item.completed,
        })),
      );
      if (!validation.isValid) {
        throw new BadRequestException(validation.reason);
      }
    }

    return this.createTaskCore(payload);
  }

  public async createTaskCore(createTaskDto: CreateTaskDto): Promise<TaskDocument> {
    await this.resolveProject(createTaskDto);
    this.applyDerivedFields(createTaskDto);

    const createdTask = new this.taskModel(createTaskDto);
    const savedTask = await createdTask.save();

    if (savedTask.project) {
      await this.projectsService.recalculateProjectStats(savedTask.project.toString());
    }

    return savedTask;
  }

  public async update(id: string, updateTaskDto: Partial<CreateTaskDto>): Promise<TaskDocument | null> {
    if (!id || id === 'null' || id === 'undefined' || !/^[a-f\d]{24}$/i.test(id)) {
      throw new BadRequestException(`ID inválido: ${id}`);
    }

    const oldTask = await this.taskModel.findById(id).exec();
    const oldProjectId = oldTask?.project?.toString();

    await this.resolveProject(updateTaskDto as CreateTaskDto);

    this.applyDerivedFields(updateTaskDto);

    const updatedTask = await this.taskModel.findByIdAndUpdate(id, updateTaskDto, { new: true }).exec();

    if (updatedTask) {
      const newProjectId = updatedTask.project?.toString();

      if (oldProjectId && oldProjectId !== newProjectId) {
        await this.projectsService.recalculateProjectStats(oldProjectId);
      }
      if (newProjectId) {
        await this.projectsService.recalculateProjectStats(newProjectId);
      }
    }

    return updatedTask;
  }

  public async remove(id: string): Promise<boolean> {
    if (!id || id === 'null' || id === 'undefined' || !/^[a-f\d]{24}$/i.test(id)) {
      throw new BadRequestException(`ID inválido: ${id}`);
    }

    const task = await this.taskModel.findById(id).exec();
    if (!task) {
      throw new NotFoundException(`Task com ID ${id} não encontrada`);
    }

    const projectId = task?.project?.toString();
    const result = await this.taskModel.findByIdAndDelete(id).exec();

    if (result && projectId) {
      await this.projectsService.recalculateProjectStats(projectId);
    }

    return result !== null;
  }

  public async moveTaskStatus(id: string, move: MoveTaskStatusDto): Promise<TaskDocument> {
    if (!id || !/^[a-f\d]{24}$/i.test(id)) {
      throw new BadRequestException(`ID inválido: ${id}`);
    }

    const task = await this.taskModel.findById(id).exec();
    if (!task) {
      throw new NotFoundException(`Task with id ${id} not found`);
    }

    const toStatus = move.status;

    if (task.isConcluded && toStatus !== 'done') {
      throw new BadRequestException('Tarefa concluída não pode ser movida para fora de "done"');
    }

    if (toStatus === 'done') {
      return this.tasksCompletionService.markAsConcluded(id);
    }

    const projectId = task.project?.toString();

    let targetOrder: number | undefined = undefined;
    if (typeof move.toOrder === 'number' && Number.isFinite(move.toOrder)) {
      targetOrder = move.toOrder;
    }

    if (targetOrder === undefined && typeof move.toIndex === 'number' && projectId) {
      const destinationTasks = await this.taskModel
        .find({ project: projectId, status: toStatus })
        .sort({ kanbanOrder: 1 })
        .select('kanbanOrder')
        .exec();

      const idx = Math.max(0, Math.floor(move.toIndex));
      const len = destinationTasks.length;

      if (len === 0) {
        targetOrder = 1;
      } else if (idx <= 0) {
        targetOrder = (destinationTasks[0].kanbanOrder || 0) - 1;
      } else if (idx >= len) {
        targetOrder = (destinationTasks[len - 1].kanbanOrder || 0) + 1;
      } else {
        const prev = destinationTasks[idx - 1].kanbanOrder || 0;
        const next = destinationTasks[idx].kanbanOrder || prev + 2;
        targetOrder = (prev + next) / 2;
      }
    }

    if (targetOrder === undefined) {
      const maxOrder = await this.taskModel
        .findOne({ project: projectId, status: toStatus })
        .sort({ kanbanOrder: -1 })
        .select('kanbanOrder')
        .exec();
      targetOrder = (maxOrder?.kanbanOrder || 0) + 1;
    }

    const updatedTask = await this.taskModel
      .findByIdAndUpdate(
        id,
        {
          status: toStatus,
          statusUpdatedAt: new Date(),
          kanbanOrder: targetOrder,
        },
        { new: true },
      )
      .exec();

    if (!updatedTask) {
      throw new NotFoundException(`Task with id ${id} not found`);
    }

    return updatedTask;
  }

  private async resolveProject(createTaskDto: CreateTaskDto): Promise<void> {
    if (!createTaskDto.project || typeof createTaskDto.project !== 'string') {
      return;
    }

    const project = createTaskDto.project;
    const isObjectId = /^[a-f\d]{24}$/i.test(project);
    let projectDoc: ProjectDocument | null = null;

    if (isObjectId) {
      projectDoc = await this.projectModel.findById(project).exec();
    }
    if (!projectDoc) {
      projectDoc = await this.projectModel.findOne({ name: project }).exec();
    }
    if (!projectDoc) {
      throw new NotFoundException(`Project not found by id or name '${project}'`);
    }

    createTaskDto.project = projectDoc._id;
  }

  private applyDerivedFields(dto: Partial<CreateTaskDto>): void {
    this.metricsService.applyPertEstimates(dto);
    this.metricsService.applyRtmRisk(dto);
    this.metricsService.applyEvmMetrics(dto);

    const priority = (dto.priority as number) || 0;
    const difficult = (dto.difficult as number) || 0;
    dto.prize = priority * 5 + difficult * 2;
    dto.experience = priority * 2 + difficult * 5;
  }
}