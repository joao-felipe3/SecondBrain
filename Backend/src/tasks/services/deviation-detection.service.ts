import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { TaskDocument } from '../schemas/task.schema';

export interface DeviationResult {
  isDeviated: boolean;
  percentOver: number;
  actualMinutes: number;
  expectedMinutes: number;
  message?: string;
  recommendation?: string;
}

@Injectable()
export class DeviationDetectionService {
  constructor(
    @InjectModel('Task') private readonly taskModel: Model<TaskDocument>,
  ) {}

  private getActualMinutes(task: TaskDocument): number {
    const pomodorosDid = Math.max(0, Number(task.pomodorosDid || 0));
    return pomodorosDid * 30;
  }

  async checkTimeDeviation(taskId: string): Promise<DeviationResult> {
    const task = await this.taskModel.findById(taskId).exec();
    if (!task) {
      throw new NotFoundException(`Task with id ${taskId} not found`);
    }

    const expectedMinutes = Number(task.pertExpectedMinutes || 0);
    const actualMinutes = this.getActualMinutes(task);

    if (!Number.isFinite(expectedMinutes) || expectedMinutes <= 0) {
      return {
        isDeviated: false,
        percentOver: 0,
        actualMinutes,
        expectedMinutes: 0,
        message: 'Missing PERT expected time',
      };
    }

    const percentOver = ((actualMinutes - expectedMinutes) / expectedMinutes) * 100;
    const isDeviated = percentOver >= 25;

    if (!isDeviated) {
      return {
        isDeviated,
        percentOver: Math.max(0, percentOver),
        actualMinutes,
        expectedMinutes,
      };
    }

    return {
      isDeviated,
      percentOver,
      actualMinutes,
      expectedMinutes,
      message: `Actual time exceeded estimate by ${Math.round(percentOver)}%`,
      recommendation: 'Consider adjusting estimates or splitting the task.',
    };
  }

  async generateDeviationAlert(taskId: string): Promise<DeviationResult | null> {
    const result = await this.checkTimeDeviation(taskId);
    if (!result.isDeviated) {
      return null;
    }
    return result;
  }
}
