import { Injectable, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateTaskDto } from './dto/create-task.dto';
import { TaskDocument } from './schemas/task.schema';
import { ProjectDocument } from '../projects/schemas/project.schema';
import { ProjectsService } from '../projects/projects.service';
import { GenerateAiSuggestionsDto, AiTaskSuggestionDto } from './dto/generate-ai-suggestions.dto';
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
    return await this.taskModel.findById(id).exec();
  }

  async update(id: string, updateTaskDto: Partial<CreateTaskDto>): Promise<TaskDocument | null> {
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

  async remove(id: string): Promise<boolean> {
    const task = await this.taskModel.findById(id).exec();
    const projectId = task?.project?.toString();
    
    const result = await this.taskModel.findByIdAndDelete(id).exec();
    
    // Recalculate project stats after removing task
    if (result && projectId) {
      await this.projectsService.recalculateProjectStats(projectId);
    }
    
    return result !== null;
  }

  async markAsConcluded(id: string): Promise<TaskDocument> {
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
    const task = await this.taskModel.findById(id).exec();

    if (!task) {
      throw new NotFoundException(`Task with id ${id} not found`);
    }

    if (task.pomodorosDid === undefined || task.pomodorosDid === null) {
      task.pomodorosDid = 0;
    }

    task.pomodorosDid += 1;
    const updatedTask = await task.save();

    // If task is associated with a project, increment totalHoursWorked
    // Each pomodoro = 0.5 hours
    if (task.project) {
      const projectId = task.project.toString();
      await this.projectsService.incrementHoursWorked(projectId, 0.5);
    }

    return updatedTask;
  }

  async generateAiSuggestions(dto: GenerateAiSuggestionsDto): Promise<AiTaskSuggestionDto[]> {
    const targetHours = dto.targetHours || 0;
    const allSuggestions: AiTaskSuggestionDto[] = [];
    const existingTaskNames: string[] = [];
    const maxIterations = 15; // Limite de segurança para evitar loops infinitos
    let currentIteration = 0;

    try {
      // Busca as tarefas já existentes no projeto para calcular horas já planejadas
      let alreadyPlannedHours = 0;
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
        const aiResponse = await this.geminiService.generateTaskSuggestions(
          dto.projectName,
          dto.shortTermGoal,
          dto.midTermGoal,
          dto.longTermGoal,
          dto.userPrompt,
          existingTaskNames,
          undefined,
        );

        const suggestions = JSON.parse(aiResponse);
        if (!Array.isArray(suggestions)) {
          console.warn('A resposta da IA não é um array, retornando lista vazia.');
          return [];
        }

        return suggestions as AiTaskSuggestionDto[];
      }

      // Calcula quantas horas ainda precisam ser geradas
  const remainingHours = Math.max(0, targetHours - alreadyPlannedHours);
      
      if (remainingHours <= 0) {
        console.log(`Projeto já atingiu o target (${alreadyPlannedHours.toFixed(1)}h >= ${targetHours}h). Não gerando novas tarefas.`);
        return [];
      }

      console.log(`Gerando tarefas para completar ${remainingHours.toFixed(1)}h (de ${targetHours}h total)`);

      // Loop para gerar tarefas até atingir as horas restantes
      let currentHours = 0;
      let consecutiveRateLimits = 0;
      const interIterationDelayMs = 3000; // delay fixo entre iterações para reduzir 429

      while (currentHours < remainingHours && currentIteration < maxIterations) {
        currentIteration++;
        
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

        const suggestions = JSON.parse(aiResponse);

        if (!Array.isArray(suggestions) || suggestions.length === 0) {
          console.warn('A resposta da IA não é um array ou está vazia.');
          break;
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
      }

      if (currentIteration >= maxIterations) {
        console.warn(`Limite de ${maxIterations} iterações atingido. Retornando ${allSuggestions.length} tarefas.`);
      }

      console.log(`Geradas ${allSuggestions.length} novas tarefas totalizando ${currentHours.toFixed(1)}h (total do projeto: ${(alreadyPlannedHours + currentHours).toFixed(1)}h)`);
      return allSuggestions;

    } catch (error: any) {
      console.error('Erro ao usar a API do Gemini:', error?.message ?? error);
      // Se acumulamos algo, devolve parcial; senão fallback
      if (allSuggestions.length > 0) {
        console.warn('Retornando sugestões parciais acumuladas devido a erro.');
        return allSuggestions;
      }
      console.warn('Usando fallback de mock por ausência de sugestões acumuladas.');
      return this.generateMockSuggestions(dto);
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
