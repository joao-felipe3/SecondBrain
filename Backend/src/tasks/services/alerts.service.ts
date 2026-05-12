import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { TaskAlertDocument } from '../schemas/task-alert.schema';

export interface CreateAlertInput {
  userId?: string | Types.ObjectId;
  taskId?: string | Types.ObjectId;
  projectId?: string | Types.ObjectId;
  type: 'warning' | 'error' | 'info';
  message: string;
  recommendation?: string;
}

@Injectable()
export class AlertsService {
  constructor(
    @InjectModel('TaskAlert') private readonly alertModel: Model<TaskAlertDocument>,
  ) {}

  async createAlert(input: CreateAlertInput): Promise<TaskAlertDocument> {
    const payload = {
      userId: input.userId,
      task: input.taskId,
      project: input.projectId,
      type: input.type,
      message: input.message,
      recommendation: input.recommendation,
      createdAt: new Date(),
      isRead: false,
    } as any;

    return this.alertModel.create(payload);
  }

  async listAlerts(options?: {
    userId?: string;
    unreadOnly?: boolean;
    projectId?: string;
    limit?: number;
  }): Promise<TaskAlertDocument[]> {
    const query: any = {};

    if (options?.userId) {
      query.userId = options.userId;
    }

    if (options?.projectId) {
      query.project = options.projectId;
    }

    if (options?.unreadOnly) {
      query.isRead = false;
    }

    const limit = Number.isFinite(options?.limit) ? Number(options?.limit) : 50;

    // Build index hint for optimized query (userId + isRead + createdAt)
    const alerts = await this.alertModel
      .find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .hint({ userId: 1, isRead: 1, createdAt: -1 })
      .exec();

    return alerts;
  }

  async markRead(id: string, userId?: string): Promise<TaskAlertDocument | null> {
    const query: any = { _id: id };
    if (userId) {
      query.userId = userId;
    }

    return this.alertModel.findOneAndUpdate(query, { isRead: true }, { new: true }).exec();
  }
}
