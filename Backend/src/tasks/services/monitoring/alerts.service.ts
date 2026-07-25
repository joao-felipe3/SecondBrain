import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, FilterQuery } from 'mongoose';
import { TaskAlertDocument } from '../../schemas/task-alert.schema';

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
    @InjectModel('TaskAlert')
    private readonly alertModel: Model<TaskAlertDocument>,
  ) {}

  // ===========================================================================
  // 1. Alert Lifecycle Operations
  // ===========================================================================

  async createAlert(input: CreateAlertInput): Promise<TaskAlertDocument> {
    const payload = {
      userId: input.userId,
      task: input.taskId ? new Types.ObjectId(input.taskId.toString()) : undefined,
      project: input.projectId ? new Types.ObjectId(input.projectId.toString()) : undefined,
      type: input.type,
      message: input.message,
      recommendation: input.recommendation,
      createdAt: new Date(),
      isRead: false,
    };

    return this.alertModel.create(payload);
  }

  async listAlerts(options?: {
    userId?: string;
    unreadOnly?: boolean;
    projectId?: string;
    limit?: number;
  }): Promise<TaskAlertDocument[]> {
    const query: FilterQuery<TaskAlertDocument> = {};

    if (options?.userId) query.userId = String(options.userId);

    if (options?.projectId) query.project = String(options.projectId);

    if (options?.unreadOnly) query.isRead = false;

    const limit = Number.isFinite(options?.limit) ? Number(options?.limit) : 50;

    const alerts = await this.alertModel
      .find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .hint({ userId: 1, isRead: 1, createdAt: -1 })
      .exec();

    return alerts;
  }

  async markRead(id: string, userId?: string): Promise<TaskAlertDocument | null> {
    const query: FilterQuery<TaskAlertDocument> = { _id: String(id) };
    if (userId) {
      query.userId = String(userId);
    }

    return this.alertModel.findOneAndUpdate(query, { isRead: true }, { new: true }).exec();
  }
}
