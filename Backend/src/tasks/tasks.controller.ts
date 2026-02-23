import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
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
import { UpdateTaskDto } from './dto/update-task.dto';
import { GenerateAiSuggestionsDto } from './dto/generate-ai-suggestions.dto';
import { PertEstimateDto, PertEstimateResponseDto } from './dto/pert-estimate.dto';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('tasks')
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  @ApiOperation({ summary: 'Criar uma nova task' })
  @ApiResponse({ status: 201, description: 'Task criada com sucesso.' })
  create(@Body() createTaskDto: CreateTaskDto) {
    return this.tasksService.create(createTaskDto);
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

  @Delete(':id')
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
    } catch (error) {
      if (error.message.includes('não encontrada')) {
        throw new NotFoundException(error.message);
      }
      throw new BadRequestException(error.message);
    }
  }
}
