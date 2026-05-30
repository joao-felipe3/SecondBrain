import { Injectable, NotFoundException, Inject, forwardRef, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

// DTOs
import { CreateTaskDto, ChecklistItemDto, RecurringRuleDto } from './dto/create-task.dto';
import { GetHabitsDashboardDto } from './dto/get-habits-dashboard.dto';
import { CreateMicroTaskDto } from './dto/create-micro-task.dto';
import {
  GenerateAiSuggestionsDto,
  AiSuggestionsResponseDto,
  AiSuggestionsProgressDto,
} from './dto/generate-ai-suggestions.dto';
import { PertEstimateDto, PertEstimateResponseDto } from './dto/pert-estimate.dto';
import { GetHabitsDashboardResponseDto } from './dto/habits-dashboard.dto';
import { MoveTaskStatusDto } from './dto/move-task-status.dto';
import { CreateManyTasksOptionsDto } from './dto/create-many-tasks-options.dto';
import { FindByProjectIdOptionsDto } from './dto/find-by-project-id-options.dto';
import { UpdatePertDto } from './dto/suggest-pert.dto';

// Schema
import { TaskDocument } from './schemas/task.schema';

// Services
import { ProjectsService } from '../projects/projects.service';
import { GeminiService } from '../ai/gemini.service';
import { FeedbackService } from './services/feedback.service';
import { EVMService } from '../projects/services/evm.service';
import { TasksRecurringService } from './services/tasks/recurring.service';
import { TasksAiSuggestionsService } from './services/tasks/ai-suggestions.service';
import { TasksHabitsService } from './services/tasks/habits.service';
import { TasksHierarchyService } from './services/tasks/hierarchy.service';
import { TasksChecklistService } from './services/tasks/checklist.service';
import { TasksCompletionService } from './services/tasks/completion.service';
import { TasksPertService } from './services/tasks/tasks-pert.service';
import { TasksWriteService } from './services/tasks/write.service';

@Injectable()
export class TasksService {
  constructor(
    @InjectModel('Task') private readonly taskModel: Model<TaskDocument>,
    @Inject(forwardRef(() => ProjectsService))
    private readonly projectsService: ProjectsService,
    @Inject(forwardRef(() => EVMService))
    private readonly geminiService: GeminiService,
    private readonly feedbackService: FeedbackService,
    private readonly tasksPertService: TasksPertService,
    private readonly tasksWriteService: TasksWriteService,
    private readonly tasksRecurringService: TasksRecurringService,
    private readonly tasksAiSuggestionsService: TasksAiSuggestionsService,
    private readonly tasksHabitsService: TasksHabitsService,
    private readonly tasksHierarchyService: TasksHierarchyService,
    private readonly tasksChecklistService: TasksChecklistService,
    private readonly tasksCompletionService: TasksCompletionService,
  ) {}

  async recalculateProjectStats(projectId: string): Promise<void> {
    await this.projectsService.recalculateProjectStats(projectId);
  }

  // ---------------------------------------- Creation / Write operations ----------------------------------------
  async createMany(
    createTaskDtos: CreateTaskDto[],
    options?: CreateManyTasksOptionsDto,
  ): Promise<TaskDocument[]> {
    return this.tasksWriteService.createMany(createTaskDtos, options);
  }

  async create(createTaskDto: CreateTaskDto): Promise<TaskDocument> {
    if (createTaskDto.microTaskType) {
      return this.createMicroTask({
        ...createTaskDto,
        autoGenerateChecklist: true,
      });
    }

    return this.createTaskCore(createTaskDto);
  }

  async createMicroTask(createMicroTaskDto: CreateMicroTaskDto): Promise<TaskDocument> {
    return this.tasksWriteService.createMicroTask(createMicroTaskDto);
  }

  async createRecurringTemplate(createMicroTaskDto: CreateMicroTaskDto): Promise<TaskDocument> {
    const recurringRule = this.tasksRecurringService.normalizeRecurringRule(
      createMicroTaskDto.recurringRule,
    );
    const template = await this.createMicroTask({
      ...createMicroTaskDto,
      recurringRule,
      isRecurringInstance: false,
      recurringState: 'pending',
    } as any);

    return template;
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
      ? this.tasksRecurringService.normalizeRecurringRule(template.recurringRule as any)
      : undefined;
    if (!recurringRule) {
      return template;
    }

    const referenceStart = new Date(
      (createMicroTaskDto as any)?.deadline || template.deadline || template.createdAt || new Date(),
    );
    const firstDeadline = this.tasksRecurringService.calculateFirstRecurringDate(
      referenceStart,
      recurringRule,
    );
    if (!firstDeadline) {
      return template;
    }

    const firstOccurrence = await this.createTaskCore(
      this.tasksRecurringService.buildOccurrencePayload(template, firstDeadline) as any,
    );
    return firstOccurrence || template;
  }

  private async createTaskCore(createTaskDto: CreateTaskDto): Promise<TaskDocument> {
    return this.tasksWriteService.createTaskCore(createTaskDto);
  }

  // ------------------------------ Update / Delete / Move ------------------------------
  async update(id: string, updateTaskDto: Partial<CreateTaskDto>): Promise<TaskDocument | null> {
    return this.tasksWriteService.update(id, updateTaskDto);
  }

  async remove(id: string): Promise<boolean> {
    return this.tasksWriteService.remove(id);
  }

  async moveTaskStatus(id: string, move: MoveTaskStatusDto): Promise<TaskDocument> {
    if (!id || !Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`ID inválido: ${id}`);
    }

    const task = await this.taskModel.findById(id).exec();
    if (!task) {
      throw new NotFoundException(`Task with id ${id} not found`);
    }

    const toStatus = move.status;

    // Rule: if task is concluded, it must stay in 'done' status
    if (task.isConcluded && toStatus !== 'done') {
      throw new BadRequestException('Tarefa concluída não pode ser movida para fora de "done"');
    }

    // If moving to 'done', use the conclude endpoint (with checklist validation)
    if (toStatus === 'done') {
      return this.markAsConcluded(id);
    }

    // Compute target kanbanOrder
    const projectId = task.project?.toString();

    let targetOrder: number | undefined = undefined;
    if (typeof move.toOrder === 'number' && Number.isFinite(move.toOrder)) {
      targetOrder = move.toOrder;
    }

    // If toIndex provided, compute order between neighbors
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

    // Fallback: append to end of column
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

  // ------------------------------ Checklist / Validation ------------------------------
  async generateChecklistViaCopilot(
    taskName: string,
    description?: string,
    microTaskType?: string,
  ): Promise<string[]> {
    return this.tasksChecklistService.generateChecklistForTask(taskName, description, microTaskType);
  }

  async generateChecklistViaCopilotWithHistory(
    taskName: string,
    description?: string,
    microTaskType?: string,
    projectId?: any,
  ): Promise<string[]> {
    return this.tasksChecklistService.generateChecklistWithHistory(
      taskName,
      description,
      microTaskType,
      projectId,
    );
  }

  async updateChecklistItem(
    taskId: string,
    itemIndex: string,
    completed: boolean,
  ): Promise<TaskDocument> {
    return this.tasksChecklistService.updateChecklistItem(taskId, itemIndex, completed);
  }

  async updateMicroTaskChecklist(
    id: string,
    checklist: Array<string | ChecklistItemDto>,
  ): Promise<TaskDocument> {
    return this.tasksChecklistService.updateMicroTaskChecklist(id, checklist);
  }

  async validateCompletionRequirements(taskId: string): Promise<{ isValid: boolean; reason?: string }> {
    return this.tasksChecklistService.validateCompletionRequirements(taskId);
  }

  async getValidationErrors(taskId: string): Promise<{ valid: boolean; errors: string[] }> {
    return this.tasksChecklistService.getValidationErrors(taskId);
  }

  // ------------------------------ Completion / Feedback ------------------------------
  async markAsConcluded(id: string): Promise<TaskDocument> {
    const result = await this.tasksCompletionService.markAsConcluded(id);

    // keep backward-compatible behavior: if recurringRule exists, generate next occurrence
    if (result?.recurringRule) {
      await this.handleTaskCompletion(id);
    }

    return result;
  }

  async incrementPomodorosDid(id: string): Promise<TaskDocument> {
    return this.tasksCompletionService.incrementPomodorosDid(id);
  }

  async handleTaskCompletion(taskId: string): Promise<TaskDocument | null> {
    const task = await this.findOne(taskId);
    if (!task) {
      return null;
    }

    if (task.recurringRule) {
      await this.taskModel
        .findByIdAndUpdate(taskId, { recurringState: 'completed' }, { new: true })
        .exec();
      await this.generateNextOccurrence(task);
    }

    return task;
  }

  async handleTaskSkipped(taskId: string): Promise<TaskDocument> {
    const task = await this.findOne(taskId);
    if (!task) {
      throw new NotFoundException(`Task with id ${taskId} not found`);
    }

    const updatedTask = await this.taskModel
      .findByIdAndUpdate(
        taskId,
        {
          recurringState: 'skipped',
          isConcluded: true,
          status: 'done',
          statusUpdatedAt: new Date(),
        },
        { new: true },
      )
      .exec();

    if (!updatedTask) {
      throw new NotFoundException(`Task with id ${taskId} not found`);
    }

    if (updatedTask.recurringRule) {
      await this.generateNextOccurrence(updatedTask);
    }

    return updatedTask;
  }

  async handleTaskDeferred(taskId: string, newDeadline: Date): Promise<TaskDocument> {
    if (!taskId || !Types.ObjectId.isValid(taskId)) {
      throw new BadRequestException(`ID inválido: ${taskId}`);
    }

    const parsedDeadline = new Date(newDeadline);
    if (Number.isNaN(parsedDeadline.getTime())) {
      throw new BadRequestException('newDeadline inválido');
    }

    const task = await this.taskModel.findById(taskId).exec();
    if (!task) {
      throw new NotFoundException(`Task with id ${taskId} not found`);
    }

    const updatedTask = await this.taskModel
      .findByIdAndUpdate(
        taskId,
        {
          deadline: parsedDeadline,
          statusUpdatedAt: new Date(),
        },
        { new: true },
      )
      .exec();

    if (!updatedTask) {
      throw new NotFoundException(`Task with id ${taskId} not found`);
    }

    return updatedTask;
  }

  async checkDeviationAndCreateAlert(taskId: string): Promise<{ alertCreated: boolean; alert?: any }> {
    return this.tasksCompletionService.createDeviationAlertForTask(taskId);
  }

  /**
   * Generate completion feedback via LLM and persist
   */
  async generateCompletionFeedback(id: string, payload?: any): Promise<string> {
    return this.feedbackService.generateCompletionFeedback(id, payload);
  }

  /**
   * Retrieve latest completion feedback for task
   */
  async getCompletionFeedback(id: string): Promise<{ feedback: string; createdAt: Date } | null> {
    return this.feedbackService.getCompletionFeedback(id);
  }

  // ------------------------------ Recurring / Habits ------------------------------
  async updateRecurringRule(id: string, recurringRule: RecurringRuleDto): Promise<TaskDocument> {
    if (!id || !Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`ID inválido: ${id}`);
    }
    if (!recurringRule?.frequency || !recurringRule?.interval) {
      throw new BadRequestException('recurringRule inválida: frequency e interval são obrigatórios.');
    }

    const updatedTask = await this.taskModel
      .findByIdAndUpdate(
        id,
        {
          recurringRule: this.tasksRecurringService.normalizeRecurringRule(recurringRule),
        },
        { new: true },
      )
      .exec();
    if (!updatedTask) {
      throw new NotFoundException(`Task with id ${id} not found`);
    }
    return updatedTask;
  }

  async generateNextOccurrence(taskOrId: string | TaskDocument): Promise<TaskDocument | null> {
    const task = typeof taskOrId === 'string' ? await this.findOne(taskOrId) : taskOrId;
    if (!task) {
      throw new NotFoundException('Task not found');
    }

    const recurringRule = task.recurringRule
      ? this.tasksRecurringService.normalizeRecurringRule(task.recurringRule)
      : undefined;
    if (!recurringRule) {
      return null;
    }

    const nextDeadline = this.tasksRecurringService.calculateNextRecurringDate(
      task.deadline || task.createdAt || new Date(),
      recurringRule,
    );
    if (!nextDeadline) {
      return null;
    }

    return this.createTaskCore(
      this.tasksRecurringService.buildOccurrencePayload(task, nextDeadline) as any,
    );
  }

  async findRecurringSeries(parentRecurringId: string): Promise<TaskDocument[]> {
    return this.tasksRecurringService.findRecurringSeries(parentRecurringId);
  }

  async deleteRecurringSeries(parentRecurringId: string): Promise<{ deletedCount: number }> {
    return this.tasksRecurringService.deleteRecurringSeries(parentRecurringId);
  }

  async getStreakData(parentRecurringId: string): Promise<{
    currentStreak: number;
    longestStreak: number;
    aderencePercent: number;
    lastCompletedDate: Date | null;
  }> {
    return this.tasksHabitsService.getStreakData(parentRecurringId);
  }

  async getHabitsDashboard(query: GetHabitsDashboardDto = {}): Promise<GetHabitsDashboardResponseDto> {
    return this.tasksHabitsService.getHabitsDashboard(query);
  }

  // ---------- AI / PERT ----------
  async generateAiSuggestionsWithProgress(
    dto: GenerateAiSuggestionsDto,
    onProgress: (progress: AiSuggestionsProgressDto) => void,
    onComplete: (result: AiSuggestionsResponseDto) => void,
    onError: (error: Error) => void,
  ): Promise<void> {
    return this.tasksAiSuggestionsService.generateAiSuggestionsWithProgress(
      dto,
      onProgress,
      onComplete,
      onError,
    );
  }

  async generateAiSuggestions(dto: GenerateAiSuggestionsDto): Promise<AiSuggestionsResponseDto> {
    return this.tasksAiSuggestionsService.generateAiSuggestions(dto);
  }

  async suggestPertEstimates(
    taskType: string,
    description: string,
    projectContext?: string,
  ): Promise<any> {
    return this.geminiService.suggestPertEstimates(taskType, description, projectContext);
  }

  async updatePert(taskId: string, updatePertDto: UpdatePertDto): Promise<TaskDocument> {
    return this.tasksPertService.updatePert(taskId, updatePertDto);
  }

  async savePertEstimate(
    taskId: string,
    pertEstimateDto: PertEstimateDto,
  ): Promise<PertEstimateResponseDto> {
    return this.tasksPertService.savePertEstimate(taskId, pertEstimateDto);
  }

  // ------------------------------ Read / Find operations ------------------------------
  async findAll(): Promise<TaskDocument[]> {
    return await this.taskModel.find().exec();
  }

  async findByProjectId(projectId: string, opts?: FindByProjectIdOptionsDto): Promise<TaskDocument[]> {
    if (!projectId || projectId === 'null' || projectId === 'undefined') {
      throw new BadRequestException(`Project ID inválido: ${projectId}`);
    }

    const query: any = {};
    if (Types.ObjectId.isValid(projectId)) {
      query.project = new Types.ObjectId(projectId);
    } else {
      // Fallback (should be rare): allow querying by raw value
      query.project = projectId;
    }

    const taskIds = Array.isArray(opts?.taskIds) ? opts.taskIds : [];
    if (taskIds.length > 0) {
      const validIds = taskIds.filter((id) => Types.ObjectId.isValid(id));
      if (validIds.length > 0) {
        query._id = { $in: validIds.map((id) => new Types.ObjectId(id)) };
      }
    }

    if (opts?.parentWbsNodeId) {
      query.parentWbsNodeId = String(opts.parentWbsNodeId);
    }

    return await this.taskModel.find(query).exec();
  }

  async findOne(id: string): Promise<TaskDocument | null> {
    if (!id || id === 'null' || id === 'undefined' || !Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`ID inválido: ${id}`);
    }
    return await this.taskModel.findById(id).exec();
  }

  async findMicroTask(id: string): Promise<TaskDocument> {
    const task = await this.findOne(id);
    if (!task) {
      throw new NotFoundException(`Task with id ${id} not found`);
    }
    return task;
  }

  // ------------------------------ Hierarchy / Value ------------------------------
  async getTaskLineage(
    id: string,
    maxDepth: number = 50,
  ): Promise<{
    ancestors: any[];
    children: any[];
    warnings: string[];
  }> {
    return this.tasksHierarchyService.getTaskLineage(id, maxDepth);
  }

  async getDescendants(id: string, maxDepth: number = 1000): Promise<any[]> {
    return this.tasksHierarchyService.getDescendants(id, maxDepth);
  }

  async calculateValueContribution(id: string): Promise<{
    contributionPercent: number;
    subtreeCompletedXP: number;
    totalCompletedXP: number;
    breakdown: Array<{ _id: any; experience: number; isConcluded: boolean }>;
  }> {
    return this.tasksHierarchyService.calculateValueContribution(id);
  }
}
