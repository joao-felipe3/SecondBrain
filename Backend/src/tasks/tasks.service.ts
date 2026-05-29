import { Injectable, NotFoundException, Inject, forwardRef, BadRequestException, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateTaskDto } from './dto/create-task.dto';
import { GetHabitsDashboardDto } from './dto/get-habits-dashboard.dto';
import { ChecklistItemDto, RecurringRuleDto } from './dto/create-task.dto';
import { CreateMicroTaskDto } from './dto/create-micro-task.dto';
import { TaskDocument } from './schemas/task.schema';
import { ProjectDocument } from '../projects/schemas/project.schema';
import { ProjectsService } from '../projects/projects.service';
import { GenerateAiSuggestionsDto, AiSuggestionsResponseDto, AiSuggestionsProgressDto } from './dto/generate-ai-suggestions.dto';
import { GeminiService } from '../ai/gemini.service';
import { ChecklistService } from './services/checklist.service';
import { PertService } from './services/pert.service';
import { FeedbackService } from './services/feedback.service';
import { PertEstimateDto, PertEstimateResponseDto } from './dto/pert-estimate.dto';
import { EVMService } from '../projects/services/evm.service';
import { AlertsService } from './services/alerts.service';
import { DeviationDetectionService } from './services/deviation-detection.service';
import { TasksRecurringService } from './services/tasks/recurring.service';
import { TasksInputService } from './services/tasks/input.service';
import { TasksAiSuggestionsService } from './services/tasks/ai-suggestions.service';
import { TasksHabitsService } from './services/tasks/habits.service';
import { TasksMetricsService } from './services/tasks/metrics.service';
import { TasksHierarchyService } from './services/tasks/hierarchy.service';
import { TasksChecklistService } from './services/tasks/checklist.service';
import { TasksCompletionService } from './services/tasks/completion.service';
import { TasksPertService } from './services/tasks/tasks-pert.service';
import { TasksWriteService } from './services/tasks/write.service';
import { MoveTaskStatusDto } from './dto/move-task-status.dto';
import { CreateManyTasksOptionsDto } from './dto/create-many-tasks-options.dto';
import { FindByProjectIdOptionsDto } from './dto/find-by-project-id-options.dto';
import { UpdatePertDto } from './dto/suggest-pert.dto';

@Injectable()
export class TasksService {
  private readonly fallbackRecurringService: TasksRecurringService;
  private readonly fallbackInputService = new TasksInputService();
  private readonly fallbackAiSuggestionsService: TasksAiSuggestionsService;
  private readonly fallbackHabitsService: TasksHabitsService;
  private readonly fallbackMetricsService = new TasksMetricsService();
  private readonly fallbackHierarchyService: TasksHierarchyService;
  private readonly fallbackChecklistService: TasksChecklistService;
  private readonly fallbackCompletionService: TasksCompletionService;
  private readonly fallbackPertService: TasksPertService;
  private readonly fallbackWriteService: TasksWriteService;

  constructor(
    @InjectModel('Task') private readonly taskModel: Model<TaskDocument>,
    @InjectModel('Project') private readonly projectModel: Model<ProjectDocument>,
    @Inject(forwardRef(() => ProjectsService))
    private readonly projectsService: ProjectsService,
    @Inject(forwardRef(() => EVMService))
    private readonly evmService: EVMService,
    private readonly geminiService: GeminiService, // Injeta o GeminiService
    private readonly checklistService: ChecklistService, // Sprint 2: Validação e histórico de checklist
    private readonly pertService: PertService, // Injeta o PertService
    private readonly feedbackService: FeedbackService,
    private readonly alertsService: AlertsService,
    private readonly deviationDetectionService: DeviationDetectionService,
    @Optional() private readonly tasksPertService?: TasksPertService,
    @Optional() private readonly tasksWriteService?: TasksWriteService,
    @Optional() private readonly tasksRecurringService?: TasksRecurringService,
    @Optional() private readonly tasksInputService?: TasksInputService,
    @Optional() private readonly tasksAiSuggestionsService?: TasksAiSuggestionsService,
    @Optional() private readonly tasksHabitsService?: TasksHabitsService,
    @Optional() private readonly tasksMetricsService?: TasksMetricsService,
    @Optional() private readonly tasksHierarchyService?: TasksHierarchyService,
    @Optional() private readonly tasksChecklistService?: TasksChecklistService,
    @Optional() private readonly tasksCompletionService?: TasksCompletionService,
  ) {
    this.fallbackAiSuggestionsService = new TasksAiSuggestionsService(
      this.taskModel,
      this.geminiService,
    );
    this.fallbackRecurringService = new TasksRecurringService(this.taskModel, this.projectsService);
    this.fallbackHabitsService = new TasksHabitsService(this.taskModel);
    this.fallbackHierarchyService = new TasksHierarchyService(this.taskModel);
    this.fallbackChecklistService = new TasksChecklistService(this.taskModel, this.checklistService, this.fallbackInputService, this.geminiService);
    this.fallbackCompletionService = new TasksCompletionService(
      this.taskModel,
      this.projectsService,
      this.evmService,
      this.metricsService,
      this.deviationDetectionService,
      this.alertsService,
    );
    this.fallbackPertService = new TasksPertService(
      this.taskModel,
      new PertService(),
      this.fallbackMetricsService,
    );
    this.fallbackWriteService = new TasksWriteService(
      this.taskModel,
      this.projectModel,
      this.projectsService,
      this.fallbackMetricsService,
    );
  }

  private get recurringService(): TasksRecurringService {
    return this.tasksRecurringService ?? this.fallbackRecurringService;
  }

  private get inputService(): TasksInputService {
    return this.tasksInputService ?? this.fallbackInputService;
  }

  private get aiSuggestionsService(): TasksAiSuggestionsService {
    return this.tasksAiSuggestionsService ?? this.fallbackAiSuggestionsService;
  }

  private get habitsService(): TasksHabitsService {
    return this.tasksHabitsService ?? this.fallbackHabitsService;
  }

  private get metricsService(): TasksMetricsService {
    return this.tasksMetricsService ?? this.fallbackMetricsService;
  }

  private get hierarchyService(): TasksHierarchyService {
    return this.tasksHierarchyService ?? this.fallbackHierarchyService;
  }

  private get checklistTasksService(): TasksChecklistService {
    return this.tasksChecklistService ?? this.fallbackChecklistService;
  }

  private get completionService(): TasksCompletionService {
    return this.tasksCompletionService ?? this.fallbackCompletionService;
  }

  private get pertWorkflowService(): TasksPertService {
    return this.tasksPertService ?? this.fallbackPertService;
  }

  private get writeService(): TasksWriteService {
    return this.tasksWriteService ?? this.fallbackWriteService;
  }

  async recalculateProjectStats(projectId: string): Promise<void> {
    await this.projectsService.recalculateProjectStats(projectId);
  }

  async createMany(
    createTaskDtos: CreateTaskDto[],
    options?: CreateManyTasksOptionsDto,
  ): Promise<TaskDocument[]> {
    return this.writeService.createMany(createTaskDtos, options);
  }

  // validatePertInput and normalizeChecklist extracted to TasksInputService (SRP)

  private async createTaskCore(createTaskDto: CreateTaskDto): Promise<TaskDocument> {
    return this.writeService.createTaskCore(createTaskDto);
  }

  // ... (outros métodos como create, findAll, etc. permanecem os mesmos)
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
    this.inputService.validatePertInput(createMicroTaskDto);

    const checklistWasProvided = Object.prototype.hasOwnProperty.call(
      createMicroTaskDto,
      'checklist',
    );

    const normalizedChecklist = this.inputService.normalizeChecklist(createMicroTaskDto.checklist);
    const payload: CreateTaskDto = {
      ...createMicroTaskDto,
      checklist: normalizedChecklist as any,
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
      // Sprint 2: Gera checklist com contexto histórico
      const generated = await this.generateChecklistViaCopilotWithHistory(
        payload.name,
        payload.description,
        payload.microTaskType,
        payload.project,
      );
      payload.checklist = this.inputService.normalizeChecklist(generated);
    }

    // Sprint 2: Valida estrutura do checklist se gerado ou fornecido
    if (normalizedChecklist && normalizedChecklist.length > 0) {
      const validation = this.checklistService.validateChecklistStructure(
        normalizedChecklist.map((item) => ({ item: item.item, completed: item.completed })),
      );
      if (!validation.isValid) {
        throw new BadRequestException(validation.reason);
      }
    }

    return this.createTaskCore(payload);
  }

  async generateChecklistViaCopilot(
    taskName: string,
    description?: string,
    microTaskType?: string,
  ): Promise<string[]> {
    return this.checklistTasksService.generateChecklistForTask(taskName, description, microTaskType);
  }

  /**
   * Sprint 2: Gera checklist enriquecido com contexto histórico.
   * Busca tarefas similares concluídas e injeta no prompt do Gemini.
   *
   * @param taskName Nome da tarefa
   * @param description Descrição da tarefa
   * @param microTaskType Tipo de micro-tarefa
   * @param projectId ID do projeto (para buscar histórico)
   * @returns Array com itens do checklist
   */
  async generateChecklistViaCopilotWithHistory(
    taskName: string,
    description?: string,
    microTaskType?: string,
    projectId?: any,
  ): Promise<string[]> {
    return this.checklistTasksService.generateChecklistWithHistory(
      taskName,
      description,
      microTaskType,
      projectId,
    );
  }

  async updateMicroTaskChecklist(
    id: string,
    checklist: Array<string | ChecklistItemDto>,
  ): Promise<TaskDocument> {
    return this.checklistTasksService.updateMicroTaskChecklist(id, checklist);
  }

  /**
   * Sprint 2: Atualiza um item específico do checklist.
   * Útil para toggle de completed via frontend sem reenviar lista inteira.
   *
   * @param taskId ID da tarefa
   * @param itemIndex Índice do item no array checklist
   * @param completed Novo valor de completed
   * @returns Tarefa atualizada
   */
  async updateChecklistItem(
    taskId: string,
    itemIndex: string,
    completed: boolean,
  ): Promise<TaskDocument> {
    return this.checklistTasksService.updateChecklistItem(taskId, itemIndex, completed);
  }

  async findMicroTask(id: string): Promise<TaskDocument> {
    const task = await this.findOne(id);
    if (!task) {
      throw new NotFoundException(`Task with id ${id} not found`);
    }
    return task;
  }

  /**
   * Sprint 2: Valida se tarefa pode ser concluída.
   * Se a tarefa possui checklist, todos os itens devem estar completos (100%).
   *
   * @param taskId ID da tarefa
   * @returns ValidationResult - isValid=true se pode concluir, false com reason se não
   */
  async validateCompletionRequirements(taskId: string): Promise<{ isValid: boolean; reason?: string }> {
    return this.checklistTasksService.validateCompletionRequirements(taskId);
  }

  async getValidationErrors(taskId: string): Promise<{ valid: boolean; errors: string[] }> {
    return this.checklistTasksService.getValidationErrors(taskId);
  }

  async checkDeviationAndCreateAlert(taskId: string): Promise<{ alertCreated: boolean; alert?: any }> {
    return this.completionService.createDeviationAlertForTask(taskId);
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
      ? this.recurringService.normalizeRecurringRule(template.recurringRule as any)
      : undefined;
    if (!recurringRule) {
      return template;
    }

    const referenceStart = new Date((createMicroTaskDto as any)?.deadline || template.deadline || template.createdAt || new Date());
    const firstDeadline = this.recurringService.calculateFirstRecurringDate(referenceStart, recurringRule);
    if (!firstDeadline) {
      return template;
    }

    const firstOccurrence = await this.createTaskCore(
      this.recurringService.buildOccurrencePayload(template, firstDeadline) as any,
    );
    return firstOccurrence || template;
  }

  async updateRecurringRule(id: string, recurringRule: RecurringRuleDto): Promise<TaskDocument> {
    if (!id || !Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`ID inválido: ${id}`);
    }
    if (!recurringRule?.frequency || !recurringRule?.interval) {
      throw new BadRequestException('recurringRule inválida: frequency e interval são obrigatórios.');
    }

    const updatedTask = await this.taskModel
      .findByIdAndUpdate(id, { recurringRule: this.recurringService.normalizeRecurringRule(recurringRule) }, { new: true })
      .exec();
    if (!updatedTask) {
      throw new NotFoundException(`Task with id ${id} not found`);
    }
    return updatedTask;
  }

  async createRecurringTemplate(createMicroTaskDto: CreateMicroTaskDto): Promise<TaskDocument> {
    const recurringRule = this.recurringService.normalizeRecurringRule(createMicroTaskDto.recurringRule as RecurringRuleDto | undefined);
    const template = await this.createMicroTask({
      ...createMicroTaskDto,
      recurringRule,
      isRecurringInstance: false,
      recurringState: 'pending',
    } as any);

    return template;
  }

  async generateNextOccurrence(taskOrId: string | TaskDocument): Promise<TaskDocument | null> {
    const task = typeof taskOrId === 'string' ? await this.findOne(taskOrId) : taskOrId;
    if (!task) {
      throw new NotFoundException('Task not found');
    }

    const recurringRule = task.recurringRule ? this.recurringService.normalizeRecurringRule(task.recurringRule) : undefined;
    if (!recurringRule) {
      return null;
    }

    const nextDeadline = this.recurringService.calculateNextRecurringDate(task.deadline || task.createdAt || new Date(), recurringRule);
    if (!nextDeadline) {
      return null;
    }

    return this.createTaskCore(this.recurringService.buildOccurrencePayload(task, nextDeadline) as any);
  }

  async handleTaskCompletion(taskId: string): Promise<TaskDocument | null> {
    const task = await this.findOne(taskId);
    if (!task) {
      return null;
    }

    if (task.recurringRule) {
      await this.taskModel.findByIdAndUpdate(taskId, { recurringState: 'completed' }, { new: true }).exec();
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

  async getStreakData(parentRecurringId: string): Promise<{
    currentStreak: number;
    longestStreak: number;
    aderencePercent: number;
    lastCompletedDate: Date | null;
  }> {
    return this.habitsService.getStreakData(parentRecurringId);
  }

  async getHabitsDashboard(query: GetHabitsDashboardDto = {}): Promise<{
    projectId?: string;
    totalHabits: number;
    activeHabits: number;
    averageAderencePercent: number;
    streaksOver7Days: number;
    dueTodayCount: number;
    dueTodayHabits: Array<{
      id: string;
      name: string;
      deadline: Date | null;
    }>;
    habits: Array<{
      id: string;
      name: string;
      status: string;
      currentStreak: number;
      longestStreak: number;
      aderencePercent: number;
      lastCompletedDate: Date | null;
      deadline: Date | null;
    }>;
  }> {
    return this.habitsService.getHabitsDashboard(query);
  }

  async findRecurringSeries(parentRecurringId: string): Promise<TaskDocument[]> {
    return this.recurringService.findRecurringSeries(parentRecurringId);
  }

  async deleteRecurringSeries(parentRecurringId: string): Promise<{ deletedCount: number }> {
    return this.recurringService.deleteRecurringSeries(parentRecurringId);
  }

  /**
   * Sprint 3: Sugerir estimativas PERT via Gemini LLM
   * @param taskType Tipo de tarefa ('subtask', 'quick', 'complex', 'habit')
   * @param description Descrição da tarefa
   * @param projectContext Contexto opcional do projeto
   * @returns Sugestões de O, M, P, TE, desvio padrão, recomendação
   */
  async suggestPertEstimates(
    taskType: string,
    description: string,
    projectContext?: string,
  ): Promise<any> {
    return this.geminiService.suggestPertEstimates(taskType, description, projectContext);
  }

  /**
   * Sprint 3: Atualizar estimativas PERT de uma tarefa existente
   * @param taskId ID da tarefa
   * @param updatePertDto DTO com pertOptimistic, pertLikely, pertPessimistic em minutos
   * @returns Tarefa atualizada com PERT recalculado
   */
  async updatePert(
    taskId: string,
    updatePertDto: UpdatePertDto,
  ): Promise<TaskDocument> {
    return this.pertWorkflowService.updatePert(taskId, updatePertDto);
  }

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

    const taskIds = Array.isArray(opts?.taskIds) ? opts!.taskIds : [];
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

  async update(id: string, updateTaskDto: Partial<CreateTaskDto>): Promise<TaskDocument | null> {
    return this.writeService.update(id, updateTaskDto);
  }

  async remove(id: string): Promise<boolean> {
    return this.writeService.remove(id);
  }

  async markAsConcluded(id: string): Promise<TaskDocument> {
    const result = await this.completionService.markAsConcluded(id);

    // keep backward-compatible behavior: if recurringRule exists, generate next occurrence
    if (result?.recurringRule) {
      await this.handleTaskCompletion(id);
    }

    return result;
  }

  async incrementPomodorosDid(id: string): Promise<TaskDocument> {
    return this.completionService.incrementPomodorosDid(id);
  }


  /**
   * Versão com callback de progresso para streaming em tempo real
   */
  async generateAiSuggestionsWithProgress(
    dto: GenerateAiSuggestionsDto,
    onProgress: (progress: AiSuggestionsProgressDto) => void,
    onComplete: (result: AiSuggestionsResponseDto) => void,
    onError: (error: Error) => void,
  ): Promise<void> {
    return this.aiSuggestionsService.generateAiSuggestionsWithProgress(
      dto,
      onProgress,
      onComplete,
      onError,
    );
  }

  /**
   * Versão original que retorna Promise (mantida para compatibilidade)
   */
  async generateAiSuggestions(dto: GenerateAiSuggestionsDto): Promise<AiSuggestionsResponseDto> {
    return this.aiSuggestionsService.generateAiSuggestions(dto);
  }

  /**
   * Salva uma estimativa PERT (3 pontos) para uma tarefa existente
   * 
   * @param taskId - ID da tarefa
   * @param pertEstimateDto - Estimativas otimista, provável e pessimista
   * @returns Objeto com tempo esperado, variância e recomendações
   * @throws NotFoundException se a tarefa não existir
   * @throws BadRequestException se as estimativas forem inválidas
   */
  async savePertEstimate(
    taskId: string,
    pertEstimateDto: PertEstimateDto,
  ): Promise<PertEstimateResponseDto> {
    return this.pertWorkflowService.savePertEstimate(taskId, pertEstimateDto);
  }

  async moveTaskStatus(
    id: string,
    move: MoveTaskStatusDto,
  ): Promise<TaskDocument> {
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

  /**
   * Get task lineage (parent chain + children)
   */
  async getTaskLineage(id: string, maxDepth: number = 50): Promise<{
    ancestors: any[];
    children: any[];
    warnings: string[];
  }> {
    return this.hierarchyService.getTaskLineage(id, maxDepth);
  }

  /**
   * Retorna todos os descendentes (filhos, netos, etc.) de uma task
   */
  async getDescendants(id: string, maxDepth: number = 1000): Promise<any[]> {
    return this.hierarchyService.getDescendants(id, maxDepth);
  }

  /**
   * Calcula a contribuição de valor (XP) desta tarefa para o objetivo raiz.
   * Método pragmático: encontra a raiz (top ancestor), soma XP de todas as tasks concluídas
   * dentro da árvore do root e soma XP concluída dentro do subtree desta task.
   * Retorna percentuais e detalhamento simples.
   */
  async calculateValueContribution(id: string): Promise<{
    contributionPercent: number;
    subtreeCompletedXP: number;
    totalCompletedXP: number;
    breakdown: Array<{ _id: any; experience: number; isConcluded: boolean }>;
  }> {
    return this.hierarchyService.calculateValueContribution(id);
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
}
