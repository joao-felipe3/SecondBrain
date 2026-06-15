import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ProjectBuffer, ProjectBufferDocument } from '../../schemas/project-buffer.schema';
import { BufferTaskMetrics, BufferStatus, BufferAlert } from '../../interfaces';
import {
  filterCriticalTasks,
  calculateMetrics,
  mapTaskVariances,
  getDefaultBufferStatus,
  calculateBufferStatus,
  generateBufferAlerts,
} from './utils/buffer-analysis.utils';

@Injectable()
export class BufferService {
  private readonly logger = new Logger(BufferService.name);

  constructor(
    @InjectModel(ProjectBuffer.name)
    private readonly bufferModel: Model<ProjectBufferDocument>,
  ) { }

  // ===========================================================================
  // 1. Buffer Lifecycle Operations
  // ===========================================================================

  async calculateProjectBuffer(
    projectId: string,
    tasks: BufferTaskMetrics[],
    criticalPath: string[],
  ): Promise<ProjectBuffer | null> {
    this.logger.log(
      `Calculando buffer para projeto: ${projectId}, tarefas críticas: ${criticalPath.length}`,
    );

    if (!criticalPath.length) {
      this.logger.warn(`Projeto ${projectId} não tem tarefas críticas`);
      return this.createDefaultBuffer(projectId);
    }

    const criticalTasks = filterCriticalTasks(tasks, criticalPath);
    const { criticalPathDuration, totalVariance, standardDeviation, projectBuffer } =
      calculateMetrics(criticalTasks);

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
        taskVariances: mapTaskVariances(criticalTasks),
      },
      { upsert: true, new: true },
    );

    if (!bufferDoc) {
      this.logger.error(`Failed to create/update buffer for project ${projectId}`);
      return null;
    }

    this.logger.log(
      `Buffer calculado: ${bufferDoc.projectBuffer}h (Variância Total: ${totalVariance.toFixed(2)})`,
    );

    return bufferDoc;
  }

  async consumeBuffer(projectId: string, hoursUsed: number): Promise<BufferStatus> {
    this.logger.log(`Consumindo ${hoursUsed}h de buffer para o projeto: ${projectId}`);

    const buffer = await this.bufferModel.findOneAndUpdate(
      { projectId },
      { $inc: { consumed: hoursUsed } },
      { new: true },
    );

    if (!buffer) {
      this.logger.warn(`Buffer não encontrado para o projeto: ${projectId}`);
      return getDefaultBufferStatus();
    }

    const status = calculateBufferStatus(buffer.projectBuffer, buffer.consumed, buffer.threshold);

    if (status.isAlert) {
      this.logger.warn(
        `⚠️ Buffer em alerta: ${status.percentageUsed}% consumido (limite: ${buffer.threshold}%)`,
      );
    }

    return status;
  }

  async resetBufferConsumption(projectId: string): Promise<ProjectBuffer | null> {
    const buffer = await this.bufferModel.findOneAndUpdate(
      { projectId },
      { consumed: 0 },
      { new: true },
    );

    this.logger.log(`Buffer resetado para o projeto: ${projectId}`);
    return buffer || null;
  }

  // ===========================================================================
  // 2. Buffer Monitoring & Health
  // ===========================================================================

  async getBufferStatus(projectId: string): Promise<BufferStatus> {
    const buffer = await this.bufferModel.findOne({ projectId });

    if (!buffer) {
      this.logger.warn(`Buffer não encontrado para o projeto: ${projectId}`);
      return getDefaultBufferStatus();
    }

    return calculateBufferStatus(buffer.projectBuffer, buffer.consumed, buffer.threshold);
  }

  async checkBufferHealth(projectId: string): Promise<BufferAlert[]> {
    const buffer = await this.bufferModel.findOne({ projectId });

    if (!buffer) return [];

    const status = calculateBufferStatus(buffer.projectBuffer, buffer.consumed, buffer.threshold);
    return generateBufferAlerts(status.percentageUsed);
  }

  async getBufferHistory(
    projectId: string,
  ): Promise<Array<{ date: Date; consumed: number; percentageUsed: number }>> {
    const buffer = await this.bufferModel.findOne({ projectId });

    if (!buffer) return [];

    return [
      {
        date: buffer.createdAt || new Date(),
        consumed: buffer.consumed,
        percentageUsed: buffer.projectBuffer > 0 ? (buffer.consumed / buffer.projectBuffer) * 100 : 0,
      },
    ];
  }

  // ===========================================================================
  // 3. Private Helpers
  // ===========================================================================

  private createDefaultBuffer(projectId: string): ProjectBuffer {
    return {
      projectId,
      projectBuffer: 0,
      consumed: 0,
      threshold: 75,
      taskVariances: [],
    } as ProjectBuffer;
  }
}
