import { Injectable, Logger } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types, Document } from 'mongoose'
import { ProjectWave, ProjectWaveDocument } from '../schemas/project-wave.schema'
import { ProjectsService } from '../projects.service'

@Injectable()
export class RollingWaveService {
  private readonly logger = new Logger(RollingWaveService.name)

  constructor(
    @InjectModel(ProjectWave.name) private waveModel: Model<ProjectWaveDocument>,
    private readonly projectsService: ProjectsService,
  ) {}

  /**
   * Criar ondas iniciais baseadas na duração do projeto
   * Duração calculada: deadline - startDate do projeto
   */
  async createInitialWaves(
    projectId: string,
    project: any,
    waveLengthDays: number = 28, // 4 semanas padrão
  ): Promise<ProjectWave[]> {
    // Calcular duração em dias
    const startDate = new Date(project.startDate)
    const deadline = new Date(project.deadline)
    const totalMs = deadline.getTime() - startDate.getTime()
    const totalDurationDays = Math.ceil(totalMs / (24 * 60 * 60 * 1000))

    this.logger.debug(
      `Calculando ondas para projeto ${projectId}: startDate=${startDate.toISOString()}, deadline=${deadline.toISOString()}, totalDays=${totalDurationDays}`,
    )

    if (totalDurationDays <= 0) {
      throw new Error('Deadline do projeto deve ser depois da data de início')
    }

    const waveLengthMs = waveLengthDays * 24 * 60 * 60 * 1000
    const waveCount = Math.ceil(totalDurationDays / waveLengthDays)

    const waves: ProjectWave[] = []

    for (let i = 1; i <= waveCount; i++) {
      const waveStartDate = new Date(startDate.getTime() + (i - 1) * waveLengthMs)
      const waveEndDate = new Date(waveStartDate.getTime() + waveLengthMs)

      const wave = new this.waveModel({
        projectId: new Types.ObjectId(projectId),
        waveNumber: i,
        startDate: waveStartDate,
        endDate: waveEndDate,
        status: i === 1 ? 'planned' : 'planned',
        taskIds: [],
      })

      await wave.save()
      waves.push(wave)
    }

    this.logger.debug(`Criadas ${waveCount} ondas para projeto ${projectId}`)

    // Distribuir tarefas existentes para as ondas usando ProjectsService
    await this.distributeProjectTasks(projectId, waves)

    return waves
  }

  /**
   * Distribuir tarefas do projeto para as ondas
   * Usa ProjectsService.getTasksForProject() para obter tarefas
   */
  private async distributeProjectTasks(
    projectId: string,
    waves: ProjectWave[],
  ): Promise<void> {
    try {
      // Obter tarefas do projeto usando ProjectsService
      const tasks = await this.projectsService.getTasksForProject(projectId)

      if (!tasks || tasks.length === 0) {
        this.logger.debug(`Nenhuma tarefa para distribuir no projeto ${projectId}`)
        return
      }

      // Distribuir tarefas round-robin entre as ondas
      for (let i = 0; i < tasks.length; i++) {
        const task = tasks[i] as any
        const waveIndex = i % waves.length
        const wave = waves[waveIndex]

        // Obter um id de tarefa robusto (pode ser _id ou id) e validar
        const rawId = task._id ?? task.id
        if (!rawId) {
          this.logger.warn(`Task sem id no projeto ${projectId}, índice ${i} — pulando`)
          continue
        }

        let taskObjectId: Types.ObjectId
        try {
          taskObjectId = new Types.ObjectId(rawId.toString())
        } catch (err) {
          this.logger.warn(`Id de tarefa inválido para distribuição: ${rawId} — pulando`)
          continue
        }

        // Adicionar taskId à onda
        await this.waveModel.findByIdAndUpdate(
          (wave as any)._id,
          { $addToSet: { taskIds: taskObjectId } },
          { new: true },
        )
      }

      this.logger.debug(
        `Distribuídas ${tasks.length} tarefas entre ${waves.length} ondas do projeto ${projectId}`,
      )
    } catch (error) {
      this.logger.warn(`Erro ao distribuir tarefas para ondas: ${error.message}`)
      // Continuar sem distribuição, ondas já foram criadas
    }
  }

  /**
   * Obter todas as ondas de um projeto
   */
  async getWavesByProject(projectId: string): Promise<ProjectWave[]> {
    return this.waveModel
      .find({ projectId: new Types.ObjectId(projectId) })
      .sort({ waveNumber: 1 })
      .exec()
  }

  /**
   * Atualizar status de uma onda
   */
  async updateWaveStatus(
    projectId: string,
    waveId: string,
    status: 'planned' | 'active' | 'completed',
  ): Promise<ProjectWave | null> {
    // Se ativando uma onda, desativar a anterior
    if (status === 'active') {
      await this.waveModel.updateMany(
        { projectId: new Types.ObjectId(projectId), status: 'active' },
        { status: 'planned' },
      )
    }

    return this.waveModel
      .findByIdAndUpdate(waveId, { status }, { new: true })
      .exec()
  }

  /**
   * Adicionar tarefa a uma onda
   */
  async addTaskToWave(waveId: string, taskId: string): Promise<ProjectWave | null> {
    return this.waveModel
      .findByIdAndUpdate(
        waveId,
        { $addToSet: { taskIds: new Types.ObjectId(taskId) } },
        { new: true },
      )
      .exec()
  }

  /**
   * Remover tarefa de uma onda
   */
  async removeTaskFromWave(waveId: string, taskId: string): Promise<ProjectWave | null> {
    return this.waveModel
      .findByIdAndUpdate(
        waveId,
        { $pull: { taskIds: new Types.ObjectId(taskId) } },
        { new: true },
      )
      .exec()
  }

  /**
   * Obter onda atual (em progresso)
   */
  async getCurrentWave(projectId: string): Promise<ProjectWave | null> {
    return this.waveModel
      .findOne({
        projectId: new Types.ObjectId(projectId),
        status: 'active',
      })
      .exec()
  }

  /**
   * Avançar para próxima onda
   */
  async advanceToNextWave(projectId: string): Promise<ProjectWave | null> {
    // Marcar onda atual como completa
    const currentWave = await this.getCurrentWave(projectId)
    if (currentWave) {
      const waveId = (currentWave as any)._id?.toString()
      if (waveId) {
        await this.updateWaveStatus(projectId, waveId, 'completed')
      }
    }

    // Ativar próxima onda
    const waves = await this.getWavesByProject(projectId)
    const plannedWave = waves.find(w => w.status === 'planned')

    if (plannedWave) {
      const waveId = (plannedWave as any)._id?.toString()
      if (waveId) {
        return this.updateWaveStatus(projectId, waveId, 'active')
      }
    }

    return null
  }
}
