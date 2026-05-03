import { Injectable, NotFoundException, Inject, forwardRef, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateTaskDto } from './dto/create-task.dto';
import { ChecklistItemDto, RecurringRuleDto } from './dto/create-task.dto';
import { CreateMicroTaskDto } from './dto/create-micro-task.dto';
import { TaskDocument } from './schemas/task.schema';
import { ProjectDocument } from '../projects/schemas/project.schema';
import { ProjectsService } from '../projects/projects.service';
import { GenerateAiSuggestionsDto, AiTaskSuggestionDto, AiSuggestionsResponseDto, AiSuggestionsProgressDto } from './dto/generate-ai-suggestions.dto';
import { GeminiService } from './gemini.service';
import { ChecklistService } from './checklist.service';
import { PertService } from './services/pert.service';
import { FeedbackService } from './feedback.service';
import { PertEstimateDto, PertEstimateResponseDto } from './dto/pert-estimate.dto';
import { EVMService } from '../projects/services/evm.service';

@Injectable()
export class TasksService {
  constructor(
    @InjectModel('Task') private readonly taskModel: Model<TaskDocument>,
    @InjectModel('Project') private readonly projectModel: Model<ProjectDocument>,
    @InjectModel('TaskCompletionFeedback') private readonly feedbackModel: Model<any>,
    @Inject(forwardRef(() => ProjectsService))
    private readonly projectsService: ProjectsService,
    @Inject(forwardRef(() => EVMService))
    private readonly evmService: EVMService,
    private readonly geminiService: GeminiService, // Injeta o GeminiService
    private readonly checklistService: ChecklistService, // Sprint 2: Validação e histórico de checklist
    private readonly pertService: PertService, // Injeta o PertService
    private readonly feedbackService: FeedbackService,
  ) {}

  async recalculateProjectStats(projectId: string): Promise<void> {
    await this.projectsService.recalculateProjectStats(projectId);
  }

  async createMany(
    createTaskDtos: CreateTaskDto[],
    options?: {
      /**
       * If true, will attempt to resolve project strings to IDs like create().
       * Defaults to false for performance (WBS conversion already passes projectId).
       */
      resolveProject?: boolean;
      /**
       * If true, recalculates project stats once per project present in the inserted tasks.
       * Defaults to false so callers can defer stats recalculation to the end.
       */
      recalculateProjectStats?: boolean;

      /**
       * When true, preserves input order and stops on first error.
       * Defaults to false (ordered:false) to allow partial inserts.
       */
      ordered?: boolean;
    },
  ): Promise<TaskDocument[]> {
    const dtos = Array.isArray(createTaskDtos) ? createTaskDtos : [];
    if (dtos.length === 0) return [];

    const resolveProject = Boolean(options?.resolveProject);
    const shouldRecalculateStats = Boolean(options?.recalculateProjectStats);
    const ordered = Boolean(options?.ordered);

    // Resolve project IDs when requested (slower; use only when needed)
    if (resolveProject) {
      for (const dto of dtos) {
        if (dto.project && typeof dto.project === 'string') {
          const value = dto.project as unknown as string;
          const isObjectId = /^[a-f\d]{24}$/i.test(value);
          let projectDoc: ProjectDocument | null = null;
          if (isObjectId) {
            projectDoc = await this.projectModel.findById(value).exec();
          }
          if (!projectDoc) {
            projectDoc = await this.projectModel.findOne({ name: value }).exec();
          }
          if (!projectDoc) {
            throw new NotFoundException(`Project not found by id or name '${value}'`);
          }
          dto.project = projectDoc._id as import('mongoose').Types.ObjectId;
        }
      }
    }

    // Apply derived fields (PERT/RTM/EVM/prize/experience) consistently with create()
    for (const dto of dtos) {
      this.applyPertEstimates(dto);
      this.applyRtmRisk(dto);
      this.applyEvmMetrics(dto);

      const priority = (dto.priority as number) || 0;
      const difficult = (dto.difficult as number) || 0;
      dto.prize = priority * 5 + difficult * 2;
      dto.experience = priority * 2 + difficult * 5;
    }

    let inserted: TaskDocument[] = [];
    try {
      inserted = await this.taskModel.insertMany(dtos, { ordered });
    } catch (err: any) {
      // With ordered:false Mongo can insert partial docs and still throw.
      // Mongoose exposes insertedDocs in many cases; fall back to empty.
      inserted = (err?.insertedDocs as TaskDocument[]) || [];

      const writeErrors = Array.isArray(err?.writeErrors) ? err.writeErrors.length : undefined;
      // eslint-disable-next-line no-console
      console.warn('[TasksService][createMany] insertMany error (partial inserts possible)', {
        message: err?.message,
        inserted: inserted.length,
        writeErrors,
      });
    }

    if (shouldRecalculateStats) {
      const uniqueProjectIds = new Set(
        inserted
          .map((t: any) => t?.project?.toString?.() ?? t?.project)
          .filter(Boolean),
      );
      for (const pid of uniqueProjectIds) {
        await this.projectsService.recalculateProjectStats(String(pid));
      }
    }

    return inserted;
  }

  calculatePERT(optimistic: number, mostLikely: number, pessimistic: number) {
    const expected = (optimistic + 4 * mostLikely + pessimistic) / 6;
    const variance = Math.pow((pessimistic - optimistic) / 6, 2);
    return {
      expected: Math.round(expected),
      variance: Number(variance.toFixed(2)),
    };
  }

  private validatePertInput(dto: Partial<CreateTaskDto>) {
    const o = dto.pertOptimisticMinutes;
    const m = dto.pertMostLikelyMinutes;
    const p = dto.pertPessimisticMinutes;

    if (o === undefined && m === undefined && p === undefined) return;
    if (o === undefined || m === undefined || p === undefined) {
      throw new BadRequestException(
        'Para PERT manual, informe pertOptimisticMinutes, pertMostLikelyMinutes e pertPessimisticMinutes.',
      );
    }
    if (!(o > 0 && m > 0 && p > 0)) {
      throw new BadRequestException('Valores PERT devem ser maiores que zero.');
    }
    if (!(o < m && m < p)) {
      throw new BadRequestException('PERT inválido: use optimistic < mostLikely < pessimistic.');
    }
  }

  private normalizeChecklist(
    checklist?: Array<string | ChecklistItemDto>,
  ): Array<{ item: string; completed: boolean; order: number }> | undefined {
    if (!Array.isArray(checklist) || checklist.length === 0) return undefined;

    const normalized = checklist
      .map((entry, index) => {
        if (typeof entry === 'string') {
          const item = entry.trim();
          if (!item) return null;
          return { item, completed: false, order: index };
        }

        if (!entry || typeof entry !== 'object') return null;
        const item = String(entry.item || '').trim();
        if (!item) return null;
        return {
          item,
          completed: Boolean(entry.completed),
          order: Number.isFinite(entry.order) ? Number(entry.order) : index,
        };
      })
      .filter(Boolean) as Array<{ item: string; completed: boolean; order: number }>;

    return normalized.length > 0 ? normalized : undefined;
  }

  private async createTaskCore(createTaskDto: CreateTaskDto): Promise<TaskDocument> {
    if (createTaskDto.project && typeof createTaskDto.project === 'string') {
      const value = createTaskDto.project as string;
      // tenta como ObjectId primeiro
      const isObjectId = /^[a-f\d]{24}$/i.test(value);
      let projectDoc: ProjectDocument | null = null;
      if (isObjectId) {
        projectDoc = await this.projectModel.findById(value).exec();
      }
      // se não achou por id, tenta por nome
      if (!projectDoc) {
        projectDoc = await this.projectModel.findOne({ name: value }).exec();
      }
      if (!projectDoc) {
        throw new NotFoundException(`Project not found by id or name '${value}'`);
      }
      createTaskDto.project = projectDoc._id as import('mongoose').Types.ObjectId;
    }

    // Calculate PERT estimates when possible
    this.applyPertEstimates(createTaskDto);

    // Calculate RTM risk when possible
    this.applyRtmRisk(createTaskDto);

    // Calculate EVM metrics when possible
    this.applyEvmMetrics(createTaskDto);

    // Calculate reward and experience automatically based on priority and difficulty
    const priority = createTaskDto.priority || 0;
    const difficult = createTaskDto.difficult || 0;
    createTaskDto.prize = priority * 5 + difficult * 2;
    createTaskDto.experience = priority * 2 + difficult * 5;

    const createdTask = new this.taskModel(createTaskDto);
    const savedTask = await createdTask.save();

    // Recalculate project stats after creating task
    if (savedTask.project) {
      await this.projectsService.recalculateProjectStats(savedTask.project.toString());
    }

    return savedTask;
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
    this.validatePertInput(createMicroTaskDto);

    const checklistWasProvided = Object.prototype.hasOwnProperty.call(
      createMicroTaskDto,
      'checklist',
    );

    const normalizedChecklist = this.normalizeChecklist(createMicroTaskDto.checklist);
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
      payload.checklist = this.normalizeChecklist(generated);
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
    return this.geminiService.generateChecklistForTask(taskName, description, microTaskType);
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
    // Tenta buscar histórico se projectId fornecido
    let historicalContext = '';
    if (projectId && typeof projectId === 'string') {
      const similarTasks = await this.checklistService.findSimilarTasksInProject(
        projectId,
        microTaskType,
        3,
      );
      historicalContext = this.checklistService.enrichHistoryContext(similarTasks);
    } else if (projectId && typeof projectId === 'object' && projectId._id) {
      const similarTasks = await this.checklistService.findSimilarTasksInProject(
        projectId._id.toString(),
        microTaskType,
        3,
      );
      historicalContext = this.checklistService.enrichHistoryContext(similarTasks);
    }

    // Gera checklist com ou sem histórico
    if (historicalContext) {
      return this.geminiService.generateChecklistWithHistory(
        taskName,
        description,
        microTaskType,
        historicalContext,
      );
    }

    return this.geminiService.generateChecklistForTask(taskName, description, microTaskType);
  }

  async updateMicroTaskChecklist(
    id: string,
    checklist: Array<string | ChecklistItemDto>,
  ): Promise<TaskDocument> {
    if (!id || !Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`ID inválido: ${id}`);
    }

    const normalizedChecklist = this.normalizeChecklist(checklist);
    if (!normalizedChecklist || normalizedChecklist.length === 0) {
      throw new BadRequestException('Checklist inválido: informe pelo menos um item.');
    }

    const updatedTask = await this.taskModel
      .findByIdAndUpdate(
        id,
        { checklist: normalizedChecklist },
        { new: true },
      )
      .exec();

    if (!updatedTask) {
      throw new NotFoundException(`Task with id ${id} not found`);
    }

    return updatedTask;
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
    if (!taskId || !Types.ObjectId.isValid(taskId)) {
      throw new BadRequestException(`ID inválido: ${taskId}`);
    }

    const index = parseInt(itemIndex, 10);
    if (!Number.isFinite(index) || index < 0) {
      throw new BadRequestException(`Item ID inválido: ${itemIndex}`);
    }

    const task = await this.taskModel.findById(taskId).exec();
    if (!task) {
      throw new NotFoundException(`Task with id ${taskId} not found`);
    }

    if (!Array.isArray(task.checklist) || task.checklist.length === 0) {
      throw new BadRequestException('Tarefa não possui checklist');
    }

    if (index >= task.checklist.length) {
      throw new BadRequestException(`Item index ${index} fora do intervalo (checklist tem ${task.checklist.length} itens)`);
    }

    // Type guard: apenas objetos TaskChecklistItem têm 'completed'
    const checklistItem = task.checklist[index];
    if (typeof checklistItem === 'string') {
      throw new BadRequestException(`Item ${index} é uma string, não objeto com completed`);
    }

    // Atualiza item específico
    (checklistItem as any).completed = Boolean(completed);

    // Calcula progresso para resposta (filtra apenas objetos com 'completed')
    const checklistItems = task.checklist.filter(
      (item): item is Exclude<typeof item, string> => typeof item !== 'string',
    );
    const completionPercentage = this.checklistService.calculateCompletionPercentage(checklistItems);

    const updatedTask = await task.save();

    // Retorna com progresso incluído
    return {
      ...updatedTask.toObject(),
      completionPercentage,
    } as any;
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
    if (!taskId || !Types.ObjectId.isValid(taskId)) {
      return {
        isValid: false,
        reason: `ID inválido: ${taskId}`,
      };
    }

    const task = await this.taskModel.findById(taskId).exec();
    if (!task) {
      return {
        isValid: false,
        reason: `Tarefa com id ${taskId} não encontrada`,
      };
    }

    // Se tarefa não tem checklist, permitir conclusão
    if (!Array.isArray(task.checklist) || task.checklist.length === 0) {
      return { isValid: true };
    }

    // Se tem checklist, validar 100% de conclusão.
    // Importante: checklists antigos podem estar salvos como `string[]`.
    // Esses itens precisam contar como NÃO concluídos (equivalente a completed=false),
    // senão a tarefa consegue ser concluída sem completar nada.
    const checklistItems = task.checklist.map((entry: any) => {
      if (typeof entry === 'string') {
        return { completed: false };
      }
      if (entry && typeof entry === 'object') {
        return { completed: Boolean(entry.completed) };
      }
      return { completed: false };
    });

    return this.checklistService.validateChecklistCompletion(checklistItems);
  }

  async createRecurringMicroTask(createMicroTaskDto: CreateMicroTaskDto): Promise<TaskDocument> {
    const recurringRule = createMicroTaskDto.recurringRule as RecurringRuleDto | undefined;
    if (!recurringRule?.frequency || !recurringRule?.interval) {
      throw new BadRequestException('recurringRule inválida: frequency e interval são obrigatórios.');
    }

    return this.createMicroTask({
      ...createMicroTaskDto,
      isRecurringInstance: false,
    });
  }

  async updateRecurringRule(id: string, recurringRule: RecurringRuleDto): Promise<TaskDocument> {
    if (!id || !Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`ID inválido: ${id}`);
    }
    if (!recurringRule?.frequency || !recurringRule?.interval) {
      throw new BadRequestException('recurringRule inválida: frequency e interval são obrigatórios.');
    }

    const updatedTask = await this.taskModel
      .findByIdAndUpdate(id, { recurringRule }, { new: true })
      .exec();
    if (!updatedTask) {
      throw new NotFoundException(`Task with id ${id} not found`);
    }
    return updatedTask;
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
    updatePertDto: {
      pertOptimisticMinutes: number;
      pertMostLikelyMinutes: number;
      pertPessimisticMinutes: number;
    },
  ): Promise<TaskDocument> {
    if (!taskId || !Types.ObjectId.isValid(taskId)) {
      throw new BadRequestException(`ID inválido: ${taskId}`);
    }

    const { pertOptimisticMinutes: O, pertMostLikelyMinutes: M, pertPessimisticMinutes: P } = updatePertDto;

    // Validações
    if (typeof O !== 'number' || typeof M !== 'number' || typeof P !== 'number') {
      throw new BadRequestException('Todos os valores PERT devem ser números');
    }
    if (!(O > 0 && M > 0 && P > 0)) {
      throw new BadRequestException('Valores PERT devem ser maiores que zero');
    }
    if (!(O <= M && M <= P)) {
      throw new BadRequestException('Ordem inválida: Otimista ≤ Provável ≤ Pessimista');
    }

    // Calcula TE e variância
    const expectedTime = (O + 4 * M + P) / 6;
    const range = P - O;
    const variance = Math.pow(range / 6, 2);
    const standardDeviation = Math.sqrt(variance);

    // Calcula novo deadline com 10% de margem
    const task = await this.taskModel.findById(taskId).exec();
    if (!task) {
      throw new NotFoundException(`Task with id ${taskId} not found`);
    }

    const createdAt = task.createdAt || new Date();
    const deadline = this.calculateDeadline(createdAt, expectedTime);

    // Atualiza task
    const updatedTask = await this.taskModel
      .findByIdAndUpdate(
        taskId,
        {
          pertOptimisticMinutes: O,
          pertMostLikelyMinutes: M,
          pertPessimisticMinutes: P,
          pertExpectedMinutes: Math.round(expectedTime * 100) / 100,
          pertVariance: Math.round(variance * 100) / 100,
          deadline,
        },
        { new: true },
      )
      .exec();

    if (!updatedTask) {
      throw new NotFoundException(`Task with id ${taskId} not found`);
    }

    return updatedTask;
  }

  /**
   * Calcula deadline baseado em TE + margem de 10%
   * @param createdAt Data de criação da tarefa
   * @param expectedTimeMinutes Tempo esperado em minutos
   * @returns Data de deadline
   */
  private calculateDeadline(createdAt: Date, expectedTimeMinutes: number): Date {
    // Arredonda para próxima hora cheia
    const hoursNeeded = Math.ceil((expectedTimeMinutes * 1.1) / 60);
    const deadlineMs = createdAt.getTime() + hoursNeeded * 60 * 60 * 1000;
    return new Date(deadlineMs);
  }

  async findAll(): Promise<TaskDocument[]> {
    return await this.taskModel.find().exec();
  }

  async findByProjectId(projectId: string, opts?: { taskIds?: string[]; parentWbsNodeId?: string }): Promise<TaskDocument[]> {
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
    if (!id || id === 'null' || id === 'undefined' || !Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`ID inválido: ${id}`);
    }
    
    const oldTask = await this.taskModel.findById(id).exec();
    const oldProjectId = oldTask?.project?.toString();
    
    if (updateTaskDto.project && typeof updateTaskDto.project === 'string') {
      const value = updateTaskDto.project as string;
      const isObjectId = /^[a-f\d]{24}$/i.test(value);
      let projectDoc: ProjectDocument | null = null;
      if (isObjectId) {
        projectDoc = await this.projectModel.findById(value).exec();
      }
      if (!projectDoc) {
        projectDoc = await this.projectModel.findOne({ name: value }).exec();
      }
      if (!projectDoc) {
        throw new NotFoundException(`Project not found by id or name '${value}'`);
      }
      updateTaskDto.project = projectDoc._id as import('mongoose').Types.ObjectId;
    }
    
    // Recalculate PERT estimates when possible
    this.applyPertEstimates(updateTaskDto, oldTask);

    // Recalculate RTM risk when possible
    this.applyRtmRisk(updateTaskDto, oldTask);

    // Recalculate EVM metrics when possible
    this.applyEvmMetrics(updateTaskDto, oldTask);

    // Recalculate reward and experience if priority or difficulty changed
    if (updateTaskDto.priority !== undefined || updateTaskDto.difficult !== undefined) {
      const priority = updateTaskDto.priority !== undefined ? updateTaskDto.priority : (oldTask?.priority || 0);
      const difficult = updateTaskDto.difficult !== undefined ? updateTaskDto.difficult : (oldTask?.difficult || 0);
      updateTaskDto.prize = priority * 5 + difficult * 2;
      updateTaskDto.experience = priority * 2 + difficult * 5;
    }
    
    const updatedTask = await this.taskModel.findByIdAndUpdate(id, updateTaskDto, { new: true }).exec();
    
    // Recalculate project stats after updating task
    if (updatedTask) {
      const newProjectId = updatedTask.project?.toString();
      
      // If project changed, recalculate both old and new projects
      if (oldProjectId && oldProjectId !== newProjectId) {
        await this.projectsService.recalculateProjectStats(oldProjectId);
      }
      if (newProjectId) {
        await this.projectsService.recalculateProjectStats(newProjectId);
      }
    }
    
    return updatedTask;
  }

  private applyPertEstimates(
    dto: Partial<CreateTaskDto>,
    fallbackTask?: TaskDocument | null,
  ) {
    const hasAnyPert =
      dto.pertOptimisticMinutes !== undefined ||
      dto.pertMostLikelyMinutes !== undefined ||
      dto.pertPessimisticMinutes !== undefined;

    const baseMinutes =
      dto.pertMostLikelyMinutes ??
      (dto.pomodorosPlanned ? dto.pomodorosPlanned * 25 : undefined) ??
      fallbackTask?.pertMostLikelyMinutes ??
      (fallbackTask?.pomodorosPlanned ? fallbackTask.pomodorosPlanned * 25 : undefined);

    if (!hasAnyPert && baseMinutes === undefined) return;

    const optimistic = Math.max(
      5,
      Math.round(dto.pertOptimisticMinutes ?? (baseMinutes ?? 0) * 0.75),
    );
    const mostLikely = Math.max(
      optimistic,
      Math.round(dto.pertMostLikelyMinutes ?? (baseMinutes ?? optimistic)),
    );
    const pessimistic = Math.max(
      mostLikely,
      Math.round(dto.pertPessimisticMinutes ?? (baseMinutes ?? mostLikely) * 1.5),
    );
    const expected = (optimistic + 4 * mostLikely + pessimistic) / 6;
    const variance = Math.pow((pessimistic - optimistic) / 6, 2);

    dto.pertOptimisticMinutes = optimistic;
    dto.pertMostLikelyMinutes = mostLikely;
    dto.pertPessimisticMinutes = pessimistic;
    dto.pertExpectedMinutes = Math.round(expected);
    dto.pertVariance = Number(variance.toFixed(2));
  }

  private applyRtmRisk(
    dto: Partial<CreateTaskDto>,
    fallbackTask?: TaskDocument | null,
  ) {
    const requirementIds = dto.requirementIds ?? fallbackTask?.requirementIds ?? [];
    const journeyItemIds =
      dto.journeyItemIds ??
      ((fallbackTask as any)?.journeyItemIds as string[] | undefined) ??
      [];
    const hasWbsLink = Boolean(dto.parentWbsNodeId || fallbackTask?.parentWbsNodeId || dto.wbsPath || fallbackTask?.wbsPath);

    if (requirementIds.length > 0 || journeyItemIds.length > 0 || hasWbsLink) {
      dto.rtmRisk = false;
      dto.rtmRiskReason = undefined;
      return;
    }

    dto.rtmRisk = true;
    dto.rtmRiskReason = 'Ação sem vínculo com item da jornada pessoal (objetivo/hábito/etapa/ação) ou WBS.';
  }

  private applyEvmMetrics(
    dto: Partial<CreateTaskDto>,
    fallbackTask?: TaskDocument | null,
  ) {
    const expectedMinutes =
      dto.pertExpectedMinutes ??
      fallbackTask?.pertExpectedMinutes ??
      (dto.pomodorosPlanned ? dto.pomodorosPlanned * 25 : undefined) ??
      (fallbackTask?.pomodorosPlanned ? fallbackTask.pomodorosPlanned * 25 : undefined);

    if (!expectedMinutes) return;

    const pomodorosPlanned =
      dto.pomodorosPlanned ?? fallbackTask?.pomodorosPlanned ?? Math.max(1, Math.round(expectedMinutes / 25));
    const pomodorosDid = dto.pomodorosDid ?? fallbackTask?.pomodorosDid ?? 0;
    const progress = Math.max(0, Math.min(1, pomodorosPlanned ? pomodorosDid / pomodorosPlanned : 0));

    const createdAt = fallbackTask?.createdAt ? new Date(fallbackTask.createdAt) : new Date();
    const deadline = dto.deadline ? new Date(dto.deadline) : fallbackTask?.deadline ? new Date(fallbackTask.deadline) : null;
    const elapsedRatio = deadline
      ? (() => {
          const total = deadline.getTime() - createdAt.getTime();
          if (total <= 0) return 1;
          return Math.max(0, Math.min(1, (Date.now() - createdAt.getTime()) / total));
        })()
      : 0;

    const plannedValue = expectedMinutes * elapsedRatio;
    const earnedValue = expectedMinutes * progress;
    const spi = plannedValue > 0 ? earnedValue / plannedValue : progress > 0 ? 1 : 0;

    dto.evmProgress = Number(progress.toFixed(2));
    dto.evmPlannedValueMinutes = Math.round(plannedValue);
    dto.evmEarnedValueMinutes = Math.round(earnedValue);
    dto.evmSchedulePerformanceIndex = Number(spi.toFixed(2));
    dto.evmAlert = spi > 0 && spi < 0.9 ? 'SPI abaixo de 0.9 (risco de atraso)' : undefined;
  }

  async remove(id: string): Promise<boolean> {
    // Validar se o ID é um ObjectId válido
    if (!id || id === 'null' || id === 'undefined' || !Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`ID inválido: ${id}`);
    }

    const task = await this.taskModel.findById(id).exec();
    
    if (!task) {
      throw new NotFoundException(`Task com ID ${id} não encontrada`);
    }
    
    const projectId = task?.project?.toString();
    
    const result = await this.taskModel.findByIdAndDelete(id).exec();
    
    // Recalculate project stats after removing task
    if (result && projectId) {
      await this.projectsService.recalculateProjectStats(projectId);
    }
    
    return result !== null;
  }

  async markAsConcluded(id: string): Promise<TaskDocument> {
    if (!id || id === 'null' || id === 'undefined' || !Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`ID inválido: ${id}`);
    }

    const task = await this.taskModel.findById(id).exec();
    if (!task) {
      throw new NotFoundException(`Task with id ${id} not found`);
    }

    if (task.isConcluded) {
      return task;
    }

    // Sprint 2: Valida requisitos de conclusão (checklist 100% se houver)
    const completionValidation = await this.validateCompletionRequirements(id);
    if (!completionValidation.isValid) {
      throw new BadRequestException(completionValidation.reason);
    }

    const currentPomodorosDid = Math.max(0, task.pomodorosDid || 0);
    const plannedPomodoros = Math.max(0, task.pomodorosPlanned || 0);
    const remainingPomodoros = Math.max(0, plannedPomodoros - currentPomodorosDid);
    const remainingHours = remainingPomodoros * 0.5;

    task.isConcluded = true;
    if (remainingPomodoros > 0) {
      task.pomodorosDid = plannedPomodoros;
    }

    const projectId = task.project?.toString();
    if (projectId) {
      const maxOrder = await this.taskModel
        .findOne({ project: projectId, status: 'done' })
        .sort({ kanbanOrder: -1 })
        .select('kanbanOrder')
        .exec();
      task.status = 'done';
      task.kanbanOrder = (maxOrder?.kanbanOrder || 0) + 1;
      task.statusUpdatedAt = new Date();
    }

    this.applyEvmMetrics(task);
    const updatedTask = await task.save();

    if (updatedTask.project && remainingHours > 0) {
      const projectId = updatedTask.project.toString();
      await this.projectsService.incrementHoursWorked(projectId, remainingHours);
      await this.registerAutoEvmProgress(projectId, id, remainingHours, 'completion');
    }

    return updatedTask;
  }

  async incrementPomodorosDid(id: string): Promise<TaskDocument> {
    if (!id || id === 'null' || id === 'undefined' || !Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`ID inválido: ${id}`);
    }
    
    const task = await this.taskModel.findById(id).exec();

    if (!task) {
      throw new NotFoundException(`Task with id ${id} not found`);
    }

    if (task.pomodorosDid === undefined || task.pomodorosDid === null) {
      task.pomodorosDid = 0;
    }

    task.pomodorosDid += 1;
    this.applyEvmMetrics(task);
    const updatedTask = await task.save();

    // If task is associated with a project, increment totalHoursWorked
    // Each pomodoro = 0.5 hours
    if (task.project) {
      const projectId = task.project.toString();
      await this.projectsService.incrementHoursWorked(projectId, 0.5);
      await this.registerAutoEvmProgress(projectId, id, 0.5, 'pomodoro');
    }

    return updatedTask;
  }

  private async registerAutoEvmProgress(
    projectId: string,
    taskId: string,
    hoursDelta: number,
    source: 'pomodoro' | 'completion',
  ): Promise<void> {
    if (!projectId || !taskId || hoursDelta <= 0) return;

    try {
      await this.evmService.recordProgress(
        projectId,
        hoursDelta,
        hoursDelta,
        undefined,
        { source, taskId },
      );
    } catch (error: any) {
      // Não bloqueia o fluxo principal da task caso o registro EVM falhe.
      // eslint-disable-next-line no-console
      console.warn('[TasksService] Falha ao registrar progresso EVM automatico', {
        projectId,
        taskId,
        source,
        message: error?.message,
      });
    }
  }

  /**
   * Tenta fazer parse seguro do JSON retornado pelo Gemini.
   * Lida com respostas malformadas, texto extra, e caracteres inválidos.
   */
  private safeParseGeminiJson(response: string): any[] {
    if (!response || typeof response !== 'string') {
      console.warn('Resposta do Gemini é nula ou não é string');
      return [];
    }

    let cleaned = response.trim();

    // Remove blocos de código markdown se presentes
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.slice(7);
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.slice(3);
    }
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.slice(0, -3);
    }
    cleaned = cleaned.trim();

    // Tenta encontrar o array JSON dentro da resposta
    const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      cleaned = arrayMatch[0];
    }

    // Tenta parse direto
    try {
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) {
        return parsed;
      }
      // Se for objeto com array dentro, tenta extrair
      if (parsed && typeof parsed === 'object') {
        const keys = Object.keys(parsed);
        for (const key of keys) {
          if (Array.isArray(parsed[key])) {
            return parsed[key];
          }
        }
      }
      console.warn('JSON parseado não é um array:', typeof parsed);
      return [];
    } catch (firstError) {
      console.warn('Primeiro parse falhou, tentando limpar JSON...');
    }

    // Tenta corrigir problemas comuns de JSON malformado
    try {
      // Remove trailing commas antes de } ou ]
      cleaned = cleaned.replace(/,\s*([\}\]])/g, '$1');
      
      // Remove caracteres de controle inválidos
      cleaned = cleaned.replace(/[\x00-\x1F\x7F]/g, ' ');
      
      // Corrige aspas não escapadas dentro de strings (heurística simples)
      // Isso é arriscado mas pode ajudar em alguns casos
      
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) {
        return parsed;
      }
      return [];
    } catch (secondError) {
      console.warn('Segundo parse também falhou, tentando extrair objetos manualmente...');
    }

    // Última tentativa: extrair objetos individualmente usando regex
    try {
      const objectMatches = cleaned.matchAll(/\{[^{}]*\}/g);
      const objects: any[] = [];
      
      for (const match of objectMatches) {
        try {
          const obj = JSON.parse(match[0]);
          if (obj && typeof obj === 'object' && obj.name) {
            objects.push(obj);
          }
        } catch {
          // Ignora objetos que não conseguir parsear
        }
      }
      
      if (objects.length > 0) {
        console.log(`Extraídos ${objects.length} objetos manualmente do JSON malformado`);
        return objects;
      }
    } catch {
      // Falhou completamente
    }

    console.error('Não foi possível parsear a resposta do Gemini:', cleaned.substring(0, 200));
    return [];
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
    try {
      const result = await this.generateAiSuggestionsInternal(dto, onProgress);
      onComplete(result);
    } catch (error) {
      onError(error as Error);
    }
  }

  /**
   * Versão original que retorna Promise (mantida para compatibilidade)
   */
  async generateAiSuggestions(dto: GenerateAiSuggestionsDto): Promise<AiSuggestionsResponseDto> {
    return this.generateAiSuggestionsInternal(dto, null);
  }

  /**
   * Implementação interna que suporta callback opcional de progresso
   */
  private async generateAiSuggestionsInternal(
    dto: GenerateAiSuggestionsDto,
    onProgress?: ((progress: AiSuggestionsProgressDto) => void) | null,
  ): Promise<AiSuggestionsResponseDto> {
    const targetHours = dto.targetHours || 0;
    const allSuggestions: AiTaskSuggestionDto[] = [];
    const existingTaskNames: string[] = [];
    const maxIterations = 15; // Limite de segurança para evitar loops infinitos
    let currentIteration = 0;
    let currentHours = 0;
    let alreadyPlannedHours = 0;

    // Função helper para criar resposta com progresso
    const createResponse = (
      status: 'loading' | 'success' | 'error' | 'partial',
      message: string,
    ): AiSuggestionsResponseDto => ({
      suggestions: allSuggestions,
      progress: {
        currentIteration,
        maxIterations,
        currentHours: alreadyPlannedHours + currentHours,
        targetHours,
        tasksGenerated: allSuggestions.length,
        status,
        message,
      },
    });

    // Função helper para emitir progresso
    const emitProgress = (status: 'loading' | 'success' | 'error' | 'partial', message: string) => {
      if (onProgress) {
        onProgress({
          currentIteration,
          maxIterations,
          currentHours: alreadyPlannedHours + currentHours,
          targetHours,
          tasksGenerated: allSuggestions.length,
          status,
          message,
        });
      }
    };

    try {
      emitProgress('loading', 'Iniciando análise do projeto...');

      // Busca as tarefas já existentes no projeto para calcular horas já planejadas
      if (dto.projectId) {
        const existingTasks = await this.taskModel.find({ project: dto.projectId }).exec();
        
        // Calcula horas já planejadas (pomodoros * 0.5h)
        alreadyPlannedHours = existingTasks.reduce((total, task) => {
          return total + ((task.pomodorosPlanned || 0) * 0.5);
        }, 0);

        // Adiciona nomes das tarefas existentes para evitar duplicatas
        existingTaskNames.push(...existingTasks.map(task => task.name));
        
        console.log(`Projeto já tem ${existingTasks.length} tarefas (${alreadyPlannedHours.toFixed(1)}h planejadas)`);
      }

      // Se targetHours não foi especificado, gera apenas uma vez (comportamento antigo)
      if (targetHours <= 0) {
        emitProgress('loading', 'Gerando sugestões...');

        const aiResponse = await this.geminiService.generateTaskSuggestions(
          dto.projectName,
          dto.shortTermGoal,
          dto.midTermGoal,
          dto.longTermGoal,
          dto.userPrompt,
          existingTaskNames,
          undefined,
        );

        const suggestions = this.safeParseGeminiJson(aiResponse);
        if (suggestions.length === 0) {
          console.warn('A resposta da IA está vazia ou malformada, retornando fallback.');
          const mockSuggestions = this.generateMockSuggestions(dto);
          allSuggestions.push(...mockSuggestions);
          return createResponse('partial', 'Usando sugestões de fallback devido a resposta inválida da IA');
        }

        allSuggestions.push(...(suggestions as AiTaskSuggestionDto[]));
        currentHours = allSuggestions.reduce((sum, t) => sum + (t.pomodoros || 0) * 0.5, 0);
        return createResponse('success', 'Sugestões geradas com sucesso');
      }

      // Calcula quantas horas ainda precisam ser geradas
      const remainingHours = Math.max(0, targetHours - alreadyPlannedHours);
      
      if (remainingHours <= 0) {
        console.log(`Projeto já atingiu o target (${alreadyPlannedHours.toFixed(1)}h >= ${targetHours}h). Não gerando novas tarefas.`);
        return createResponse('success', 'Projeto já atingiu o total de horas planejadas');
      }

      console.log(`Gerando tarefas para completar ${remainingHours.toFixed(1)}h (de ${targetHours}h total)`);

      // Loop para gerar tarefas até atingir as horas restantes
      let consecutiveRateLimits = 0;
      const interIterationDelayMs = 3000; // delay fixo entre iterações para reduzir 429

      while (currentHours < remainingHours && currentIteration < maxIterations) {
        currentIteration++;
        
        emitProgress('loading', `Gerando lote ${currentIteration}/${maxIterations}...`);
        
        console.log(`Iteração ${currentIteration}: ${currentHours.toFixed(1)}h de ${remainingHours.toFixed(1)}h geradas`);

        // Delay de 1 segundo entre requisições para evitar rate limiting (429)
        if (currentIteration > 1) {
          console.log(`Aguardando ${interIterationDelayMs}ms antes da próxima requisição...`);
          await new Promise(resolve => setTimeout(resolve, interIterationDelayMs));
        }

        // Gera em lotes menores para reduzir risco de 429 e consumo de tokens
        const chunkHours = Math.min(remainingHours - currentHours, 8); // ~16 pomodoros
        let aiResponse: string;
        try {
          aiResponse = await this.geminiService.generateTaskSuggestions(
            dto.projectName,
            dto.shortTermGoal,
            dto.midTermGoal,
            dto.longTermGoal,
            dto.userPrompt,
            existingTaskNames,
            chunkHours,
          );
          // sucesso: zera strikes
          consecutiveRateLimits = 0;
        } catch (err: any) {
          if (err?.code === 'RATE_LIMIT') {
            consecutiveRateLimits++;
            const waitMs = Math.min(15000 * consecutiveRateLimits, 45000);
            console.warn(`Gemini RATE_LIMIT recebido. Aguardando ${waitMs}ms antes de tentar novamente (strike ${consecutiveRateLimits}).`);
            await new Promise((r) => setTimeout(r, waitMs));
            // tenta próxima iteração sem contar como iteração concluída
            continue;
          }
          throw err;
        }

        const suggestions = this.safeParseGeminiJson(aiResponse);

        if (suggestions.length === 0) {
          console.warn('A resposta da IA está vazia ou malformada nesta iteração.');
          // Continua tentando nas próximas iterações ao invés de quebrar
          continue;
        }

        // Filtra duplicatas por nome (case-insensitive)
        const newSuggestions = (suggestions as AiTaskSuggestionDto[]).filter(
          (newTask) => {
            const normalizedName = newTask.name.toLowerCase().trim();
            return !existingTaskNames.some(
              (existingName) => existingName.toLowerCase().trim() === normalizedName
            );
          }
        );

        if (newSuggestions.length === 0) {
          console.warn('Nenhuma nova tarefa foi gerada (todas são duplicatas).');
          break;
        }

        // Adiciona as novas tarefas
        for (const task of newSuggestions) {
          allSuggestions.push(task);
          existingTaskNames.push(task.name);
          // Cada pomodoro = 0.5 horas (25 minutos)
          currentHours += (task.pomodoros || 0) * 0.5;
        }

        // Emite progresso após adicionar novas tarefas
        emitProgress('loading', `${allSuggestions.length} tarefas geradas (${currentHours.toFixed(1)}h/${remainingHours.toFixed(1)}h)...`);
      }

      if (currentIteration >= maxIterations) {
        console.warn(`Limite de ${maxIterations} iterações atingido. Retornando ${allSuggestions.length} tarefas.`);
        return createResponse('partial', `Limite de iterações atingido. ${allSuggestions.length} tarefas geradas.`);
      }

      console.log(`Geradas ${allSuggestions.length} novas tarefas totalizando ${currentHours.toFixed(1)}h (total do projeto: ${(alreadyPlannedHours + currentHours).toFixed(1)}h)`);
      return createResponse('success', `${allSuggestions.length} tarefas geradas com sucesso (${currentHours.toFixed(1)}h)`);

    } catch (error: any) {
      console.error('Erro ao usar a API do Gemini:', error?.message ?? error);
      // Se acumulamos algo, devolve parcial; senão fallback
      if (allSuggestions.length > 0) {
        console.warn('Retornando sugestões parciais acumuladas devido a erro.');
        return createResponse('partial', `Erro parcial: ${allSuggestions.length} tarefas geradas antes do erro`);
      }
      console.warn('Usando fallback de mock por ausência de sugestões acumuladas.');
      const mockSuggestions = this.generateMockSuggestions(dto);
      allSuggestions.push(...mockSuggestions);
      currentHours = allSuggestions.reduce((sum, t) => sum + (t.pomodoros || 0) * 0.5, 0);
      return createResponse('error', 'Falha na IA. Usando sugestões de fallback.');
    }
  }

  /**
   * Fallback para gerar sugestões mockadas inteligentes quando a IA não está disponível.
   */
  private generateMockSuggestions(dto: GenerateAiSuggestionsDto): AiTaskSuggestionDto[] {
    const keywords = `${dto.projectName} ${dto.shortTermGoal} ${dto.midTermGoal} ${dto.longTermGoal} ${dto.userPrompt}`.toLowerCase();
    const suggestions: AiTaskSuggestionDto[] = [];
    const today = new Date();

    const getDatePlusDays = (days: number) => {
      const date = new Date(today);
      date.setDate(date.getDate() + days);
      return date.toISOString().split('T')[0];
    };

    if (keywords.includes('api') || keywords.includes('backend')) {
      suggestions.push({ name: 'Definir endpoints da API REST', deadline: getDatePlusDays(3), pomodoros: 3, priority: 4, difficulty: 3, selected: true });
      suggestions.push({ name: 'Configurar autenticação com JWT', deadline: getDatePlusDays(7), pomodoros: 4, priority: 3, difficulty: 4, selected: false });
    }
    if (keywords.includes('ui') || keywords.includes('frontend') || keywords.includes('design')) {
      suggestions.push({ name: 'Criar protótipo de baixa fidelidade da UI', deadline: getDatePlusDays(2), pomodoros: 2, priority: 4, difficulty: 2, selected: true });
      suggestions.push({ name: 'Desenvolver componentes reutilizáveis em Vue/React', deadline: getDatePlusDays(10), pomodoros: 6, priority: 3, difficulty: 3, selected: true });
    }
    if (keywords.includes('banco de dados') || keywords.includes('database')) {
      suggestions.push({ name: 'Modelar o esquema do banco de dados', deadline: getDatePlusDays(4), pomodoros: 4, priority: 4, difficulty: 3, selected: true });
    }
    if (suggestions.length === 0) {
      suggestions.push({ name: 'Reunião de brainstorming para definir os próximos passos', deadline: getDatePlusDays(1), pomodoros: 1, priority: 4, difficulty: 1, selected: true });
      suggestions.push({ name: 'Pesquisar tecnologias concorrentes', deadline: getDatePlusDays(5), pomodoros: 3, priority: 2, difficulty: 2, selected: false });
    }

    return suggestions.slice(0, 5);
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
    // 1. Validar que a tarefa existe
    const task = await this.taskModel.findById(taskId).exec();
    if (!task) {
      throw new NotFoundException(`Tarefa com ID ${taskId} não encontrada`);
    }

    // 2. Calcular métricas PERT
    const pertMetrics = this.pertService.calculatePertMetrics(pertEstimateDto);

    // 3. Atualizar a tarefa no banco com os valores PERT
    await this.taskModel.findByIdAndUpdate(
      taskId,
      {
        pertOptimisticMinutes: pertEstimateDto.optimistic,
        pertMostLikelyMinutes: pertEstimateDto.mostLikely,
        pertPessimisticMinutes: pertEstimateDto.pessimistic,
        pertExpectedMinutes: Math.round(pertMetrics.expectedTime),
        pertVariance: pertMetrics.variance,
      },
      { new: true },
    ).exec();

    // 4. Retornar as métricas calculadas
    return pertMetrics;
  }

  async moveTaskStatus(
    id: string,
    move: { status: 'todo' | 'doing' | 'review' | 'done'; toOrder?: number; toIndex?: number; fromStatus?: string; fromOrder?: number },
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
    if (!id || !Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`ID inválido: ${id}`);
    }

    const task = await this.taskModel.findById(id).exec();
    if (!task) {
      throw new NotFoundException(`Task with id ${id} not found`);
    }

    const warnings: string[] = [];
    const ancestors: any[] = [];
    let current = task;
    let depth = 0;

    // Build ancestor chain (parents)
    while (current.parentTaskId && depth < maxDepth) {
      const parent = await this.taskModel.findById(current.parentTaskId).exec();
      if (!parent) break;

      ancestors.unshift({
        _id: parent._id,
        name: parent.name,
        status: parent.status || 'todo',
      });

      current = parent;
      depth++;
    }

    if (depth >= maxDepth) {
      warnings.push(`Ancestor chain depth limit (${maxDepth}) reached`);
    }

    // Get direct children
    const children = await this.taskModel
      .find({ parentTaskId: id })
      .select('_id name status')
      .exec();

    return {
      ancestors,
      children: children.map((c) => ({
        _id: c._id,
        name: c.name,
        status: c.status || 'todo',
      })),
      warnings,
    };
  }

  /**
   * Retorna todos os descendentes (filhos, netos, etc.) de uma task
   */
  async getDescendants(id: string, maxDepth: number = 1000): Promise<any[]> {
    if (!id || !Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`ID inválido: ${id}`);
    }

    const root = await this.taskModel.findById(id).exec();
    if (!root) {
      throw new NotFoundException(`Task with id ${id} not found`);
    }

    const descendants: any[] = [];
    const stack: Array<{ id: string; depth: number }> = [{ id, depth: 0 }];

    while (stack.length > 0) {
      const { id: currentId, depth } = stack.pop()!;
      if (depth >= maxDepth) continue;

      const children = await this.taskModel.find({ parentTaskId: currentId }).select('_id name status experience isConcluded').exec();
      for (const child of children) {
        descendants.push({
          _id: child._id,
          name: child.name,
          status: child.status || 'todo',
          experience: Number((child as any).experience) || 0,
          isConcluded: Boolean((child as any).isConcluded),
        });
        stack.push({ id: String(child._id), depth: depth + 1 });
      }
    }

    return descendants;
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
    if (!id || !Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`ID inválido: ${id}`);
    }

    const task = await this.taskModel.findById(id).exec();
    if (!task) {
      throw new NotFoundException(`Task with id ${id} not found`);
    }

    // Encontra root (top ancestor)
    let current: any = task;
    while (current.parentTaskId) {
      const parent = await this.taskModel.findById(current.parentTaskId).exec();
      if (!parent) break;
      current = parent;
    }
    const rootId = String(current._id ?? id);

    // Pega todos os descendentes do root (inclui filhos diretos e recursivos)
    const rootDescendants = await this.getDescendants(rootId, 5000);

    // Inclui o root também na lista para cálculo, caso tenha experience
    const rootTask = await this.taskModel.findById(rootId).select('_id experience isConcluded').exec();

    const allNodes = [] as Array<{ _id: any; experience: number; isConcluded: boolean }>;
    if (rootTask) {
      allNodes.push({ _id: rootTask._id, experience: Number((rootTask as any).experience) || 0, isConcluded: Boolean((rootTask as any).isConcluded) });
    }
    for (const d of rootDescendants) {
      allNodes.push({ _id: d._id, experience: Number(d.experience) || 0, isConcluded: Boolean(d.isConcluded) });
    }

    const totalCompletedXP = allNodes.reduce((s, n) => s + (n.isConcluded ? Number(n.experience || 0) : 0), 0);

    // Obter subtree do task (inclui o próprio task + seus descendentes)
    const subtreeDescendants = await this.getDescendants(id, 5000);
    const subtreeNodes = [] as Array<{ _id: any; experience: number; isConcluded: boolean }>;
    const taskSel = await this.taskModel.findById(id).select('_id experience isConcluded').exec();
    if (taskSel) {
      subtreeNodes.push({ _id: taskSel._id, experience: Number((taskSel as any).experience) || 0, isConcluded: Boolean((taskSel as any).isConcluded) });
    }
    for (const d of subtreeDescendants) {
      subtreeNodes.push({ _id: d._id, experience: Number(d.experience) || 0, isConcluded: Boolean(d.isConcluded) });
    }

    const subtreeCompletedXP = subtreeNodes.reduce((s, n) => s + (n.isConcluded ? Number(n.experience || 0) : 0), 0);

    const contributionPercent = totalCompletedXP > 0 ? (subtreeCompletedXP / totalCompletedXP) * 100 : 0;

    return {
      contributionPercent: Math.round(contributionPercent * 100) / 100,
      subtreeCompletedXP,
      totalCompletedXP,
      breakdown: subtreeNodes,
    };
  }

  /**
   * Generate completion feedback via LLM and persist
   */
  async generateCompletionFeedback(id: string, payload?: any): Promise<string> {
    if (!id || !Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`ID inválido: ${id}`);
    }

    const task = await this.taskModel.findById(id).exec();
    if (!task) {
      throw new NotFoundException(`Task with id ${id} not found`);
    }

    if (!task.isConcluded) {
      throw new BadRequestException('Task deve estar concluída para gerar feedback');
    }

    const inputSnapshot = {
      name: task.name,
      description: task.description,
      checklist: task.checklist,
      pomodoros: task.pomodorosDid,
      experience: task.experience,
      difficulty: task.difficult,
    };

    const isUserFeedbackPayload =
      payload && typeof payload === 'object' && (
        'celebration' in payload ||
        'validation' in payload ||
        'question' in payload ||
        'impediments' in payload ||
        'selectedSteps' in payload ||
        'action' in payload
      );

    if (isUserFeedbackPayload) {
      const feedbackText = JSON.stringify(payload);

      await this.feedbackModel.create({
        task: task._id,
        project: task.project,
        modelName: 'user-feedback',
        promptVersion: 'catchball-user-v1',
        inputSnapshot: {
          ...inputSnapshot,
          userFeedback: payload,
        },
        feedback: feedbackText,
      });

      return feedbackText;
    }

    // Delegate to FeedbackService which returns structured feedback
    try {
      const structured = await this.feedbackService.generateFeedbackOnCompletion(task, task.checklist, task.pomodorosDid ? task.pomodorosDid * 25 : undefined);
      return JSON.stringify(structured);
    } catch (err: any) {
      // Persist error for audit
      await this.feedbackModel.create({
        task: task._id,
        project: task.project,
        modelName: this.geminiService.getModelName(),
        promptVersion: 'catchball-v1',
        inputSnapshot,
        error: String(err?.message ?? err),
      });
      throw err;
    }
  }

  /**
   * Retrieve latest completion feedback for task
   */
  async getCompletionFeedback(id: string): Promise<{ feedback: string; createdAt: Date } | null> {
    if (!id || !Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`ID inválido: ${id}`);
    }

    const feedback = await this.feedbackModel
      .findOne({ task: id, feedback: { $exists: true, $ne: null } })
      .sort({ createdAt: -1 })
      .select('feedback createdAt')
      .exec();

    if (!feedback) {
      return null;
    }

    return {
      feedback: feedback.feedback,
      createdAt: feedback.createdAt || new Date(),
    };
  }
}
