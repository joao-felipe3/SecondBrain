import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ProjectBuffer,
  ProjectBufferDocument,
} from '../schemas/project-buffer.schema';

export interface TaskMetrics {
  taskId: string;
  estimatedHours: number;
  variance?: number;
  isCritical?: boolean;
}

export interface BufferStatus {
  total: number;
  consumed: number;
  remaining: number;
  percentageUsed: number;
  isAlert: boolean;
}

export interface BufferAlert {
  severity: 'warning' | 'critical';
  message: string;
  recommendation: string;
  percentageUsed: number;
}

@Injectable()
export class BufferService {
  private readonly logger = new Logger(BufferService.name);

  constructor(
    @InjectModel(ProjectBuffer.name)
    private bufferModel: Model<ProjectBufferDocument>,
  ) {}

  /**
   * Calcula el buffer del proyecto basado en:
   * 1. Duración del camino crítico
   * 2. Varianza total del camino crítico
   * 3. Factor de consolidación (50% de la duración crítica)
   */
  async calculateProjectBuffer(
    projectId: string,
    tasks: TaskMetrics[],
    criticalPath: string[],
  ): Promise<ProjectBuffer | null> {
    this.logger.log(
      `Calculando buffer para proyecto: ${projectId}, tareas críticas: ${criticalPath.length}`,
    );

    if (!criticalPath.length) {
      this.logger.warn(`Proyecto ${projectId} no tiene tareas críticas`);
      return this.createDefaultBuffer(projectId);
    }

    // 1. Obtener tareas del camino crítico
    const criticalTasks = tasks.filter((t) => criticalPath.includes(t.taskId));

    // 2. Calcular duración total del camino crítico
    const criticalPathDuration = criticalTasks.reduce(
      (sum, t) => sum + t.estimatedHours,
      0,
    );

    // 3. Calcular varianza total (suma de varianzas)
    const totalVariance = criticalTasks.reduce(
      (sum, t) => sum + (t.variance || 0),
      0,
    );

    // Diagnóstico: log detalhado das tarefas críticas
    const criticalTasksDebug = criticalTasks.map((t) => ({
      taskId: t.taskId,
      estimatedHours: t.estimatedHours,
      variance: t.variance,
    }));

    // 4. Desviação estándar
    const standardDeviation = Math.sqrt(totalVariance);

    // 5. Buffer = 50% de la duración del camino crítico
    // (Esto es más conservador que usar desviación estándar pura)
    const projectBuffer = Math.max(
      criticalPathDuration * 0.5,
      standardDeviation * 1.645, // Intervalo de confianza del 95%
    );

    // 6. Guardar o actualizar buffer en BD
    const bufferDoc = await this.bufferModel.findOneAndUpdate(
      { projectId },
      {
        projectId,
        projectBuffer: Math.round(projectBuffer * 10) / 10,
        consumed: 0,
        threshold: 75,
        criticalPathDuration: Math.round(criticalPathDuration * 10) / 10,
        totalVariance: Math.round(totalVariance * 100) / 100,
        standardDeviation: Math.round(standardDeviation * 10) / 10,
        taskVariances: criticalTasks
          .filter((t) => t.variance && t.variance > 0)
          .map((t) => ({
            taskId: t.taskId,
            variance: Math.round(t.variance! * 100) / 100,
          })),
      },
      { upsert: true, new: true },
    );

    if (!bufferDoc) {
      this.logger.error(
        `Failed to create/update buffer for project ${projectId}`,
      );
      return null;
    }

    this.logger.log(
      `Buffer calculado: ${bufferDoc.projectBuffer}h (Varianza Total: ${totalVariance.toFixed(2)})`,
    );

    return bufferDoc;
  }

  /**
   * Registra consumo de buffer cuando se completan tareas
   */
  async consumeBuffer(
    projectId: string,
    hoursUsed: number,
  ): Promise<BufferStatus> {
    this.logger.log(
      `Consumiendo ${hoursUsed}h de buffer para proyecto: ${projectId}`,
    );

    const buffer = await this.bufferModel.findOneAndUpdate(
      { projectId },
      { $inc: { consumed: hoursUsed } },
      { new: true },
    );

    if (!buffer) {
      this.logger.warn(`Buffer no encontrado para proyecto: ${projectId}`);
      return this.getDefaultBufferStatus();
    }

    const status = this.getBufferStatusFromDoc(buffer);

    if (status.percentageUsed >= buffer.threshold) {
      this.logger.warn(
        `⚠️ Buffer en alerta: ${status.percentageUsed}% consumido (límite: ${buffer.threshold}%)`,
      );
    }

    return status;
  }

  /**
   * Obtiene el estado actual del buffer
   */
  async getBufferStatus(projectId: string): Promise<BufferStatus> {
    const buffer = await this.bufferModel.findOne({ projectId });

    if (!buffer) {
      this.logger.warn(`Buffer no encontrado para proyecto: ${projectId}`);
      return this.getDefaultBufferStatus();
    }

    return this.getBufferStatusFromDoc(buffer);
  }

  /**
   * Genera alertas sobre la salud del buffer
   */
  async checkBufferHealth(projectId: string): Promise<BufferAlert[]> {
    const buffer = await this.bufferModel.findOne({ projectId });

    if (!buffer) {
      return [];
    }

    const alerts: BufferAlert[] = [];
    const status = this.getBufferStatusFromDoc(buffer);

    // Alerta en 50%
    if (status.percentageUsed >= 50 && status.percentageUsed < 75) {
      alerts.push({
        severity: 'warning',
        message: `Buffer en punto medio: ${status.percentageUsed}% consumido`,
        recommendation:
          'Las próximas tarefas deben ejecutarse sin demoras. Considere aumentar recursos o priorizar.',
        percentageUsed: status.percentageUsed,
      });
    }

    // Alerta crítica en 75%
    if (status.percentageUsed >= 75) {
      alerts.push({
        severity: 'critical',
        message: `⚠️ Buffer crítico: ${status.percentageUsed}% consumido`,
        recommendation:
          'ACCIÓN INMEDIATA REQUERIDA. Tarefas restantes deben ser priorizadas. Reduzca el scope o aumente recursos.',
        percentageUsed: status.percentageUsed,
      });
    }

    // Todo el buffer consumido
    if (status.percentageUsed >= 100) {
      alerts.push({
        severity: 'critical',
        message: '🚨 Buffer completamente consumido',
        recommendation:
          'El proyecto está en riesgo. Se requiere intervención gerencial inmediata.',
        percentageUsed: status.percentageUsed,
      });
    }

    return alerts;
  }

  /**
   * Reseta el consumo de buffer (para recálculos)
   */
  async resetBufferConsumption(
    projectId: string,
  ): Promise<ProjectBuffer | null> {
    const buffer = await this.bufferModel.findOneAndUpdate(
      { projectId },
      { consumed: 0 },
      { new: true },
    );

    this.logger.log(`Buffer reseteado para proyecto: ${projectId}`);
    return buffer || null;
  }

  /**
   * Obtiene el histórico de consumo (para gráficos)
   */
  async getBufferHistory(
    projectId: string,
  ): Promise<Array<{ date: Date; consumed: number; percentageUsed: number }>> {
    // Nota: Esto requeriría una colección de histórico separada
    // Por ahora retornamos un valor simple
    const buffer = await this.bufferModel.findOne({ projectId });

    if (!buffer) {
      return [];
    }

    return [
      {
        date: buffer.createdAt || new Date(),
        consumed: buffer.consumed,
        percentageUsed: (buffer.consumed / buffer.projectBuffer) * 100,
      },
    ];
  }

  // ========== HELPERS ==========

  private createDefaultBuffer(projectId: string): ProjectBuffer {
    return {
      projectId,
      projectBuffer: 0,
      consumed: 0,
      threshold: 75,
      taskVariances: [],
    } as ProjectBuffer;
  }

  private getDefaultBufferStatus(): BufferStatus {
    return {
      total: 0,
      consumed: 0,
      remaining: 0,
      percentageUsed: 0,
      isAlert: false,
    };
  }

  private getBufferStatusFromDoc(buffer: ProjectBufferDocument): BufferStatus {
    const percentageUsed =
      buffer.projectBuffer > 0
        ? (buffer.consumed / buffer.projectBuffer) * 100
        : 0;

    return {
      total: Math.round(buffer.projectBuffer * 10) / 10,
      consumed: Math.round(buffer.consumed * 10) / 10,
      remaining: Math.max(
        0,
        Math.round((buffer.projectBuffer - buffer.consumed) * 10) / 10,
      ),
      percentageUsed: Math.round(percentageUsed * 100) / 100,
      isAlert: percentageUsed >= buffer.threshold,
    };
  }
}
