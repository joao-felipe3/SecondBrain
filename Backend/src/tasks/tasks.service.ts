import { Injectable, NotFoundException, Inject, forwardRef, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateTaskDto } from './dto/create-task.dto';
import { TaskDocument } from './schemas/task.schema';
import { ProjectDocument } from '../projects/schemas/project.schema';
import { ProjectsService } from '../projects/projects.service';
import { GenerateAiSuggestionsDto, AiTaskSuggestionDto, AiSuggestionsResponseDto, AiSuggestionsProgressDto } from './dto/generate-ai-suggestions.dto';
import { GeminiService } from './gemini.service';

@Injectable()
export class TasksService {
  constructor(
    @InjectModel('Task') private readonly taskModel: Model<TaskDocument>,
    @InjectModel('Project') private readonly projectModel: Model<ProjectDocument>,
    @Inject(forwardRef(() => ProjectsService))
    private readonly projectsService: ProjectsService,
    private readonly geminiService: GeminiService, // Injeta o GeminiService
  ) {}

  // ... (outros métodos como create, findAll, etc. permanecem os mesmos)
  async create(createTaskDto: CreateTaskDto): Promise<TaskDocument> {
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

  async findAll(): Promise<TaskDocument[]> {
    return await this.taskModel.find().exec();
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
    const hasWbsLink = Boolean(dto.parentWbsNodeId || fallbackTask?.parentWbsNodeId || dto.wbsPath || fallbackTask?.wbsPath);

    if (requirementIds.length > 0 || hasWbsLink) {
      dto.rtmRisk = false;
      dto.rtmRiskReason = undefined;
      return;
    }

    dto.rtmRisk = true;
    dto.rtmRiskReason = 'Micro-tarefa sem vínculo a requisito ou WBS (risco de gold plating).';
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
    
    const updatedTask = await this.taskModel.findByIdAndUpdate(
      id,
      { isConcluded: true },
      { new: true }
    ).exec();

    if (!updatedTask) {
      throw new NotFoundException(`Task with id ${id} not found`);
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
    }

    return updatedTask;
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
}
