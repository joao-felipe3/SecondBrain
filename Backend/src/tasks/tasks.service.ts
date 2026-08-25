import { Injectable, NotFoundException, Inject, BadRequestException } from '@nestjs/common';

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
import {
  UpdateChecklistTaskItemDto,
  GenerateChecklistDto,
  GenerateChecklistWithHistoryDto,
  TaskLineageQueryDto,
  TaskDescendantQueryDto,
  ValueContributionResponseDto,
} from './dto';

// Schema
import { TaskDocument } from './schemas/task.schema';
import { TaskAlertDocument } from './schemas/task-alert.schema';
import { TaskRepository } from './interfaces/task-repository.interface';
import { Task } from './entities/task.entity';

// Services
import {
  CompletionFeedbackPayload,
  CompletionFeedbackResponse,
  FeedbackService,
} from './services/intelligence';
import { TasksRecurringService, TasksCompletionService, TasksWriteService } from './services/workflow';
import { TasksAiSuggestionsService, ChecklistOperationsService } from './services/intelligence';
import { TasksHabitsService } from './services/monitoring';
import { TasksPertService } from './services/analysis';
import { PertAiService } from '../ai/services/tasks/pert-ai.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TaskProgressUpdatedEvent } from './events/task.events';
import { TasksHierarchyService, TaskDescendantNode, TaskLineageResult } from './services/dependencies';

@Injectable()
export class TasksService {
  constructor(
    @Inject('TaskRepository') private readonly taskRepository: TaskRepository,
    private readonly eventEmitter: EventEmitter2,
    private readonly feedbackService: FeedbackService,
    private readonly tasksPertService: TasksPertService,
    private readonly pertAiService: PertAiService,
    private readonly tasksWriteService: TasksWriteService,
    private readonly tasksRecurringService: TasksRecurringService,
    private readonly tasksAiSuggestionsService: TasksAiSuggestionsService,
    private readonly tasksHabitsService: TasksHabitsService,
    private readonly tasksHierarchyService: TasksHierarchyService,
    private readonly checklistOperationsService: ChecklistOperationsService,
    private readonly tasksCompletionService: TasksCompletionService,
  ) {}

  public async recalculateProjectStats(projectId: string): Promise<void> {
    await Promise.resolve(
      this.eventEmitter.emit('task.progress_updated', new TaskProgressUpdatedEvent('', projectId)),
    );
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
  public async generateChecklistViaCopilot(dto: GenerateChecklistDto): Promise<string[]> {
    return this.checklistOperationsService.generateChecklistForTask(dto);
  }

  public async generateChecklistViaCopilotWithHistory(
    dto: GenerateChecklistWithHistoryDto,
  ): Promise<string[]> {
    return this.checklistOperationsService.generateChecklistWithHistory(dto);
  }

  public async updateChecklistItem(dto: UpdateChecklistTaskItemDto): Promise<TaskDocument> {
    return this.checklistOperationsService.updateChecklistItem(dto);
  }

  public async updateMicroTaskChecklist(
    id: string,
    checklist: Array<string | ChecklistItemDto>,
  ): Promise<TaskDocument> {
    return this.checklistOperationsService.updateMicroTaskChecklist(id, checklist);
  }

  public async validateCompletionRequirements(
    taskId: string,
  ): Promise<{ isValid: boolean; reason?: string }> {
    return this.checklistOperationsService.validateCompletionRequirements(taskId);
  }

  public async getValidationErrors(taskId: string): Promise<{ valid: boolean; errors: string[] }> {
    return this.checklistOperationsService.getValidationErrors(taskId);
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

  public async getCompletionFeedback(id: string): Promise<CompletionFeedbackResponse | null> {
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
  public async generateAiSuggestionsWithProgress(params: {
    dto: GenerateAiSuggestionsDto;
    onProgress: (progress: AiSuggestionsProgressDto) => void;
    onComplete: (result: AiSuggestionsResponseDto) => void;
    onError: (error: Error) => void;
  }): Promise<void> {
    await this.tasksAiSuggestionsService.generateAiSuggestionsWithProgress(params);
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
  ): Promise<Awaited<ReturnType<PertAiService['suggestPertEstimates']>>> {
    const estimates = await this.pertAiService.suggestPertEstimates({
      taskType,
      description,
      projectContext,
    });
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
  public async findAll(): Promise<Task[]> {
    return await this.taskRepository.findAll();
  }

  public async findByProjectId(projectId: string, opts?: FindByProjectIdOptionsDto): Promise<Task[]> {
    return await this.taskRepository.findByProjectId(projectId, opts);
  }

  public async findOne(id: string): Promise<Task | null> {
    if (!id || id === 'null' || id === 'undefined') {
      throw new BadRequestException(`ID inválido: ${id}`);
    }
    return await this.taskRepository.findById(id);
  }

  public async findMicroTask(id: string): Promise<Task> {
    const task = await this.findOne(id);
    if (!task) {
      throw new NotFoundException(`Task with id ${id} not found`);
    }
    return task;
  }

  // ------------------------------ Hierarchy / Value ------------------------------
  public async getTaskLineage(id: string, query?: TaskLineageQueryDto): Promise<TaskLineageResult> {
    return this.tasksHierarchyService.getTaskLineage(id, query);
  }

  public async getDescendants(
    id: string,
    query?: TaskDescendantQueryDto,
  ): Promise<TaskDescendantNode[]> {
    return this.tasksHierarchyService.getDescendants(id, query);
  }

  public async calculateValueContribution(id: string): Promise<ValueContributionResponseDto> {
    return this.tasksHierarchyService.calculateValueContribution(id);
  }
}
