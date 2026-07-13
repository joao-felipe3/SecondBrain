import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { RollingWaveService } from '../services/strategy';
import { RiskService } from '../services/execution';
import { EVMService, EVMProgressService } from '../services/evm';
import { TasksService } from '../../tasks/tasks.service';
import { CPMService, TaskNode, TaskDependencyEdge } from '../../tasks/services/dependencies';
import { CreateWaveDto, UpdateWaveDto } from '../dto/wave.dto';
import { CreateRiskDto, UpdateRiskDto, AssessRisksDto } from '../dto/risk.dto';
import { RecordProjectProgressDto } from '../dto/evm.dto';
import { ProjectWave } from '../schemas/project-wave.schema';
import { Risk } from '../schemas/risk.schema';
import { Project } from '../entities/project.entity';

@Controller('projects/:projectId')
export class WaveAndRiskController {
  constructor(
    private readonly waveService: RollingWaveService,
    private readonly riskService: RiskService,
    private readonly evmService: EVMService,
    private readonly evmProgressService: EVMProgressService,
    private readonly tasksService: TasksService,
    private readonly cpmService: CPMService,
    @InjectModel(Project.name) private projectModel: Model<any>,
  ) {}

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error);
  }

  private mapTaskToNode(
    task: any,
    dependencyMap: Map<string, string[]>,
    dependencyEdgeMap: Map<string, TaskDependencyEdge[]>,
  ): TaskNode {
    const taskId = String(task?._id ?? task?.id);
    const pertMinutes = Number(task?.pertExpectedMinutes || 0);
    const pomodoroMinutes = Math.max(1, Number(task?.pomodorosPlanned || 0)) * 25;
    const duration = pertMinutes > 0 ? pertMinutes : pomodoroMinutes;

    return {
      id: taskId,
      name: String(task?.name || 'Task'),
      duration,
      dependencies: dependencyMap.get(taskId) || [],
      dependencyEdges: dependencyEdgeMap.get(taskId) || [],
      parentWbsNodeId: task?.parentWbsNodeId ? String(task.parentWbsNodeId) : undefined,
      wbsPath: task?.wbsPath ? String(task.wbsPath) : undefined,
    };
  }

  private selectNextAction(params: {
    interventions: Array<{
      recommendedAction: string;
      confidence: number;
      description: string;
    }>;
    evm: { paceStatus: string; actionHint: string };
    cpmAnalysis: { criticalPath: string[]; diagnostics?: any };
    taskNameById: Map<string, string>;
  }): {
    type: 'risco' | 'caminho-critico' | 'ritmo';
    title: string;
    rationale: string;
    confidence: number;
    taskId?: string;
    cta: string;
  } {
    const prioritizedRisk = params.interventions.find((item) => item.recommendedAction !== 'monitorar');
    if (prioritizedRisk && prioritizedRisk.confidence >= 0.8) {
      return {
        type: 'risco',
        title: 'Tratar risco prioritario agora',
        rationale: prioritizedRisk.description,
        confidence: prioritizedRisk.confidence,
        cta: 'Abrir registro de riscos',
      };
    }

    const firstCriticalTaskId = params.cpmAnalysis.criticalPath?.[0];
    if (firstCriticalTaskId) {
      const taskName = params.taskNameById.get(firstCriticalTaskId) || 'Tarefa critica';
      return {
        type: 'caminho-critico',
        title: `Executar tarefa critica: ${taskName}`,
        rationale: 'A tarefa esta no caminho critico e reduz risco de atraso em cadeia.',
        confidence: 0.78,
        taskId: firstCriticalTaskId,
        cta: 'Abrir tarefa critica',
      };
    }

    const isCriticalPace = params.evm.paceStatus === 'critico';
    return {
      type: 'ritmo',
      title: isCriticalPace ? 'Replanejar semana' : 'Manter cadencia semanal',
      rationale: params.evm.actionHint,
      confidence: isCriticalPace ? 0.74 : 0.64,
      cta: 'Abrir revisao semanal',
    };
  }

  // ============================================
  // ROLLING WAVE ENDPOINTS
  // ============================================

  @Get('waves')
  async getWaves(@Param('projectId') projectId: string): Promise<ProjectWave[]> {
    try {
      return await this.waveService.getWavesByProject(projectId);
    } catch (error) {
      throw new HttpException(
        `Erro ao buscar ondas: ${this.getErrorMessage(error)}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('generate-waves')
  async generateWaves(
    @Param('projectId') projectId: string,
    @Body() body: { totalDurationDays?: number; waveLengthDays?: number } = {},
  ): Promise<ProjectWave[]> {
    try {
      console.log(`[WaveAndRiskController.generateWaves] projectId: ${projectId}, body:`, body);

      // Buscar projeto para obter deadline e smartObjective
      const project = await this.projectModel.findById(projectId).populate('tasks');
      if (!project) {
        throw new HttpException('Projeto nÃ£o encontrado', HttpStatus.NOT_FOUND);
      }

      console.log(
        `[WaveAndRiskController.generateWaves] Found project: ${project.name}, tasks: ${project.tasks?.length || 0}`,
      );

      const result = await this.waveService.createInitialWaves(
        projectId,
        project,
        body?.waveLengthDays || 28,
      );

      console.log(`[WaveAndRiskController.generateWaves] Waves created successfully`);
      return result;
    } catch (error) {
      console.error('[WaveAndRiskController.generateWaves] Exception:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new HttpException(`Erro ao gerar ondas: ${errorMessage}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Patch('waves/:waveId')
  async updateWave(
    @Param('projectId') projectId: string,
    @Param('waveId') waveId: string,
    @Body() updateWaveDto: UpdateWaveDto,
  ): Promise<ProjectWave | null> {
    try {
      const wave = await this.waveService.updateWaveStatus(
        projectId,
        waveId,
        updateWaveDto.status || 'planned',
      );
      return wave;
    } catch (error) {
      throw new HttpException(
        `Erro ao atualizar onda: ${this.getErrorMessage(error)}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('waves/:waveId/advance')
  async advanceWave(
    @Param('projectId') projectId: string,
    @Param('waveId') waveId: string,
  ): Promise<ProjectWave | null> {
    try {
      return await this.waveService.advanceToNextWave(projectId);
    } catch (error) {
      throw new HttpException(
        `Erro ao avanÃ§ar onda: ${this.getErrorMessage(error)}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('waves/replan-task-deadlines')
  async replanTaskDeadlines(@Param('projectId') projectId: string): Promise<{
    updatedCount: number;
    skippedConcludedCount: number;
    waveCount: number;
    summaries: Array<{
      waveNumber: number;
      updatedTasks: number;
      skippedConcludedTasks: number;
      effectiveStartDate: string | null;
      effectiveEndDate: string | null;
    }>;
  }> {
    try {
      return await this.waveService.replanTaskDeadlines(projectId);
    } catch (error) {
      throw new HttpException(
        `Erro ao replanejar prazos das tasks: ${this.getErrorMessage(error)}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ============================================
  // RISK ENDPOINTS
  // ============================================

  @Get('risks')
  async getRisks(@Param('projectId') projectId: string): Promise<Risk[]> {
    try {
      return await this.riskService.getRisksByProject(projectId);
    } catch (error) {
      throw new HttpException(
        `Erro ao buscar riscos: ${this.getErrorMessage(error)}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('assess-risks')
  async assessRisks(
    @Param('projectId') projectId: string,
    @Body() body: { projectDescription?: string },
  ): Promise<Risk[]> {
    try {
      console.log(`[WaveAndRiskController.assessRisks] projectId: ${projectId}, body:`, body);
      const projectDescription = body.projectDescription || 'Projeto sem descriÃ§Ã£o';
      const result = await this.riskService.assessRisks(projectId, projectDescription);
      console.log(`[WaveAndRiskController.assessRisks] Success, returned ${result.length} risks`);
      return result;
    } catch (error) {
      console.error('[WaveAndRiskController.assessRisks] Exception:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new HttpException(
        `Erro ao avaliar riscos: ${errorMessage}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('risks/severity/:severity')
  async getRisksBySeverity(
    @Param('projectId') projectId: string,
    @Param('severity') severity: string,
  ): Promise<Risk[]> {
    try {
      return await this.riskService.getRisksBySeverity(projectId, severity);
    } catch (error) {
      throw new HttpException(
        `Erro ao buscar riscos por severidade: ${this.getErrorMessage(error)}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('risks')
  async createRisk(
    @Param('projectId') projectId: string,
    @Body() createRiskDto: CreateRiskDto,
  ): Promise<Risk> {
    try {
      const risk = await this.riskService['riskModel'].create({
        projectId,
        ...createRiskDto,
      });
      return risk;
    } catch (error) {
      throw new HttpException(
        `Erro ao criar risco: ${this.getErrorMessage(error)}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Patch('risks/:riskId')
  async updateRisk(
    @Param('projectId') projectId: string,
    @Param('riskId') riskId: string,
    @Body() updateRiskDto: UpdateRiskDto,
  ): Promise<Risk | null> {
    try {
      const updates = {
        ...updateRiskDto,
      };
      const risk = await this.riskService['riskModel']
        .findByIdAndUpdate(riskId, updates, { new: true })
        .exec();
      return risk;
    } catch (error) {
      throw new HttpException(
        `Erro ao atualizar risco: ${this.getErrorMessage(error)}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Delete('risks/:riskId')
  async deleteRisk(
    @Param('projectId') projectId: string,
    @Param('riskId') riskId: string,
  ): Promise<{ message: string }> {
    try {
      await this.riskService.deleteRisk(riskId);
      return { message: 'Risco deletado com sucesso' };
    } catch (error) {
      throw new HttpException(
        `Erro ao deletar risco: ${this.getErrorMessage(error)}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('risks/statistics')
  async getRiskStatistics(@Param('projectId') projectId: string): Promise<{
    total: number;
    byStatus: Record<string, number>;
    bySeverity: Record<string, number>;
  }> {
    try {
      return await this.riskService.getRiskStatistics(projectId);
    } catch (error) {
      throw new HttpException(
        `Erro ao buscar estatísticas: ${this.getErrorMessage(error)}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('risks/interventions')
  async getRiskInterventions(@Param('projectId') projectId: string) {
    try {
      return await this.riskService.getRiskInterventions(projectId);
    } catch (error) {
      throw new HttpException(
        `Erro ao gerar recomendações de risco: ${this.getErrorMessage(error)}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ============================================
  // EVM ENDPOINTS
  // ============================================

  @Post('evm/progress')
  async recordProgress(@Param('projectId') projectId: string, @Body() body: RecordProjectProgressDto) {
    try {
      return await this.evmProgressService.recordProgress({
        projectId,
        completedHours: body.completedHours,
        plannedValue: body.plannedValue,
        date: body.date,
      });
    } catch (error) {
      throw new HttpException(
        `Erro ao registrar progresso EVM: ${this.getErrorMessage(error)}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('evm/progress')
  async getProgressEntries(@Param('projectId') projectId: string) {
    try {
      return await this.evmProgressService.getProgressEntries(projectId);
    } catch (error) {
      throw new HttpException(
        `Erro ao buscar progresso EVM: ${this.getErrorMessage(error)}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Delete('evm/progress/:entryId')
  async deleteProgressEntry(@Param('projectId') projectId: string, @Param('entryId') entryId: string) {
    try {
      const deleted = await this.evmProgressService.deleteProgressEntry(projectId, entryId);
      return { deleted };
    } catch (error) {
      throw new HttpException(
        `Erro ao remover registro EVM: ${this.getErrorMessage(error)}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('evm/spi')
  async getSPI(@Param('projectId') projectId: string) {
    try {
      const spi = await this.evmService.calculateSPI(projectId);
      return { spi };
    } catch (error) {
      throw new HttpException(
        `Erro ao calcular SPI: ${this.getErrorMessage(error)}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('evm/forecast')
  async getForecast(@Param('projectId') projectId: string) {
    try {
      return await this.evmService.forecastCompletion(projectId);
    } catch (error) {
      throw new HttpException(
        `Erro ao calcular previsao EVM: ${this.getErrorMessage(error)}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('evm/curve')
  async getCurve(@Param('projectId') projectId: string) {
    try {
      return await this.evmService.getEVMCurve(projectId);
    } catch (error) {
      throw new HttpException(
        `Erro ao buscar curva EVM: ${this.getErrorMessage(error)}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('evm/summary')
  async getEVMSummary(@Param('projectId') projectId: string) {
    try {
      return await this.evmService.getEVMSummary(projectId);
    } catch (error) {
      throw new HttpException(
        `Erro ao buscar resumo EVM: ${this.getErrorMessage(error)}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('evm/personal-summary')
  async getPersonalEVMSummary(@Param('projectId') projectId: string) {
    try {
      return await this.evmService.getPersonalSummary(projectId);
    } catch (error) {
      throw new HttpException(
        `Erro ao buscar resumo pessoal EVM: ${this.getErrorMessage(error)}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('evm/metric-preferences')
  async getMetricPreferences(@Param('projectId') projectId: string) {
    try {
      return await this.evmProgressService.getDashboardPreferences(projectId);
    } catch (error) {
      throw new HttpException(
        `Erro ao buscar preferencias de metricas EVM: ${this.getErrorMessage(error)}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Patch('evm/metric-preferences')
  async updateMetricPreferences(
    @Param('projectId') projectId: string,
    @Body()
    body: {
      mode?: 'auto' | 'manual';
      manualVisibility?: {
        spi?: boolean;
        plannedVsEarned?: boolean;
        completedHours?: boolean;
        consistency?: boolean;
        planAdherence?: boolean;
        trend?: boolean;
        perceivedProgress?: boolean;
        remainingHours?: boolean;
      };
    },
  ) {
    try {
      return await this.evmProgressService.saveDashboardPreferences(projectId, body);
    } catch (error) {
      throw new HttpException(
        `Erro ao atualizar preferencias de metricas EVM: ${this.getErrorMessage(error)}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('next-best-action')
  async getNextBestAction(@Param('projectId') projectId: string) {
    try {
      const [riskInterventions, personalEvm, tasks, dependencies] = await Promise.all([
        this.riskService.getRiskInterventions(projectId),
        this.evmService.getPersonalSummary(projectId),
        this.tasksService.findByProjectId(projectId),
        this.cpmService.getDependencies(projectId),
      ]);

      const dependencyMap = new Map<string, string[]>();
      const dependencyEdgeMap = new Map<string, TaskDependencyEdge[]>();
      for (const dep of dependencies as any[]) {
        const taskId = String(dep.taskId);
        const dependsOnTaskId = String(dep.dependsOnTaskId);
        const existing = dependencyMap.get(taskId) || [];
        existing.push(dependsOnTaskId);
        dependencyMap.set(taskId, existing);

        const existingEdges = dependencyEdgeMap.get(taskId) || [];
        existingEdges.push({
          predecessorId: dependsOnTaskId,
          relationship: this.cpmService.normalizeRelationship(dep?.relationship),
        });
        dependencyEdgeMap.set(taskId, existingEdges);
      }

      const taskNodes: TaskNode[] = (tasks as any[])
        .filter((task) => !task?.isConcluded)
        .map((task) => this.mapTaskToNode(task, dependencyMap, dependencyEdgeMap));

      const cpmAnalysis = this.cpmService.calculateCriticalPath(taskNodes);
      const taskNameById = new Map<string, string>(
        (tasks as any[]).map((task) => [String(task?._id), String(task?.name || 'Task')]),
      );

      const action = this.selectNextAction({
        interventions: riskInterventions.interventions,
        evm: personalEvm,
        cpmAnalysis,
        taskNameById,
      });

      return {
        action,
        signals: {
          risk: riskInterventions.summary,
          pace: {
            status: personalEvm.paceStatus,
            consistencyScore: personalEvm.consistencyScore,
            planAdherence: personalEvm.planAdherence,
          },
          cpm: {
            criticalTasks: cpmAnalysis.diagnostics?.criticalCount || 0,
            projectDuration: cpmAnalysis.projectDuration,
          },
        },
      };
    } catch (error) {
      throw new HttpException(
        `Erro ao calcular proxima melhor acao: ${this.getErrorMessage(error)}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
