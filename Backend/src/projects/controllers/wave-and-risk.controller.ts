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
} from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { RollingWaveService } from '../services/rolling-wave.service'
import { RiskService } from '../services/risk.service'
import { EVMService } from '../services/evm.service'
import { CreateWaveDto, UpdateWaveDto } from '../dto/wave.dto'
import { CreateRiskDto, UpdateRiskDto, AssessRisksDto } from '../dto/risk.dto'
import { RecordProjectProgressDto } from '../dto/evm.dto'
import { ProjectWave } from '../schemas/project-wave.schema'
import { Risk } from '../schemas/risk.schema'
import { Project } from '../entities/project.entity'

@Controller('projects/:projectId')
export class WaveAndRiskController {
  constructor(
    private readonly waveService: RollingWaveService,
    private readonly riskService: RiskService,
    private readonly evmService: EVMService,
    @InjectModel(Project.name) private projectModel: Model<any>,
  ) {}

  // ============================================
  // ROLLING WAVE ENDPOINTS
  // ============================================

  @Get('waves')
  async getWaves(@Param('projectId') projectId: string): Promise<ProjectWave[]> {
    try {
      return await this.waveService.getWavesByProject(projectId)
    } catch (error) {
      throw new HttpException(
        `Erro ao buscar ondas: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      )
    }
  }

  @Post('generate-waves')
  async generateWaves(
    @Param('projectId') projectId: string,
    @Body() body: { totalDurationDays?: number; waveLengthDays?: number } = {},
  ): Promise<ProjectWave[]> {
    try {
      console.log(`[WaveAndRiskController.generateWaves] projectId: ${projectId}, body:`, body)
      
      // Buscar projeto para obter deadline e smartObjective
      const project = await this.projectModel.findById(projectId).populate('tasks')
      if (!project) {
        throw new HttpException('Projeto não encontrado', HttpStatus.NOT_FOUND)
      }

      console.log(`[WaveAndRiskController.generateWaves] Found project: ${project.name}, tasks: ${project.tasks?.length || 0}`)

      const result = await this.waveService.createInitialWaves(
        projectId,
        project,
        body?.waveLengthDays || 28,
      )
      
      console.log(`[WaveAndRiskController.generateWaves] Waves created successfully`)
      return result
    } catch (error) {
      console.error('[WaveAndRiskController.generateWaves] Exception:', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      throw new HttpException(
        `Erro ao gerar ondas: ${errorMessage}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      )
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
      )
      return wave
    } catch (error) {
      throw new HttpException(
        `Erro ao atualizar onda: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      )
    }
  }

  @Post('waves/:waveId/advance')
  async advanceWave(
    @Param('projectId') projectId: string,
    @Param('waveId') waveId: string,
  ): Promise<ProjectWave | null> {
    try {
      return await this.waveService.advanceToNextWave(projectId)
    } catch (error) {
      throw new HttpException(
        `Erro ao avançar onda: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      )
    }
  }

  @Post('waves/replan-task-deadlines')
  async replanTaskDeadlines(@Param('projectId') projectId: string): Promise<{
    updatedCount: number
    skippedConcludedCount: number
    waveCount: number
    summaries: Array<{
      waveNumber: number
      updatedTasks: number
      skippedConcludedTasks: number
      effectiveStartDate: string | null
      effectiveEndDate: string | null
    }>
  }> {
    try {
      return await this.waveService.replanTaskDeadlines(projectId)
    } catch (error) {
      throw new HttpException(
        `Erro ao replanejar prazos das tasks: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      )
    }
  }

  // ============================================
  // RISK ENDPOINTS
  // ============================================

  @Get('risks')
  async getRisks(@Param('projectId') projectId: string): Promise<Risk[]> {
    try {
      return await this.riskService.getRisksByProject(projectId)
    } catch (error) {
      throw new HttpException(
        `Erro ao buscar riscos: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      )
    }
  }

  @Post('assess-risks')
  async assessRisks(
    @Param('projectId') projectId: string,
    @Body() body: { projectDescription?: string },
  ): Promise<Risk[]> {
    try {
      console.log(`[WaveAndRiskController.assessRisks] projectId: ${projectId}, body:`, body)
      const projectDescription = body.projectDescription || 'Projeto sem descrição'
      const result = await this.riskService.assessRisks(projectId, projectDescription)
      console.log(`[WaveAndRiskController.assessRisks] Success, returned ${result.length} risks`)
      return result
    } catch (error) {
      console.error('[WaveAndRiskController.assessRisks] Exception:', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      throw new HttpException(
        `Erro ao avaliar riscos: ${errorMessage}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      )
    }
  }

  @Get('risks/severity/:severity')
  async getRisksBySeverity(
    @Param('projectId') projectId: string,
    @Param('severity') severity: string,
  ): Promise<Risk[]> {
    try {
      return await this.riskService.getRisksBySeverity(projectId, severity)
    } catch (error) {
      throw new HttpException(
        `Erro ao buscar riscos por severidade: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      )
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
      })
      return risk
    } catch (error) {
      throw new HttpException(
        `Erro ao criar risco: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      )
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
      }
      const risk = await this.riskService['riskModel']
        .findByIdAndUpdate(riskId, updates, { new: true })
        .exec()
      return risk
    } catch (error) {
      throw new HttpException(
        `Erro ao atualizar risco: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      )
    }
  }

  @Delete('risks/:riskId')
  async deleteRisk(
    @Param('projectId') projectId: string,
    @Param('riskId') riskId: string,
  ): Promise<{ message: string }> {
    try {
      await this.riskService.deleteRisk(riskId)
      return { message: 'Risco deletado com sucesso' }
    } catch (error) {
      throw new HttpException(
        `Erro ao deletar risco: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      )
    }
  }

  @Get('risks/statistics')
  async getRiskStatistics(
    @Param('projectId') projectId: string,
  ): Promise<{ total: number; byStatus: Record<string, number>; bySeverity: Record<string, number> }> {
    try {
      return await this.riskService.getRiskStatistics(projectId)
    } catch (error) {
      throw new HttpException(
        `Erro ao buscar estatísticas: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      )
    }
  }

  // ============================================
  // EVM ENDPOINTS
  // ============================================

  @Post('evm/progress')
  async recordProgress(
    @Param('projectId') projectId: string,
    @Body() body: RecordProjectProgressDto,
  ) {
    try {
      return await this.evmService.recordProgress(
        projectId,
        body.completedHours,
        body.actualCost,
        body.plannedValue,
        body.date,
      )
    } catch (error) {
      throw new HttpException(
        `Erro ao registrar progresso EVM: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      )
    }
  }

  @Get('evm/progress')
  async getProgressEntries(@Param('projectId') projectId: string) {
    try {
      return await this.evmService.getProgressEntries(projectId)
    } catch (error) {
      throw new HttpException(
        `Erro ao buscar progresso EVM: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      )
    }
  }

  @Delete('evm/progress/:entryId')
  async deleteProgressEntry(
    @Param('projectId') projectId: string,
    @Param('entryId') entryId: string,
  ) {
    try {
      const deleted = await this.evmService.deleteProgressEntry(projectId, entryId)
      return { deleted }
    } catch (error) {
      throw new HttpException(
        `Erro ao remover registro EVM: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      )
    }
  }

  @Get('evm/spi')
  async getSPI(@Param('projectId') projectId: string) {
    try {
      const spi = await this.evmService.calculateSPI(projectId)
      return { spi }
    } catch (error) {
      throw new HttpException(
        `Erro ao calcular SPI: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      )
    }
  }

  @Get('evm/cpi')
  async getCPI(@Param('projectId') projectId: string) {
    try {
      const cpi = await this.evmService.calculateCPI(projectId)
      return { cpi }
    } catch (error) {
      throw new HttpException(
        `Erro ao calcular CPI: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      )
    }
  }

  @Get('evm/forecast')
  async getForecast(@Param('projectId') projectId: string) {
    try {
      return await this.evmService.forecastCompletion(projectId)
    } catch (error) {
      throw new HttpException(
        `Erro ao calcular previsao EVM: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      )
    }
  }

  @Get('evm/curve')
  async getCurve(@Param('projectId') projectId: string) {
    try {
      return await this.evmService.getEVMCurve(projectId)
    } catch (error) {
      throw new HttpException(
        `Erro ao buscar curva EVM: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      )
    }
  }

  @Get('evm/summary')
  async getEVMSummary(@Param('projectId') projectId: string) {
    try {
      return await this.evmService.getEVMSummary(projectId)
    } catch (error) {
      throw new HttpException(
        `Erro ao buscar resumo EVM: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      )
    }
  }
}
