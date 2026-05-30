import {
  BadRequestException,
  Injectable,
  Inject,
  Optional,
  forwardRef,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { RecurringExceptionDto, RecurringRuleDto, CreateTaskDto } from '../../dto/create-task.dto';
import { CreateMicroTaskDto } from '../../dto/create-micro-task.dto';
import { ProjectsService } from '../../../projects/projects.service';
import { TaskDocument } from '../../schemas/task.schema';
import { TasksWriteService } from './write.service';

@Injectable()
export class TasksRecurringService {
  constructor(
    @InjectModel('Task') private readonly taskModel?: Model<TaskDocument>,
    @Inject(forwardRef(() => ProjectsService))
    @Optional()
    private readonly projectsService?: ProjectsService,
    private readonly tasksWriteService?: TasksWriteService,
  ) {}

  normalizeRecurringRule(
    recurringRule?: RecurringRuleDto,
    options?: {
      allowPastEndDate?: boolean;
      prunePastExceptions?: boolean;
    },
  ): RecurringRuleDto {
    if (!recurringRule?.frequency || !recurringRule?.interval) {
      throw new BadRequestException('recurringRule inválida: frequency e interval são obrigatórios.');
    }

    const frequency = String(recurringRule.frequency).toLowerCase();
    const allowedFrequencies = ['daily', 'weekly', 'biweekly', 'monthly', 'custom'];
    if (!allowedFrequencies.includes(frequency)) {
      throw new BadRequestException(
        `recurringRule inválida: frequency "${recurringRule.frequency}" não suportada.`,
      );
    }

    const interval = Number(recurringRule.interval);
    if (!Number.isFinite(interval) || interval <= 0) {
      throw new BadRequestException('recurringRule inválida: interval deve ser maior que zero.');
    }

    if (recurringRule.endDate) {
      const endDate = new Date(recurringRule.endDate);
      if (Number.isNaN(endDate.getTime())) {
        throw new BadRequestException('recurringRule inválida: endDate inválida.');
      }
      if (!options?.allowPastEndDate && endDate.getTime() < Date.now() - 24 * 60 * 60 * 1000) {
        throw new BadRequestException('recurringRule inválida: endDate não pode estar no passado.');
      }
    }

    const daysOfWeek = Array.isArray(recurringRule.daysOfWeek)
      ? recurringRule.daysOfWeek.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
      : undefined;

    const exceptions = Array.isArray(recurringRule.exceptions)
      ? recurringRule.exceptions
          .map((exception): RecurringExceptionDto | null => {
            const rawDate = exception instanceof Date ? exception : (exception as any)?.date;
            const parsedDate = new Date(rawDate);
            if (Number.isNaN(parsedDate.getTime())) {
              return null;
            }

            const normalizedDate = new Date(parsedDate);
            normalizedDate.setUTCHours(0, 0, 0, 0);
            return {
              date: normalizedDate,
              reason: (exception as any)?.reason,
            };
          })
          .filter((exception): exception is RecurringExceptionDto => Boolean(exception))
      : undefined;

    const cleanedExceptions = exceptions
      ? exceptions.filter((exception) => {
          if (recurringRule.endDate) {
            const endDate = new Date(recurringRule.endDate);
            endDate.setUTCHours(23, 59, 59, 999);
            if (exception.date.getTime() > endDate.getTime()) {
              return false;
            }
          }

          if (options?.prunePastExceptions === false) {
            return true;
          }

          const yesterday = new Date();
          yesterday.setHours(0, 0, 0, 0);
          yesterday.setDate(yesterday.getDate() - 1);
          return exception.date.getTime() >= yesterday.getTime();
        })
      : undefined;

    return {
      ...recurringRule,
      frequency,
      interval,
      daysOfWeek,
      exceptions: cleanedExceptions,
    };
  }

  toDateKey(date: Date): string {
    const normalized = new Date(date);
    const year = normalized.getUTCFullYear();
    const month = String(normalized.getUTCMonth() + 1).padStart(2, '0');
    const day = String(normalized.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  addDays(date: Date, days: number): Date {
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + days);
    return next;
  }

  addMonths(date: Date, months: number): Date {
    const next = new Date(date);
    next.setUTCMonth(next.getUTCMonth() + months);
    return next;
  }

  isRecurringDateExcluded(date: Date, recurringRule: RecurringRuleDto): boolean {
    const dateKey = this.toDateKey(date);
    return Array.isArray(recurringRule.exceptions)
      ? recurringRule.exceptions.some((exception: any) => {
          const rawDate = exception instanceof Date ? exception : exception?.date;
          return this.toDateKey(new Date(rawDate)) === dateKey;
        })
      : false;
  }

  calculateNextRecurringDate(referenceDate: Date, recurringRule: RecurringRuleDto): Date | null {
    const rule = this.normalizeRecurringRule(recurringRule, {
      allowPastEndDate: true,
      prunePastExceptions: false,
    });
    const base = new Date(referenceDate);
    base.setSeconds(0, 0);

    if (rule.endDate) {
      const endDate = new Date(rule.endDate);
      if (base.getTime() >= endDate.getTime()) {
        return null;
      }
    }

    if (rule.frequency === 'monthly') {
      const monthCandidate = this.addMonths(base, rule.interval);
      if (rule.endDate && monthCandidate.getTime() >= new Date(rule.endDate).getTime()) {
        return null;
      }
      if (this.isRecurringDateExcluded(monthCandidate, rule)) {
        return this.calculateNextRecurringDate(monthCandidate, rule);
      }
      return monthCandidate;
    }

    let stepDays = rule.interval;
    if (rule.frequency === 'weekly') {
      stepDays = rule.interval * 7;
    } else if (rule.frequency === 'biweekly') {
      stepDays = rule.interval * 14;
    }

    const candidate = this.addDays(base, stepDays);
    const allowedDays =
      Array.isArray(rule.daysOfWeek) && rule.daysOfWeek.length > 0 ? rule.daysOfWeek : null;

    for (let offset = 0; offset < 365; offset++) {
      const probe = this.addDays(candidate, offset);

      if (rule.endDate && probe.getTime() >= new Date(rule.endDate).getTime()) {
        return null;
      }

      if (allowedDays && !allowedDays.includes(probe.getUTCDay())) {
        continue;
      }

      if (this.isRecurringDateExcluded(probe, rule)) {
        continue;
      }

      return probe;
    }

    return null;
  }

  calculateFirstRecurringDate(startDate: Date, recurringRule: RecurringRuleDto): Date | null {
    const rule = this.normalizeRecurringRule(recurringRule, {
      allowPastEndDate: true,
      prunePastExceptions: false,
    });

    const base = new Date(startDate);
    base.setSeconds(0, 0);

    if (rule.endDate) {
      const endDate = new Date(rule.endDate);
      if (base.getTime() > endDate.getTime()) {
        return null;
      }
    }

    if (rule.frequency === 'monthly') {
      if (!this.isRecurringDateExcluded(base, rule)) {
        return base;
      }
      return this.calculateNextRecurringDate(base, rule);
    }

    const allowedDays =
      Array.isArray(rule.daysOfWeek) && rule.daysOfWeek.length > 0 ? rule.daysOfWeek : null;

    for (let offset = 0; offset < 365; offset++) {
      const probe = this.addDays(base, offset);

      if (rule.endDate && probe.getTime() > new Date(rule.endDate).getTime()) {
        return null;
      }

      if (allowedDays && !allowedDays.includes(probe.getUTCDay())) {
        continue;
      }

      if (this.isRecurringDateExcluded(probe, rule)) {
        continue;
      }

      return probe;
    }

    return null;
  }

  async findRecurringSeries(parentRecurringId: string): Promise<TaskDocument[]> {
    if (!parentRecurringId || !Types.ObjectId.isValid(parentRecurringId)) {
      throw new BadRequestException(`ID inválido: ${parentRecurringId}`);
    }

    if (!this.taskModel) {
      throw new BadRequestException('TasksRecurringService não está inicializado com taskModel');
    }

    return this.taskModel
      .find({
        $or: [{ _id: parentRecurringId }, { parentRecurringId }],
      })
      .sort({ createdAt: 1 })
      .exec();
  }

  async deleteRecurringSeries(parentRecurringId: string): Promise<{ deletedCount: number }> {
    const tasks = await this.findRecurringSeries(parentRecurringId);
    let deletedCount = 0;
    const affectedProjects = new Set<string>();

    if (!this.taskModel) {
      throw new BadRequestException('TasksRecurringService não está inicializado com taskModel');
    }

    for (const task of tasks) {
      const projectId = task.project?.toString();
      if (projectId) {
        affectedProjects.add(projectId);
      }

      const removed = await this.taskModel.findByIdAndDelete(task._id).exec();
      if (removed) {
        deletedCount += 1;
      }
    }

    if (this.projectsService) {
      for (const projectId of affectedProjects) {
        await this.projectsService.recalculateProjectStats(projectId);
      }
    }

    return { deletedCount };
  }

  async createRecurringTemplate(createMicroTaskDto: CreateMicroTaskDto): Promise<TaskDocument> {
    const recurringRule = this.normalizeRecurringRule(createMicroTaskDto.recurringRule);
    if (!this.tasksWriteService) {
      throw new BadRequestException('TasksRecurringService não está inicializado com tasksWriteService');
    }

    return this.tasksWriteService.createMicroTask({
      ...createMicroTaskDto,
      recurringRule,
      isRecurringInstance: false,
      recurringState: 'pending',
    } as any);
  }

  async createRecurringMicroTask(createMicroTaskDto: CreateMicroTaskDto): Promise<TaskDocument> {
    const template = await this.createRecurringTemplate({
      ...createMicroTaskDto,
      isRecurringInstance: false,
      recurringState: 'pending',
    } as any);

    // IMPORTANT: First occurrence should be on the start date (deadline provided / today),
    // not on the *next* interval date. Otherwise the UI shows two papers (template=day0 + occurrence=day1).
    const recurringRule = template.recurringRule
      ? this.normalizeRecurringRule(template.recurringRule as any)
      : undefined;
    if (!recurringRule) {
      return template;
    }

    const referenceStart = new Date(
      (createMicroTaskDto as any)?.deadline || template.deadline || template.createdAt || new Date(),
    );
    const firstDeadline = this.calculateFirstRecurringDate(referenceStart, recurringRule);
    if (!firstDeadline) {
      return template;
    }

    if (!this.tasksWriteService) {
      throw new BadRequestException('TasksRecurringService não está inicializado com tasksWriteService');
    }

    const firstOccurrence = await this.tasksWriteService.createTaskCore(
      this.buildOccurrencePayload(template, firstDeadline) as any,
    );
    return firstOccurrence || template;
  }

  buildOccurrencePayload(task: TaskDocument, nextDeadline: Date): CreateTaskDto {
    const recurringRule = this.normalizeRecurringRule(task.recurringRule as any);
    const normalizedChecklist = Array.isArray(task.checklist)
      ? task.checklist
          .map((entry: any, index: number) => {
            if (typeof entry === 'string') {
              return { item: entry, completed: false, order: index };
            }
            return {
              item: String(entry?.item || ''),
              completed: false,
              order: Number.isFinite(entry?.order) ? Number(entry.order) : index,
            };
          })
          .filter((item) => item.item)
      : [];

    const parentRecurringId = String(task.parentRecurringId || task._id);

    const payload: any = {
      name: task.name,
      description: task.description,
      definitionOfDone: task.definitionOfDone,
      checklist: normalizedChecklist,
      deadline: nextDeadline,
      pomodorosPlanned: task.pomodorosPlanned,
      pomodorosDid: 0,
      pertOptimisticMinutes: task.pertOptimisticMinutes,
      pertMostLikelyMinutes: task.pertMostLikelyMinutes,
      pertPessimisticMinutes: task.pertPessimisticMinutes,
      pertExpectedMinutes: task.pertExpectedMinutes,
      pertVariance: task.pertVariance,
      priority: task.priority,
      difficult: task.difficult,
      project: task.project,
      parentTaskId: task.parentTaskId,
      parentWbsNodeId: task.parentWbsNodeId,
      wbsPath: task.wbsPath,
      generationBatchId: task.generationBatchId,
      milestoneId: task.milestoneId,
      experience: task.experience,
      isConcluded: false,
      late: false,
      prize: task.prize,
      recurrency: task.recurrency,
      notification: new Date(nextDeadline.getTime() - 60 * 60 * 1000),
      microTaskType: task.microTaskType,
      parentRecurringId,
      isRecurringInstance: true,
      recurringState: 'pending',
      recurringRule,
      cognitiveMode: task.cognitiveMode,
      contextTag: task.contextTag,
      themeTag: task.themeTag,
      requirementIds: task.requirementIds,
      journeyItemIds: task.journeyItemIds,
      rtmRisk: task.rtmRisk,
      rtmRiskReason: task.rtmRiskReason,
      evmProgress: task.evmProgress,
      evmPlannedValueMinutes: task.evmPlannedValueMinutes,
      evmEarnedValueMinutes: task.evmEarnedValueMinutes,
      evmSchedulePerformanceIndex: task.evmSchedulePerformanceIndex,
      evmAlert: task.evmAlert,
      status: 'todo',
      statusUpdatedAt: new Date(),
      kanbanOrder: 0,
    } as CreateTaskDto;

    return payload;
  }

  async updateRecurringRule(id: string, recurringRule: RecurringRuleDto): Promise<TaskDocument> {
    if (!id || !Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`ID inválido: ${id}`);
    }

    const normalized = this.normalizeRecurringRule(recurringRule);

    if (!this.taskModel) {
      throw new BadRequestException('TasksRecurringService não está inicializado com taskModel');
    }

    const updatedTask = await this.taskModel
      .findByIdAndUpdate(id, { recurringRule: normalized }, { new: true })
      .exec();

    if (!updatedTask) {
      throw new NotFoundException(`Task with id ${id} not found`);
    }

    return updatedTask;
  }

  async generateNextOccurrence(taskOrId: string | TaskDocument): Promise<TaskDocument | null> {
    const task: TaskDocument | null =
      typeof taskOrId === 'string'
        ? await (this.taskModel ? this.taskModel.findById(taskOrId).exec() : null)
        : taskOrId;
    if (!task) {
      throw new NotFoundException('Task not found');
    }

    const recurringRule = task.recurringRule
      ? this.normalizeRecurringRule(task.recurringRule as any)
      : undefined;
    if (!recurringRule) {
      return null;
    }

    const nextDeadline = this.calculateNextRecurringDate(
      task.deadline || task.createdAt || new Date(),
      recurringRule,
    );
    if (!nextDeadline) {
      return null;
    }

    if (!this.tasksWriteService) {
      throw new BadRequestException('TasksRecurringService não está inicializado com tasksWriteService');
    }

    return this.tasksWriteService.createTaskCore(this.buildOccurrencePayload(task, nextDeadline) as any);
  }
}
