import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CreateTaskDto } from '../../dto/task/create-task.dto';
import { CreateMicroTaskDto } from '../../dto/task/create-micro-task.dto';
import { TaskDocument } from '../../schemas/task.schema';
import { ProjectDocument } from '../../../projects/schemas/project.schema';
import {
  TaskCreatedEvent,
  TaskDeletedEvent,
  TaskUpdatedEvent,
  BulkTasksCreatedEvent,
} from '../../events/task.events';
import { TasksMetricsService } from '../analysis/metrics.service';
import { CreateManyTasksOptionsDto } from '../../dto/task/create-many-tasks-options.dto';
import { TasksInputService } from './input.service';
import { ChecklistOperationsService } from '../intelligence/checklist-operations.service';
import { InsertManyError } from '../../interfaces/db-errors';

@Injectable()
export class TasksWriteService {
  constructor(
    @InjectModel('Task') private readonly taskModel: Model<TaskDocument>,
    @InjectModel('Project')
    private readonly projectModel: Model<ProjectDocument>,
    private readonly eventEmitter: EventEmitter2,
    private readonly metricsService: TasksMetricsService,
    private readonly tasksInputService: TasksInputService,
    private readonly checklistOperationsService: ChecklistOperationsService,
  ) {}

  // ===========================================================================
  // 1. Creation
  // ===========================================================================

  public async createMany(
    createTaskDtos: CreateTaskDto[],
    options?: CreateManyTasksOptionsDto,
  ): Promise<TaskDocument[]> {
    const tasks = Array.isArray(createTaskDtos) ? createTaskDtos : [];
    if (tasks.length === 0) return [];

    const ordered = Boolean(options?.ordered);
    const shouldRecalculateStats = Boolean(options?.recalculateProjectStats);

    await this.prepareTasksForInsert(tasks, options);

    const inserted = await this.performInsertMany(tasks, ordered);

    this.postInsertProcessing(inserted, shouldRecalculateStats);

    return inserted;
  }

  public async createMicroTask(createMicroTaskDto: CreateMicroTaskDto): Promise<TaskDocument> {
    this.tasksInputService.validatePertInput(createMicroTaskDto);

    const normalizedChecklist = this.tasksInputService.normalizeChecklist(createMicroTaskDto.checklist);
    const payload = this.buildMicroTaskPayload(createMicroTaskDto, normalizedChecklist);

    this.validateMicroTaskChecklistInput(createMicroTaskDto, normalizedChecklist);
    await this.ensureChecklistGenerated(createMicroTaskDto, payload);
    this.validateChecklistStructure(normalizedChecklist);

    return this.createTaskCore(payload);
  }

  public async createTaskCore(createTaskDto: CreateTaskDto): Promise<TaskDocument> {
    await this.resolveProject(createTaskDto);
    this.applyDerivedFields(createTaskDto);

    const createdTask = new this.taskModel(createTaskDto);
    const savedTask = await createdTask.save();

    const projectId = savedTask.project ? savedTask.project.toString() : undefined;
    this.eventEmitter.emit('task.created', new TaskCreatedEvent(savedTask, projectId));

    return savedTask;
  }

  // ===========================================================================
  // 2. Update
  // ===========================================================================

  public async update(id: string, updateTaskDto: Partial<CreateTaskDto>): Promise<TaskDocument | null> {
    this.assertValidObjectId(id);

    const oldTask = await this.taskModel.findById(String(id)).exec();
    const oldProjectId = oldTask?.project?.toString();

    await this.resolveProject(updateTaskDto as CreateTaskDto);

    this.applyDerivedFields(updateTaskDto);

    const sanitizedPayload = this.sanitizeUpdatePayload(updateTaskDto);
    const updatedTask = await this.taskModel
      .findByIdAndUpdate(String(id), { $set: sanitizedPayload }, { new: true })
      .exec();

    if (updatedTask) {
      const newProjectId = updatedTask.project?.toString();
      this.eventEmitter.emit(
        'task.updated',
        new TaskUpdatedEvent(updatedTask, newProjectId, oldProjectId),
      );
    }

    return updatedTask;
  }

  // ===========================================================================
  // 3. Delete
  // ===========================================================================

  public async remove(id: string): Promise<boolean> {
    this.assertValidObjectId(id);

    const task = await this.getTaskOrThrow(id);

    const projectId = task?.project?.toString();
    const result = await this.taskModel.findByIdAndDelete(id).exec();

    if (result && projectId) {
      this.eventEmitter.emit('task.deleted', new TaskDeletedEvent(id, projectId));
    }

    return result !== null;
  }

  // ===========================================================================
  // 5. Private Helpers
  // ===========================================================================

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

  private async resolveProjects(tasks: CreateTaskDto[]): Promise<void> {
    for (const task of tasks) {
      await this.resolveProject(task);
    }
  }

  private applyDerivedFieldsBatch(tasks: CreateTaskDto[]): void {
    for (const task of tasks) {
      this.applyDerivedFields(task);
    }
  }

  private recalculateProjectsStats(tasks: TaskDocument[]): void {
    const uniqueProjectIds = Array.from(
      new Set(tasks.map((task) => task.project?.toString?.() ?? task.project).filter(Boolean)),
    ) as string[];

    if (uniqueProjectIds.length > 0) {
      this.eventEmitter.emit('task.bulk_created', new BulkTasksCreatedEvent(tasks, uniqueProjectIds));
    }
  }

  private assertValidObjectId(id: string): void {
    if (!id || id === 'null' || id === 'undefined' || !/^[a-f\d]{24}$/i.test(id)) {
      throw new BadRequestException(`ID inválido: ${id}`);
    }
  }

  private static readonly ALLOWED_UPDATE_FIELDS: readonly (keyof CreateTaskDto)[] = [
    'name',
    'description',
    'definitionOfDone',
    'checklist',
    'pomodorosPlanned',
    'pomodorosDid',
    'pertOptimisticMinutes',
    'pertMostLikelyMinutes',
    'pertPessimisticMinutes',
    'pertExpectedMinutes',
    'pertVariance',
    'requirementIds',
    'journeyItemIds',
    'rtmRisk',
    'rtmRiskReason',
    'evmProgress',
    'evmPlannedValueMinutes',
    'evmEarnedValueMinutes',
    'evmSchedulePerformanceIndex',
    'evmAlert',
    'deadline',
    'priority',
    'difficult',
    'project',
    'parentTaskId',
    'parentWbsNodeId',
    'wbsPath',
    'generationBatchId',
    'milestoneId',
    'experience',
    'isConcluded',
    'late',
    'prize',
    'recurrency',
    'notification',
    'microTaskType',
    'parentRecurringId',
    'isRecurringInstance',
    'recurringState',
    'recurringRule',
  ];

  private sanitizeUpdatePayload(payload: Partial<CreateTaskDto>): Partial<CreateTaskDto> {
    if (!payload || typeof payload !== 'object') return {};
    const sanitized: Partial<CreateTaskDto> = {};
    for (const field of TasksWriteService.ALLOWED_UPDATE_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(payload, field)) {
        const val = payload[field];
        if (val !== undefined) {
          sanitized[field] = val as never;
        }
      }
    }
    return sanitized;
  }

  private async getTaskOrThrow(id: string): Promise<TaskDocument> {
    const task = await this.taskModel.findById(id).exec();
    if (!task) throw new NotFoundException(`Task com ID ${id} não encontrada`);

    return task;
  }

  private validateMicroTaskChecklistInput(
    dto: CreateMicroTaskDto,
    normalizedChecklist: CreateTaskDto['checklist'],
  ): void {
    const checklistWasProvided = 'checklist' in dto;

    if (
      checklistWasProvided &&
      dto.autoGenerateChecklist === false &&
      (!normalizedChecklist || normalizedChecklist.length === 0)
    ) {
      throw new BadRequestException(
        'Checklist inválido: informe ao menos um item válido ou habilite autoGenerateChecklist.',
      );
    }
  }

  private async ensureChecklistGenerated(
    dto: CreateMicroTaskDto,
    payload: CreateTaskDto,
  ): Promise<void> {
    const shouldGenerateChecklist =
      dto.autoGenerateChecklist !== false && (!payload.checklist || payload.checklist.length === 0);

    if (!shouldGenerateChecklist) return;

    const generated = await this.checklistOperationsService.generateChecklistWithHistory({
      taskName: payload.name,
      description: payload.description,
      microTaskType: payload.microTaskType,
      projectId: payload.project,
    });
    payload.checklist = this.tasksInputService.normalizeChecklist(generated);
  }

  private validateChecklistStructure(normalizedChecklist: CreateTaskDto['checklist']): void {
    if (!normalizedChecklist || normalizedChecklist.length === 0) return;

    const shape = normalizedChecklist.map((it) =>
      typeof it === 'string'
        ? { item: it, completed: false }
        : { item: it.item, completed: it.completed },
    );

    const validation = this.checklistOperationsService.validateChecklistStructure(shape);

    if (!validation.isValid) {
      throw new BadRequestException(validation.reason);
    }
  }

  private buildMicroTaskPayload(
    dto: CreateMicroTaskDto,
    normalizedChecklist: CreateTaskDto['checklist'],
  ): CreateTaskDto {
    return {
      ...dto,
      checklist: normalizedChecklist,
      isRecurringInstance: Boolean(dto.isRecurringInstance),
    };
  }

  private async prepareTasksForInsert(
    tasks: CreateTaskDto[],
    options?: CreateManyTasksOptionsDto,
  ): Promise<void> {
    const resolveProject = Boolean(options?.resolveProject);
    if (resolveProject) await this.resolveProjects(tasks);

    this.applyDerivedFieldsBatch(tasks);
  }

  private async performInsertMany(tasks: CreateTaskDto[], ordered: boolean): Promise<TaskDocument[]> {
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
    return inserted;
  }

  private postInsertProcessing(inserted: TaskDocument[], shouldRecalculateStats: boolean): void {
    if (!shouldRecalculateStats) return;
    this.recalculateProjectsStats(inserted);
  }
}
