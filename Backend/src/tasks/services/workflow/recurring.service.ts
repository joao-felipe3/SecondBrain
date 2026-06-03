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
import {
  RecurringExceptionDto,
  RecurringRuleDto,
  CreateTaskDto,
  RecurringTaskOccurrenceDto,
} from '../../dto/create-task.dto';
import { CreateMicroTaskDto } from '../../dto/create-micro-task.dto';
import { ProjectsService } from '../../../projects/projects.service';
import { TaskDocument } from '../../schemas/task.schema';
import {
  toDateKey,
  addDays,
  addMonths,
  normalizeChecklistFromTask,
  computeParentRecurringId,
  assembleOccurrencePayload,
} from './recurring.utils';
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

  // ===========================================================================
  // 1. Rule Normalization & Validation
  // ===========================================================================

  public normalizeRecurringRule(
    recurringRule?: RecurringRuleDto,
    options?: {
      allowPastEndDate?: boolean;
      prunePastExceptions?: boolean;
    },
  ): RecurringRuleDto {
    this.ensureRequiredFields(recurringRule);

    const frequency = this.normalizeFrequency(recurringRule!.frequency);
    const interval = this.normalizeInterval(recurringRule!.interval);

    const endDate = this.parseAndValidateEndDate(
      recurringRule!.endDate,
      Boolean(options?.allowPastEndDate),
    );
    const daysOfWeek = this.normalizeDaysOfWeek(recurringRule!.daysOfWeek);

    const exceptions = this.parseExceptions(recurringRule!.exceptions);
    const cleanedExceptions = exceptions
      ? this.cleanExceptions(exceptions, endDate, options?.prunePastExceptions)
      : undefined;

    return {
      ...recurringRule!,
      frequency,
      interval,
      daysOfWeek,
      exceptions: cleanedExceptions,
    };
  }

  private ensureRequiredFields(recurringRule?: RecurringRuleDto): void {
    if (!recurringRule?.frequency || !recurringRule?.interval) {
      throw new BadRequestException('recurringRule inválida: frequency e interval são obrigatórios.');
    }
  }

  private normalizeFrequency(raw: unknown): string {
    const frequency = String(raw).toLowerCase();
    const allowedFrequencies = ['daily', 'weekly', 'biweekly', 'monthly', 'custom'];
    if (!allowedFrequencies.includes(frequency)) {
      throw new BadRequestException(`recurringRule inválida: frequency "${String(raw)}" não suportada.`);
    }
    return frequency;
  }

  private normalizeInterval(raw: unknown): number {
    const interval = Number(raw);
    if (!Number.isFinite(interval) || interval <= 0) {
      throw new BadRequestException('recurringRule inválida: interval deve ser maior que zero.');
    }
    return interval;
  }

  private parseAndValidateEndDate(raw?: unknown, allowPast = false): Date | undefined {
    if (raw === undefined || raw === null) return undefined;
    const endDate = raw instanceof Date ? raw : new Date(String(raw));
    if (Number.isNaN(endDate.getTime())) {
      throw new BadRequestException('recurringRule inválida: endDate inválida.');
    }
    if (!allowPast && endDate.getTime() < Date.now() - 24 * 60 * 60 * 1000) {
      throw new BadRequestException('recurringRule inválida: endDate não pode estar no passado.');
    }
    return endDate;
  }

  private normalizeDaysOfWeek(raw?: unknown): number[] | undefined {
    if (!Array.isArray(raw)) return undefined;
    const filtered = raw.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6) as number[];
    return filtered.length > 0 ? filtered : undefined;
  }

  private parseExceptions(raw?: unknown): RecurringExceptionDto[] | undefined {
    if (!Array.isArray(raw)) return undefined;

    const out: RecurringExceptionDto[] = [];
    for (const exception of raw) {
      const date = this.extractExceptionDate(exception);
      if (!date) continue;

      const normalizedDate = new Date(date);
      normalizedDate.setUTCHours(0, 0, 0, 0);

      const reason = this.extractExceptionReason(exception);
      out.push({ date: normalizedDate, reason });
    }

    return out.length > 0 ? out : undefined;
  }

  // ===========================================================================
  // 2. Exception Parsing Helpers
  // ===========================================================================

  private extractExceptionDate(rawException: unknown): Date | undefined {
    if (rawException instanceof Date) return rawException;
    if (!rawException || typeof rawException !== 'object') return undefined;

    const candidate = (rawException as Record<string, unknown>)['date'];
    if (candidate instanceof Date) return candidate;
    if (candidate === undefined || candidate === null) return undefined;

    const parsed = new Date(String(candidate));
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }

  private extractExceptionReason(rawException: unknown): string | undefined {
    if (!rawException || typeof rawException !== 'object') return undefined;
    const r = (rawException as Record<string, unknown>)['reason'];
    return typeof r === 'string' ? r : undefined;
  }

  private cleanExceptions(
    exceptions: RecurringExceptionDto[],
    endDateRaw?: string | Date,
    prunePastExceptions?: boolean,
  ): RecurringExceptionDto[] {
    return exceptions.filter((exception) => {
      if (endDateRaw) {
        const endDate = this.parseAndValidateEndDate(endDateRaw, true);
        if (endDate) {
          endDate.setUTCHours(23, 59, 59, 999);
          if (exception.date.getTime() > endDate.getTime()) return false;
        }
      }

      if (prunePastExceptions === false) return true;

      const yesterday = new Date();
      yesterday.setHours(0, 0, 0, 0);
      yesterday.setDate(yesterday.getDate() - 1);
      return exception.date.getTime() >= yesterday.getTime();
    });
  }

  private isRecurringDateExcluded(date: Date, recurringRule: RecurringRuleDto): boolean {
    const dateKey = toDateKey(date);
    return Array.isArray(recurringRule.exceptions)
      ? recurringRule.exceptions.some((exception: unknown) => {
          let rawDate: unknown;
          if (exception instanceof Date) rawDate = exception;
          else if (exception && typeof exception === 'object' && 'date' in exception) {
            rawDate = (exception as Record<string, unknown>)['date'];
          } else {
            rawDate = undefined;
          }

          const parsed = rawDate instanceof Date ? rawDate : new Date(String(rawDate));
          if (Number.isNaN(parsed.getTime())) return false;
          return toDateKey(parsed) === dateKey;
        })
      : false;
  }

  // ===========================================================================
  // 3. Recurrence Date Calculations
  // ===========================================================================

  public calculateNextRecurringDate(referenceDate: Date, recurringRule: RecurringRuleDto): Date | null {
    const rule = this.normalizeRecurringRule(recurringRule, {
      allowPastEndDate: true,
      prunePastExceptions: false,
    });

    const base = new Date(referenceDate);
    base.setSeconds(0, 0);

    const endDate = this.getRecurringEndDate(rule);
    if (this.isAfterRecurringEnd(base, endDate)) return null;

    if (rule.frequency === 'monthly') {
      return this.calculateMonthlyRecurringDate(base, rule, endDate);
    }

    return this.calculateSteppedRecurringDate(base, rule, endDate);
  }

  private calculateMonthlyRecurringDate(
    base: Date,
    rule: RecurringRuleDto,
    endDate?: Date,
  ): Date | null {
    const monthCandidate = addMonths(base, rule.interval);
    if (this.isAfterRecurringEnd(monthCandidate, endDate)) return null;

    return this.isRecurringDateExcluded(monthCandidate, rule)
      ? this.calculateNextRecurringDate(monthCandidate, rule)
      : monthCandidate;
  }

  private calculateSteppedRecurringDate(
    base: Date,
    rule: RecurringRuleDto,
    endDate?: Date,
  ): Date | null {
    const candidate = addDays(base, this.getRecurringStepDays(rule));
    const allowedDays = this.getAllowedDays(rule);

    for (let offset = 0; offset < 365; offset++) {
      const probe = addDays(candidate, offset);
      if (this.isAfterRecurringEnd(probe, endDate)) return null;
      if (allowedDays && !allowedDays.includes(probe.getUTCDay())) continue;
      if (this.isRecurringDateExcluded(probe, rule)) continue;
      return probe;
    }

    return null;
  }

  private getRecurringEndDate(rule: RecurringRuleDto): Date | undefined {
    return rule.endDate instanceof Date ? rule.endDate : undefined;
  }

  private isAfterRecurringEnd(date: Date, endDate?: Date): boolean {
    if (!endDate) return false;

    return date.getTime() >= endDate.getTime();
  }

  private getRecurringStepDays(rule: RecurringRuleDto): number {
    if (rule.frequency === 'weekly') return rule.interval * 7;
    if (rule.frequency === 'biweekly') return rule.interval * 14;

    return rule.interval;
  }

  private getAllowedDays(rule: RecurringRuleDto): number[] | null {
    return Array.isArray(rule.daysOfWeek) && rule.daysOfWeek.length > 0 ? rule.daysOfWeek : null;
  }

  private calculateFirstRecurringDate(startDate: Date, recurringRule: RecurringRuleDto): Date | null {
    const rule = this.normalizeRecurringRule(recurringRule, {
      allowPastEndDate: true,
      prunePastExceptions: false,
    });

    const base = new Date(startDate);
    base.setSeconds(0, 0);

    const endDate = this.getRecurringEndDate(rule);
    if (this.isAfterRecurringEnd(base, endDate) && endDate !== undefined) return null;

    if (rule.frequency === 'monthly') {
      return this.calculateFirstMonthlyRecurringDate(base, rule, endDate);
    }

    return this.findFirstAllowedRecurringDate(base, rule, endDate);
  }

  private calculateFirstMonthlyRecurringDate(
    base: Date,
    rule: RecurringRuleDto,
    endDate?: Date,
  ): Date | null {
    if (!this.isRecurringDateExcluded(base, rule)) {
      return base;
    }

    const nextDate = this.calculateNextRecurringDate(base, rule);
    return this.isAfterRecurringEnd(nextDate ?? base, endDate) ? null : nextDate;
  }

  private findFirstAllowedRecurringDate(
    base: Date,
    rule: RecurringRuleDto,
    endDate?: Date,
  ): Date | null {
    const allowedDays = this.getAllowedDays(rule);

    for (let offset = 0; offset < 365; offset++) {
      const probe = addDays(base, offset);

      if (this.isAfterRecurringEnd(probe, endDate)) return null;

      if (allowedDays && !allowedDays.includes(probe.getUTCDay())) continue;

      if (this.isRecurringDateExcluded(probe, rule)) continue;

      return probe;
    }

    return null;
  }

  // ===========================================================================
  // 4. Series Management
  // ===========================================================================

  public async findRecurringSeries(parentRecurringId: string): Promise<TaskDocument[]> {
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

  public async deleteRecurringSeries(parentRecurringId: string): Promise<{ deletedCount: number }> {
    const tasks = await this.findRecurringSeries(parentRecurringId);
    let deletedCount = 0;
    const affectedProjects = new Set<string>();

    if (!this.taskModel) {
      throw new BadRequestException('TasksRecurringService não está inicializado com taskModel');
    }

    for (const task of tasks) {
      const projectId = task.project?.toString();
      if (projectId) affectedProjects.add(projectId);

      const removed = await this.taskModel.findByIdAndDelete(task._id).exec();
      if (removed) deletedCount += 1;
    }

    if (this.projectsService) {
      for (const projectId of affectedProjects) {
        await this.projectsService.recalculateProjectStats(projectId);
      }
    }

    return { deletedCount };
  }

  // ===========================================================================
  // 5. Template & Occurrence Creation
  // ===========================================================================

  public async createRecurringTemplate(createMicroTaskDto: CreateMicroTaskDto): Promise<TaskDocument> {
    const recurringRule = this.normalizeRecurringRule(createMicroTaskDto.recurringRule);
    if (!this.tasksWriteService) {
      throw new BadRequestException('TasksRecurringService não está inicializado com tasksWriteService');
    }

    const payload: CreateMicroTaskDto = {
      ...createMicroTaskDto,
      recurringRule,
      isRecurringInstance: false,
      recurringState: 'pending',
    };

    return this.tasksWriteService.createMicroTask(payload);
  }

  public async createRecurringMicroTask(createMicroTaskDto: CreateMicroTaskDto): Promise<TaskDocument> {
    const template = await this.createTemplateForRecurring(createMicroTaskDto);

    const recurringRule = this.getRecurringRuleFromTemplate(template);
    if (!recurringRule) return template;

    const referenceStart = this.getReferenceStart(createMicroTaskDto, template);
    const firstDeadline = this.computeFirstDeadline(referenceStart, recurringRule);
    if (!firstDeadline) return template;

    this.ensureTasksWriteService();

    const firstOccurrence = await this.createFirstOccurrenceFromTemplate(template, firstDeadline);
    return firstOccurrence || template;
  }

  private async createTemplateForRecurring(dto: CreateMicroTaskDto): Promise<TaskDocument> {
    const templatePayload: CreateMicroTaskDto = {
      ...dto,
      isRecurringInstance: false,
      recurringState: 'pending',
    };
    return this.createRecurringTemplate(templatePayload);
  }

  private getRecurringRuleFromTemplate(template: TaskDocument): RecurringRuleDto | undefined {
    return template.recurringRule ? this.normalizeRecurringRule(template.recurringRule) : undefined;
  }

  private getReferenceStart(dto: CreateMicroTaskDto, template: TaskDocument): Date {
    return new Date(dto.deadline || template.deadline || template.createdAt || new Date());
  }

  private computeFirstDeadline(referenceStart: Date, recurringRule: RecurringRuleDto): Date | null {
    return this.calculateFirstRecurringDate(referenceStart, recurringRule);
  }

  private ensureTasksWriteService(): void {
    if (!this.tasksWriteService) {
      throw new BadRequestException('TasksRecurringService não está inicializado com tasksWriteService');
    }
  }

  private async createFirstOccurrenceFromTemplate(
    template: TaskDocument,
    firstDeadline: Date,
  ): Promise<TaskDocument | null> {
    return this.tasksWriteService!.createTaskCore(this.buildOccurrencePayload(template, firstDeadline));
  }

  public buildOccurrencePayload(task: TaskDocument, nextDeadline: Date): RecurringTaskOccurrenceDto {
    const recurringRule = task.recurringRule
      ? this.normalizeRecurringRule(task.recurringRule)
      : undefined;
    const normalizedChecklist = normalizeChecklistFromTask(task);
    const parentRecurringId = computeParentRecurringId(task);

    return assembleOccurrencePayload(
      task,
      nextDeadline,
      recurringRule,
      normalizedChecklist,
      parentRecurringId,
    );
  }

  public async updateRecurringRule(id: string, recurringRule: RecurringRuleDto): Promise<TaskDocument> {
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

    if (!updatedTask) throw new NotFoundException(`Task with id ${id} not found`);

    return updatedTask;
  }

  public async generateNextOccurrence(taskOrId: string | TaskDocument): Promise<TaskDocument | null> {
    const task: TaskDocument | null =
      typeof taskOrId === 'string'
        ? await (this.taskModel ? this.taskModel.findById(taskOrId).exec() : null)
        : taskOrId;
    if (!task) throw new NotFoundException('Task not found');

    const recurringRule = task.recurringRule
      ? this.normalizeRecurringRule(task.recurringRule)
      : undefined;
    if (!recurringRule) return null;

    const nextDeadline = this.calculateNextRecurringDate(
      task.deadline || task.createdAt || new Date(),
      recurringRule,
    );
    if (!nextDeadline) return null;

    if (!this.tasksWriteService) {
      throw new BadRequestException('TasksRecurringService não está inicializado com tasksWriteService');
    }

    return this.tasksWriteService.createTaskCore(this.buildOccurrencePayload(task, nextDeadline));
  }
}
