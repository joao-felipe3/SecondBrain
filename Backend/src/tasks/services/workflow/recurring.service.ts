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
import { RecurringRuleDto, RecurringTaskOccurrenceDto } from '../../dto/task/create-task.dto';
import { CreateMicroTaskDto } from '../../dto/task/create-micro-task.dto';
import { ProjectsService } from '../../../projects/projects.service';
import { TaskDocument } from '../../schemas/task.schema';
import {
  normalizeChecklistFromTask,
  computeParentRecurringId,
  assembleOccurrencePayload,
  normalizeRecurringRule,
  calculateNextRecurringDate,
  calculateFirstRecurringDate,
} from './utils/recurring.utils';
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

  public normalizeRecurringRule(
    recurringRule?: RecurringRuleDto,
    options?: {
      allowPastEndDate?: boolean;
      prunePastExceptions?: boolean;
    },
  ): RecurringRuleDto {
    return normalizeRecurringRule(recurringRule, options);
  }

  public calculateNextRecurringDate(referenceDate: Date, recurringRule: RecurringRuleDto): Date | null {
    return calculateNextRecurringDate(referenceDate, recurringRule);
  }

  public calculateFirstRecurringDate(startDate: Date, recurringRule: RecurringRuleDto): Date | null {
    return calculateFirstRecurringDate(startDate, recurringRule);
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

    return assembleOccurrencePayload({
      task,
      nextDeadline,
      recurringRule,
      normalizedChecklist,
      parentRecurringId,
    });
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
