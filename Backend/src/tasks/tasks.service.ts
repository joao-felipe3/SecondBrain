import { Injectable, NotFoundException, Inject, forwardRef, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';

// DTOs
import { CreateTaskDto, ChecklistItemDto, RecurringRuleDto } from './dto/task/create-task.dto';
import { GetHabitsDashboardDto } from './dto/monitoring/get-habits-dashboard.dto';
import { CreateMicroTaskDto } from './dto/task/create-micro-task.dto';
import {
  GenerateAiSuggestionsDto,
  AiSuggestionsResponseDto,
  AiSuggestionsProgressDto,
} from './dto/intelligence/generate-ai-suggestions.dto';
import { PertEstimateDto, PertEstimateResponseDto } from './dto/analysis/pert-estimate.dto';
import { GetHabitsDashboardResponseDto } from './dto/monitoring/habits-dashboard.dto';
import { MoveTaskStatusDto } from './dto/task/move-task-status.dto';
import { CreateManyTasksOptionsDto } from './dto/task/create-many-tasks-options.dto';
import { FindByProjectIdOptionsDto } from './dto/query/find-by-project-id-options.dto';
import { UpdatePertDto } from './dto/analysis/suggest-pert.dto';

// Schema
import { TaskDocument } from './schemas/task.schema';
import { TaskAlertDocument } from './schemas/task-alert.schema';

// Services
import { ProjectsService } from '../projects/projects.service';
import { GeminiService } from '../ai/gemini.service';
import { CompletionFeedbackPayload, FeedbackService } from './services/intelligence';
import { TasksRecurringService, TasksCompletionService, TasksWriteService } from './services/workflow';
import {
  TasksAiSuggestionsService,
  TasksChecklistService,
  ChecklistHistoryProjectRef,
} from './services/intelligence';
import { TasksHabitsService } from './services/monitoring';
import { TasksPertService } from './services/analysis';
import { TasksHierarchyService, TaskDescendantNode, TaskLineageResult } from './services/dependencies';

@Injectable()
export class TasksService {
  constructor(
    @InjectModel('Task') private readonly taskModel: Model<TaskDocument>,
    @Inject(forwardRef(() => ProjectsService))
    private readonly projectsService: ProjectsService,
    @Inject(forwardRef(() => GeminiService))
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

  public async recalculateProjectStats(projectId: string): Promise<void> {
    await this.projectsService.recalculateProjectStats(projectId);
  }

  // ---------------------------------------- Creation / Write operations ----------------------------------------
  public async createMany(
    createTaskDtos: CreateTaskDto[],
    options?: CreateManyTasksOptionsDto,
  ): Promise<TaskDocument[]> {
    return this.tasksWriteService.createMany(createTaskDtos, options);
  }

  public async create(createTaskDto: CreateTaskDto): Promise<TaskDocument> {
    if (createTaskDto.microTaskType) {
      return this.createMicroTask({
        ...createTaskDto,
        autoGenerateChecklist: true,
      });
    }

    return this.createTaskCore(createTaskDto);
  }

  public async createMicroTask(createMicroTaskDto: CreateMicroTaskDto): Promise<TaskDocument> {
    return this.tasksWriteService.createMicroTask(createMicroTaskDto);
  }

  public async createRecurringTemplate(createMicroTaskDto: CreateMicroTaskDto): Promise<TaskDocument> {
    return this.tasksRecurringService.createRecurringTemplate(createMicroTaskDto);
  }

  public async createRecurringMicroTask(createMicroTaskDto: CreateMicroTaskDto): Promise<TaskDocument> {
    return this.tasksRecurringService.createRecurringMicroTask(createMicroTaskDto);
  }

  private async createTaskCore(createTaskDto: CreateTaskDto): Promise<TaskDocument> {
    return this.tasksWriteService.createTaskCore(createTaskDto);
  }

  // ------------------------------ Update / Delete / Move ------------------------------
  public async update(id: string, updateTaskDto: Partial<CreateTaskDto>): Promise<TaskDocument | null> {
    return this.tasksWriteService.update(id, updateTaskDto);
  }

  public async remove(id: string): Promise<boolean> {
    return this.tasksWriteService.remove(id);
  }

  public async moveTaskStatus(id: string, move: MoveTaskStatusDto): Promise<TaskDocument> {
    return this.tasksCompletionService.moveTaskStatus(id, move);
  }

  // ------------------------------ Checklist / Validation ------------------------------
  public async generateChecklistViaCopilot(
    taskName: string,
    description?: string,
    microTaskType?: string,
  ): Promise<string[]> {
    return this.tasksChecklistService.generateChecklistForTask(taskName, description, microTaskType);
  }

  public async generateChecklistViaCopilotWithHistory(
    taskName: string,
    description?: string,
    microTaskType?: string,
    projectId?: ChecklistHistoryProjectRef,
  ): Promise<string[]> {
    return this.tasksChecklistService.generateChecklistWithHistory(
      taskName,
      description,
      microTaskType,
      projectId,
    );
  }

  public async updateChecklistItem(
    taskId: string,
    itemIndex: string,
    completed: boolean,
  ): Promise<TaskDocument> {
    return this.tasksChecklistService.updateChecklistItem(taskId, itemIndex, completed);
  }

  public async updateMicroTaskChecklist(
    id: string,
    checklist: Array<string | ChecklistItemDto>,
  ): Promise<TaskDocument> {
    return this.tasksChecklistService.updateMicroTaskChecklist(id, checklist);
  }

  public async validateCompletionRequirements(
    taskId: string,
  ): Promise<{ isValid: boolean; reason?: string }> {
    return this.tasksChecklistService.validateCompletionRequirements(taskId);
  }

  public async getValidationErrors(taskId: string): Promise<{ valid: boolean; errors: string[] }> {
    return this.tasksChecklistService.getValidationErrors(taskId);
  }

  // ------------------------------ Completion / Feedback ------------------------------
  public async markAsConcluded(id: string): Promise<TaskDocument> {
    const result: TaskDocument = await this.tasksCompletionService.markAsConcluded(id);

    // if recurringRule exists, generate next occurrence
    if (result?.recurringRule) {
      await this.handleTaskCompletion(id);
    }

    return result;
  }

  public async incrementPomodorosDid(id: string): Promise<TaskDocument> {
    return this.tasksCompletionService.incrementPomodorosDid(id);
  }

  public async handleTaskCompletion(taskId: string): Promise<TaskDocument | null> {
    const task: TaskDocument | null = await this.tasksCompletionService.handleTaskCompletion(taskId);
    return task;
  }

  public async handleTaskSkipped(taskId: string): Promise<TaskDocument> {
    const task: TaskDocument = await this.tasksCompletionService.handleTaskSkipped(taskId);
    return task;
  }

  public async handleTaskDeferred(taskId: string, newDeadline: Date): Promise<TaskDocument> {
    const task: TaskDocument = await this.tasksCompletionService.handleTaskDeferred(taskId, newDeadline);
    return task;
  }

  public async checkDeviationAndCreateAlert(taskId: string): Promise<{
    alertCreated: boolean;
    alert?: TaskAlertDocument;
  }> {
    return this.tasksCompletionService.createDeviationAlertForTask(taskId);
  }

  public async generateCompletionFeedback(
    id: string,
    payload?: CompletionFeedbackPayload,
  ): Promise<string> {
    return this.feedbackService.generateCompletionFeedback(id, payload);
  }

  public async getCompletionFeedback(id: string): Promise<{ feedback: string; createdAt: Date } | null> {
    return this.feedbackService.getCompletionFeedback(id);
  }

  // ------------------------------ Recurring / Habits ------------------------------
  public async updateRecurringRule(id: string, recurringRule: RecurringRuleDto): Promise<TaskDocument> {
    return this.tasksRecurringService.updateRecurringRule(id, recurringRule);
  }

  public async generateNextOccurrence(taskOrId: string | TaskDocument): Promise<TaskDocument | null> {
    return this.tasksRecurringService.generateNextOccurrence(taskOrId);
  }

  public async findRecurringSeries(parentRecurringId: string): Promise<TaskDocument[]> {
    return this.tasksRecurringService.findRecurringSeries(parentRecurringId);
  }

  public async deleteRecurringSeries(parentRecurringId: string): Promise<{ deletedCount: number }> {
    return this.tasksRecurringService.deleteRecurringSeries(parentRecurringId);
  }

  public async getStreakData(parentRecurringId: string): Promise<{
    currentStreak: number;
    longestStreak: number;
    aderencePercent: number;
    lastCompletedDate: Date | null;
  }> {
    return this.tasksHabitsService.getStreakData(parentRecurringId);
  }

  public async getHabitsDashboard(
    query: GetHabitsDashboardDto = {},
  ): Promise<GetHabitsDashboardResponseDto> {
    return this.tasksHabitsService.getHabitsDashboard(query);
  }

  // ------------------------------ AI / PERT ------------------------------
  public async generateAiSuggestionsWithProgress(
    dto: GenerateAiSuggestionsDto,
    onProgress: (progress: AiSuggestionsProgressDto) => void,
    onComplete: (result: AiSuggestionsResponseDto) => void,
    onError: (error: Error) => void,
  ): Promise<void> {
    await this.tasksAiSuggestionsService.generateAiSuggestionsWithProgress(
      dto,
      onProgress,
      onComplete,
      onError,
    );
  }

  public async generateAiSuggestions(dto: GenerateAiSuggestionsDto): Promise<AiSuggestionsResponseDto> {
    const suggestions: AiSuggestionsResponseDto =
      await this.tasksAiSuggestionsService.generateAiSuggestions(dto);
    return suggestions;
  }

  public async suggestPertEstimates(
    taskType: string,
    description: string,
    projectContext?: string,
  ): Promise<Awaited<ReturnType<GeminiService['suggestPertEstimates']>>> {
    const estimates = await this.geminiService.suggestPertEstimates(
      taskType,
      description,
      projectContext,
    );
    return estimates;
  }

  public async updatePert(taskId: string, updatePertDto: UpdatePertDto): Promise<TaskDocument> {
    return this.tasksPertService.updatePert(taskId, updatePertDto);
  }

  public async savePertEstimate(
    taskId: string,
    pertEstimateDto: PertEstimateDto,
  ): Promise<PertEstimateResponseDto> {
    return this.tasksPertService.savePertEstimate(taskId, pertEstimateDto);
  }

  // ------------------------------ Read / Find operations ------------------------------
  public async findAll(): Promise<TaskDocument[]> {
    return await this.taskModel.find().exec();
  }

  public async findByProjectId(
    projectId: string,
    opts?: FindByProjectIdOptionsDto,
  ): Promise<TaskDocument[]> {
    if (!projectId || projectId === 'null' || projectId === 'undefined') {
      throw new BadRequestException(`Project ID inválido: ${projectId}`);
    }

    const query: FilterQuery<TaskDocument> & { parentWbsNodeId?: string } = {};
    if (Types.ObjectId.isValid(projectId)) {
      query.project = new Types.ObjectId(projectId);
    }

    const taskIds = Array.isArray(opts?.taskIds) ? opts.taskIds : [];
    if (taskIds.length > 0) {
      const validIds = taskIds.filter((id) => Types.ObjectId.isValid(id));
      if (validIds.length > 0) {
        const validObjectIds = validIds.map((id) => new Types.ObjectId(id));
        query._id = { $in: validObjectIds } as FilterQuery<TaskDocument>['_id'];
      }
    }

    if (opts?.parentWbsNodeId) {
      query.parentWbsNodeId = String(opts.parentWbsNodeId);
    }

    return await this.taskModel.find(query).exec();
  }

  public async findOne(id: string): Promise<TaskDocument | null> {
    if (!id || id === 'null' || id === 'undefined' || !Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`ID inválido: ${id}`);
    }
    return await this.taskModel.findById(id).exec();
  }

  public async findMicroTask(id: string): Promise<TaskDocument> {
    const task = await this.findOne(id);
    if (!task) {
      throw new NotFoundException(`Task with id ${id} not found`);
    }
    return task;
  }

  // ------------------------------ Hierarchy / Value ------------------------------
  public async getTaskLineage(id: string, maxDepth: number = 50): Promise<TaskLineageResult> {
    return this.tasksHierarchyService.getTaskLineage(id, maxDepth);
  }

  public async getDescendants(id: string, maxDepth: number = 1000): Promise<TaskDescendantNode[]> {
    return this.tasksHierarchyService.getDescendants(id, maxDepth);
  }

  public async calculateValueContribution(id: string): Promise<{
    contributionPercent: number;
    subtreeCompletedXP: number;
    totalCompletedXP: number;
    breakdown: Array<{ _id: Types.ObjectId | string; experience: number; isConcluded: boolean }>;
  }> {
    return this.tasksHierarchyService.calculateValueContribution(id);
  }
}
