import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Put,
  Param,
  Delete,
  NotFoundException,
  Sse,
  MessageEvent,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { CreateMicroTaskDto } from './dto/create-micro-task.dto';
import { CreateBulkTasksDto } from './dto/create-bulk-tasks.dto';
import { UpdateChecklistDto } from './dto/update-checklist.dto';
import { UpdateChecklistItemDto } from './dto/update-checklist-item.dto';
import { UpdateRecurringRuleDto } from './dto/update-recurring-rule.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { GenerateAiSuggestionsDto } from './dto/generate-ai-suggestions.dto';
import { PertEstimateDto, PertEstimateResponseDto } from './dto/pert-estimate.dto';
import { SuggestPertDto, PertSuggestionResponseDto, UpdatePertDto } from './dto/suggest-pert.dto';
import { MoveTaskStatusDto } from './dto/move-task-status.dto'; // Sprint 4
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { CPMService } from './services/cpm.service';
import { DependencyInferenceService } from './services/dependency-inference.service';

@ApiTags('tasks')
@Controller('tasks')
export class TasksController {
  constructor(
    private readonly tasksService: TasksService,
    private readonly cpmService: CPMService,
    private readonly dependencyInference: DependencyInferenceService,
  ) {}

  @Post('bulk')
  @ApiOperation({ summary: 'Criar múltiplas tasks em lote' })
  @ApiResponse({ status: 201, description: 'Tasks criadas com sucesso.' })
  async createBulk(
    @Body()
    body: CreateBulkTasksDto,
  ) {
    const tasks = Array.isArray(body?.tasks) ? body.tasks : [];
    if (tasks.length === 0) {
      throw new BadRequestException('Body inválido: "tasks" deve ser um array não-vazio');
    }

    // Inserção em lote, preservando a ordem para que possamos gerar dependências coerentes.
    const inserted = await this.tasksService.createMany(tasks, {
      resolveProject: true,
      recalculateProjectStats: true,
      ordered: true,
    });

    const mode = body?.autoDependencies?.mode ?? 'none';
    const relationship = body?.autoDependencies?.relationship;
    const reason = body?.autoDependencies?.reason ?? 'Auto-generated dependency (bulk save)';

    let dependencyOps = 0;
    if (mode !== 'none' && inserted.length >= 2) {
      // Build consecutive WBS-leaf groups based on parentWbsNodeId.
      const groups: Array<{ leafId: string; tasks: any[] }> = [];
      for (const t of inserted) {
        const leafId = String((t as any)?.parentWbsNodeId || '').trim();
        if (!leafId) {
          // Ignore non-WBS tasks for auto dependency.
          continue;
        }
        const last = groups[groups.length - 1];
        if (!last || last.leafId !== leafId) {
          groups.push({ leafId, tasks: [t] });
        } else {
          last.tasks.push(t);
        }
      }

      const deps: Array<{
        taskId: string;
        dependsOnTaskId: string;
        projectId: string;
        relationship?: string;
        reason?: string;
        isAutoIdentified?: boolean;
      }> = [];

      for (let gi = 0; gi < groups.length; gi++) {
        const g = groups[gi];
        const projectId = String((g.tasks[0] as any)?.project?.toString?.() ?? (g.tasks[0] as any)?.project ?? '').trim();
        if (!projectId) continue;

        // within-leaf chain
        if (mode === 'within-leaf' || mode === 'within-and-between-leafs') {
          for (let i = 1; i < g.tasks.length; i++) {
            deps.push({
              taskId: String((g.tasks[i] as any)._id),
              dependsOnTaskId: String((g.tasks[i - 1] as any)._id),
              projectId,
              relationship,
              reason,
              isAutoIdentified: true,
            });
          }
        }

        if (mode === 'heuristic-phases' || mode === 'ai-per-leaf') {
          const inferenceTasks = g.tasks.map((t: any) => ({
            id: String(t?._id ?? t?.id ?? ''),
            name: String(t?.name ?? t?.title ?? 'Task'),
            description: t?.description,
            checklist: t?.checklist,
            definitionOfDone: t?.definitionOfDone,
            microTaskType: t?.microTaskType,
          }));

          const inferred =
            mode === 'heuristic-phases'
              ? this.dependencyInference.inferHeuristicPhases(inferenceTasks)
              : await this.dependencyInference.inferWithAi({
                  tasks: inferenceTasks,
                  maxEdges: Number(process.env.CPM_DEP_INFER_MAX_EDGES || 60),
                });

          for (const d of inferred) {
            deps.push({
              taskId: d.taskId,
              dependsOnTaskId: d.dependsOnTaskId,
              projectId,
              relationship: d.relationship ?? relationship,
              reason: d.reason ?? reason,
              isAutoIdentified: true,
            });
          }
        }

        // between-leafs link (only 1 edge between consecutive leaf groups)
        if (mode === 'within-and-between-leafs' && gi > 0) {
          const prev = groups[gi - 1];
          if (prev.tasks.length > 0 && g.tasks.length > 0) {
            const prevLast = prev.tasks[prev.tasks.length - 1];
            const currentFirst = g.tasks[0];
            deps.push({
              taskId: String((currentFirst as any)._id),
              dependsOnTaskId: String((prevLast as any)._id),
              projectId,
              relationship,
              reason: body?.autoDependencies?.reason ?? 'Auto: WBS leaf sequence (bulk save)',
              isAutoIdentified: true,
            });
          }
        }
      }

      // Idempotent upsert avoids duplicate edges on retries.
      dependencyOps = await this.cpmService.upsertDependencies(deps);
    }

    return {
      insertedCount: inserted.length,
      autoDependenciesCreatedOrUpdated: dependencyOps,
      taskIds: inserted.map((t: any) => String(t?._id ?? t?.id ?? '')).filter(Boolean),
    };
  }

  @Post()
  @ApiOperation({ summary: 'Criar uma nova task' })
  @ApiResponse({ status: 201, description: 'Task criada com sucesso.' })
  create(@Body() createTaskDto: CreateTaskDto) {
    return this.tasksService.create(createTaskDto);
  }

  @Post('micro')
  @ApiOperation({ summary: 'Criar uma micro-task com checklist auto-gerado' })
  @ApiResponse({ status: 201, description: 'Micro-task criada com sucesso.' })
  createMicroTask(@Body() createMicroTaskDto: CreateMicroTaskDto) {
    return this.tasksService.createMicroTask(createMicroTaskDto);
  }

  @Post('micro/recurring')
  @ApiOperation({ summary: 'Criar micro-task recorrente (base inicial)' })
  @ApiResponse({ status: 201, description: 'Micro-task recorrente criada com sucesso.' })
  createRecurringMicroTask(@Body() createMicroTaskDto: CreateMicroTaskDto) {
    return this.tasksService.createRecurringMicroTask(createMicroTaskDto);
  }

  @Post('micro/suggest-estimates')
  @ApiOperation({ 
    summary: 'Sugerir estimativas PERT via LLM',
    description: 'Gera sugestões automáticas de estimativas Otimista, Provável e Pessimista usando IA. Retorna valores em minutos.'
  })
  @ApiResponse({ status: 200, description: 'Sugestões geradas com sucesso.', type: PertSuggestionResponseDto })
  async suggestPertEstimates(@Body() suggestDto: SuggestPertDto) {
    return this.tasksService.suggestPertEstimates(
      suggestDto.taskType,
      suggestDto.description,
      suggestDto.projectContext,
    );
  }

  @Get()
  @ApiOperation({ summary: 'Listar todas as tasks' })
  @ApiResponse({ status: 200, description: 'Lista de tasks retornada com sucesso.' })
  findAll() {
    return this.tasksService.findAll();
  }

  // ===== ROTAS ESPECÍFICAS DEVEM VIR ANTES DE :id =====

  @Post('ai-suggestions')
  @ApiOperation({ summary: 'Gerar sugestões de tarefas usando IA baseado nos objetivos do projeto' })
  @ApiResponse({ status: 200, description: 'Sugestões geradas com sucesso.' })
  async generateAiSuggestions(@Body() generateDto: GenerateAiSuggestionsDto) {
    return this.tasksService.generateAiSuggestions(generateDto);
  }

  @Get('micro/:id')
  @ApiOperation({ summary: 'Buscar uma micro-task por id' })
  @ApiResponse({ status: 200, description: 'Micro-task retornada com sucesso.' })
  findMicroTask(@Param('id') id: string) {
    return this.tasksService.findMicroTask(id);
  }

  @Post(':id/checklist')
  @ApiOperation({ summary: 'Atualizar checklist de uma micro-task' })
  @ApiResponse({ status: 200, description: 'Checklist atualizado com sucesso.' })
  updateMicroTaskChecklist(
    @Param('id') id: string,
    @Body() body: UpdateChecklistDto,
  ) {
    return this.tasksService.updateMicroTaskChecklist(id, body.checklist);
  }

  @Patch(':id/checklist/:itemId')
  @ApiOperation({ summary: 'Atualizar um item específico do checklist (Sprint 2)' })
  @ApiResponse({ status: 200, description: 'Item do checklist atualizado com sucesso.' })
  @ApiResponse({ status: 404, description: 'Tarefa ou item não encontrado.' })
  async updateChecklistItem(
    @Param('id') taskId: string,
    @Param('itemId') itemId: string,
    @Body() body: UpdateChecklistItemDto,
  ) {
    return this.tasksService.updateChecklistItem(taskId, itemId, body.completed);
  }

  @Patch(':id/recurring-rule')
  @ApiOperation({ summary: 'Atualizar regra de recorrência de uma task (compat)' })
  @ApiResponse({ status: 200, description: 'Regra de recorrência atualizada com sucesso.' })
  updateRecurringRuleCompat(
    @Param('id') id: string,
    @Body() body: UpdateRecurringRuleDto,
  ) {
    return this.tasksService.updateRecurringRule(id, body.recurringRule);
  }

  @Put(':id/recurring-rule')
  @ApiOperation({ summary: 'Atualizar regra de recorrência de uma task' })
  @ApiResponse({ status: 200, description: 'Regra de recorrência atualizada com sucesso.' })
  updateRecurringRule(
    @Param('id') id: string,
    @Body() body: UpdateRecurringRuleDto,
  ) {
    return this.tasksService.updateRecurringRule(id, body.recurringRule);
  }

  @Post('habit/create')
  @ApiOperation({ summary: 'Criar template recorrente e primeira ocorrência' })
  @ApiResponse({ status: 201, description: 'Hábito recorrente criado com sucesso.' })
  createHabit(@Body() createMicroTaskDto: CreateMicroTaskDto) {
    return this.tasksService.createRecurringMicroTask(createMicroTaskDto);
  }

  @Post(':id/skip')
  @ApiOperation({ summary: 'Marcar ocorrência recorrente como pulada' })
  @ApiResponse({ status: 200, description: 'Ocorrência marcada como pulada.' })
  skipTask(@Param('id') id: string) {
    return this.tasksService.handleTaskSkipped(id);
  }

  @Get(':parentRecurringId/streak')
  @ApiOperation({ summary: 'Buscar streak de uma série recorrente' })
  @ApiResponse({ status: 200, description: 'Dados de streak retornados com sucesso.' })
  getRecurringStreak(@Param('parentRecurringId') parentRecurringId: string) {
    return this.tasksService.getStreakData(parentRecurringId);
  }

  @Delete(':parentRecurringId')
  @ApiOperation({ summary: 'Remover série recorrente inteira (com confirmação)' })
  @ApiResponse({ status: 200, description: 'Série recorrente removida com sucesso.' })
  async deleteRecurringSeries(
    @Param('parentRecurringId') parentRecurringId: string,
    @Query('confirm') confirm?: string,
  ) {
    if (String(confirm || '').toLowerCase() !== 'true') {
      throw new BadRequestException('Confirmação obrigatória: use ?confirm=true para remover a série.');
    }

    return this.tasksService.deleteRecurringSeries(parentRecurringId);
  }

  @Patch(':id/pert')
  @ApiOperation({ 
    summary: 'Atualizar estimativas PERT de uma tarefa',
    description: 'Permite editar as estimativas PERT (Otimista, Provável, Pessimista) após a criação. Recalcula automaticamente o TE e deadline.'
  })
  @ApiResponse({ status: 200, description: 'Estimativas PERT atualizadas com sucesso.' })
  updatePert(
    @Param('id') id: string,
    @Body() updatePertDto: UpdatePertDto,
  ) {
    return this.tasksService.updatePert(id, updatePertDto);
  }

  @Sse('ai-suggestions-stream')
  @ApiOperation({ summary: 'Stream de progresso da geração de tarefas via Server-Sent Events' })
  generateAiSuggestionsStream(
    @Query('projectName') projectName: string,
    @Query('projectId') projectId: string,
    @Query('shortTermGoal') shortTermGoal: string,
    @Query('midTermGoal') midTermGoal: string,
    @Query('longTermGoal') longTermGoal: string,
    @Query('userPrompt') userPrompt: string,
    @Query('targetHours') targetHours: string,
  ): Observable<MessageEvent> {
    const generateDto: GenerateAiSuggestionsDto = {
      projectName: projectName || 'Projeto',
      projectId: projectId || '',
      shortTermGoal: shortTermGoal || '',
      midTermGoal: midTermGoal || '',
      longTermGoal: longTermGoal || '',
      userPrompt: userPrompt || '',
      targetHours: parseInt(targetHours) || 50,
    };

    return new Observable((observer) => {
      // Chama o método assíncrono e captura erros
      (async () => {
        try {
          await this.tasksService.generateAiSuggestionsWithProgress(
            generateDto,
            (progress) => {
              observer.next({ data: progress } as MessageEvent);
            },
            (result) => {
              observer.next({ data: { type: 'complete', result } } as MessageEvent);
              observer.complete();
            },
            (error) => {
              observer.next({ data: { type: 'error', error: error.message } } as MessageEvent);
              observer.error(error);
            },
          );
        } catch (error) {
          observer.error(error);
        }
      })();
    });
  }

  @Patch(':id/status')
  @ApiOperation({ 
    summary: 'Mover task para novo status (Kanban board)',
    description: 'Move a task entre colunas do Kanban. Se status="done", valida checklist e marca como concluída. Outros status apenas atualizam a ordem.'
  })
  @ApiResponse({ status: 200, description: 'Task movida com sucesso.' })
  @ApiResponse({ status: 400, description: 'Validação falhou (checklist incompleto ao mover para done, ou task concluída tentando sair de done).' })
  @ApiResponse({ status: 404, description: 'Task não encontrada.' })
  async moveTaskStatus(
    @Param('id') id: string,
    @Body() body: MoveTaskStatusDto,
  ) {
    return this.tasksService.moveTaskStatus(id, body);
  }

  @Post(':id/check-deviation')
  @ApiOperation({ summary: 'Check time deviation and create alert if needed' })
  @ApiResponse({ status: 200, description: 'Deviation check completed.' })
  async checkDeviation(@Param('id') id: string) {
    return this.tasksService.checkDeviationAndCreateAlert(id);
  }

  @Get(':id/validation-errors')
  @ApiOperation({ summary: 'Return pre-completion validation errors' })
  @ApiResponse({ status: 200, description: 'Validation errors returned.' })
  async getValidationErrors(@Param('id') id: string) {
    return this.tasksService.getValidationErrors(id);
  }

  @Get(':id/lineage')
  @ApiOperation({ 
    summary: 'Buscar lineage de uma task (ancestrais + filhos)',
    description: 'Retorna cadeia de tasks parentes até a raiz e lista de filhos diretos.'
  })
  @ApiResponse({ status: 200, description: 'Lineage retornada com sucesso.' })
  @ApiResponse({ status: 404, description: 'Task não encontrada.' })
  async getTaskLineage(@Param('id') id: string) {
    return this.tasksService.getTaskLineage(id);
  }

  @Get(':id/value-contribution')
  @ApiOperation({
    summary: 'Calcular contribuição de valor (XP) da task para o objetivo raiz',
    description: 'Retorna percentual de contribuição com base em XP de tasks concluídas na árvore do objetivo.'
  })
  @ApiResponse({ status: 200, description: 'Contribuição calculada com sucesso.' })
  async getValueContribution(@Param('id') id: string) {
    return this.tasksService.calculateValueContribution(id);
  }

  @Post(':id/completion-feedback')
  @ApiOperation({ 
    summary: 'Gerar feedback de conclusão via LLM',
    description: 'Gera feedback automático (catchball) para uma task concluída e persiste no banco.'
  })
  @ApiResponse({ status: 200, description: 'Feedback gerado com sucesso.' })
  @ApiResponse({ status: 400, description: 'Task não está concluída.' })
  @ApiResponse({ status: 404, description: 'Task não encontrada.' })
  async generateCompletionFeedback(@Param('id') id: string, @Body() body: any) {
    const feedback = await this.tasksService.generateCompletionFeedback(id, body);
    return { feedback };
  }

  @Get(':id/completion-feedback')
  @ApiOperation({ 
    summary: 'Buscar último feedback de conclusão',
    description: 'Retorna o feedback mais recente de uma task (gerado via LLM).'
  })
  @ApiResponse({ status: 200, description: 'Feedback retornado (pode ser null se não existir).' })
  @ApiResponse({ status: 404, description: 'Task não encontrada.' })
  async getCompletionFeedback(@Param('id') id: string) {
    const task = await this.tasksService.findOne(id);
    if (!task) throw new NotFoundException('Task not found');
    
    const feedback = await this.tasksService.getCompletionFeedback(id);
    return feedback;
  }

  // ===== ROTAS GENÉRICAS COM :id DEVEM VIR POR ÚLTIMO =====

  @Get(':id')
  findOne(@Param('id') id: string) {
    const task = this.tasksService.findOne(id);
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateTaskDto: UpdateTaskDto) {
    const task = this.tasksService.update(id, updateTaskDto);
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  @Delete('item/:id')
  remove(@Param('id') id: string) {
    const removed = this.tasksService.remove(id);
    if (!removed) throw new NotFoundException('Task not found');
    return { message: 'Task removed successfully' };
  }

  @Patch(':id/conclude')
  markAsConcluded(@Param('id') id: string) {
    return this.tasksService.markAsConcluded(id);
  }

  @Patch(':id/increment-pomodoro')
  incrementPomodorosDid(@Param('id') id: string) {
    return this.tasksService.incrementPomodorosDid(id);
  }

  @Post(':id/pert-estimate')
  @ApiOperation({ 
    summary: 'Salvar estimativa PERT (3 pontos) para uma tarefa',
    description: 'Recebe estimativas otimista, provável e pessimista e calcula o tempo esperado via fórmula PERT: (O + 4M + P) / 6'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Estimativa PERT salva com sucesso e métricas calculadas.',
    type: PertEstimateResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Tarefa não encontrada.' })
  @ApiResponse({ status: 400, description: 'Estimativas inválidas (deve ser O ≤ M ≤ P).' })
  async savePertEstimate(
    @Param('id') id: string,
    @Body() pertEstimateDto: PertEstimateDto,
  ): Promise<PertEstimateResponseDto> {
    try {
      return await this.tasksService.savePertEstimate(id, pertEstimateDto);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Erro ao salvar estimativa PERT';

      if (message.includes('não encontrada')) {
        throw new NotFoundException(message);
      }
      throw new BadRequestException(message);
    }
  }
}
