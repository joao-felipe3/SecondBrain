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

interface BufferCalculationResult {
  criticalPathDuration: number;
  totalVariance: number;
  standardDeviation: number;
  projectBuffer: number;
}

@Injectable()
export class BufferService {
  private readonly logger = new Logger(BufferService.name);

  constructor(
    @InjectModel(ProjectBuffer.name)
    private readonly bufferModel: Model<ProjectBufferDocument>,
  ) {}

  async calculateProjectBuffer(
    projectId: string,
    tasks: BufferTaskMetrics[],
    criticalPath: string[],
  ): Promise<ProjectBuffer | null> {
    this.logger.log(
      `Calculating buffer for project: ${projectId}, critical tasks: ${criticalPath.length}`,
    );

    if (!criticalPath.length) {
      this.logger.warn(`Project ${projectId} has no critical tasks.`);
      return this.createDefaultBuffer(projectId);
    }

    const criticalTasks = filterCriticalTasks(tasks, criticalPath);
    const calculationResult = this.performBufferCalculation(criticalTasks);

    const bufferDoc = await this.updateOrCreateBuffer(projectId, calculationResult, criticalTasks);

    if (!bufferDoc) {
      this.logger.error(`Failed to create/update buffer for project ${projectId}`);
      return null;
    }

    this.logBufferCalculationResult(bufferDoc, calculationResult.totalVariance);

    return bufferDoc;
  }

  async consumeBuffer(projectId: string, hoursUsed: number): Promise<BufferStatus> {
    this.logger.log(`Consuming ${hoursUsed}h of buffer for project: ${projectId}`);

    const buffer = await this.bufferModel.findOneAndUpdate(
      { projectId },
      { $inc: { consumed: hoursUsed } },
      { new: true },
    );

    if (!buffer) {
      this.logger.warn(`Buffer not found for project: ${projectId}`);
      return getDefaultBufferStatus();
    }

    const status = this.getBufferStatusFromBuffer(buffer);
    this.logBufferConsumptionStatus(status, buffer.threshold);

    return status;
  }

  async resetBufferConsumption(projectId: string): Promise<ProjectBuffer | null> {
    this.logger.log(`Resetting buffer consumption for project: ${projectId}`);
    const buffer = await this.bufferModel.findOneAndUpdate(
      { projectId },
      { consumed: 0 },
      { new: true },
    );
    return buffer || null;
  }

  async getBufferStatus(projectId: string): Promise<BufferStatus> {
    const buffer = await this.bufferModel.findOne({ projectId });

    if (!buffer) {
      this.logger.warn(`Buffer not found for project: ${projectId}`);
      return getDefaultBufferStatus();
    }

    return this.getBufferStatusFromBuffer(buffer);
  }

  async checkBufferHealth(projectId: string): Promise<BufferAlert[]> {
    const buffer = await this.bufferModel.findOne({ projectId });

    if (!buffer) {
      this.logger.warn(`Buffer not found for project: ${projectId}`);
      return [];
    }

    const status = this.getBufferStatusFromBuffer(buffer);
    return generateBufferAlerts(status.percentageUsed);
  }

  async getBufferHistory(
    projectId: string,
  ): Promise<Array<{ date: Date; consumed: number; percentageUsed: number }>> {
    const buffer = await this.bufferModel.findOne({ projectId });

    if (!buffer) {
      this.logger.warn(`Buffer not found for project: ${projectId}`);
      return [];
    }

    return [
      {
        date: buffer.createdAt || new Date(),
        consumed: buffer.consumed,
        percentageUsed: this.calculatePercentageUsed(buffer.projectBuffer, buffer.consumed),
      },
    ];
  }

  private performBufferCalculation(criticalTasks: BufferTaskMetrics[]): BufferCalculationResult {
    return calculateMetrics(criticalTasks);
  }

  private async updateOrCreateBuffer(
    projectId: string,
    calculationResult: BufferCalculationResult,
    criticalTasks: BufferTaskMetrics[],
  ): Promise<ProjectBufferDocument | null> {
    const { criticalPathDuration, totalVariance, standardDeviation, projectBuffer } = calculationResult;

    const bufferData = {
      projectId,
      projectBuffer: this.roundToOneDecimal(projectBuffer),
      consumed: 0,
      threshold: 75,
      criticalPathDuration: this.roundToOneDecimal(criticalPathDuration),
      totalVariance: this.roundToTwoDecimals(totalVariance),
      standardDeviation: this.roundToOneDecimal(standardDeviation),
      taskVariances: mapTaskVariances(criticalTasks),
    };

    return this.bufferModel.findOneAndUpdate({ projectId }, bufferData, { upsert: true, new: true });
  }

  private logBufferCalculationResult(bufferDoc: ProjectBufferDocument, totalVariance: number): void {
    this.logger.log(
      `Buffer calculated: ${bufferDoc.projectBuffer}h (Total Variance: ${totalVariance.toFixed(2)})`,
    );
  }

  private getBufferStatusFromBuffer(buffer: ProjectBufferDocument): BufferStatus {
    return calculateBufferStatus(buffer.projectBuffer, buffer.consumed, buffer.threshold);
  }

  private logBufferConsumptionStatus(status: BufferStatus, threshold: number): void {
    if (status.isAlert) {
      this.logger.warn(`⚠️ Buffer alert: ${status.percentageUsed}% consumed (threshold: ${threshold}%)`);
    }
  }

  private calculatePercentageUsed(projectBuffer: number, consumed: number): number {
    if (projectBuffer <= 0) return 0;
    return (consumed / projectBuffer) * 100;
  }

  private roundToOneDecimal(value: number): number {
    return Math.round(value * 10) / 10;
  }

  private roundToTwoDecimals(value: number): number {
    return Math.round(value * 100) / 100;
  }

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
