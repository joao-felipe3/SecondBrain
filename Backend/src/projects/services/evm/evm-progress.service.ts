import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ProjectProgress, ProjectProgressDocument } from '../../schemas/project-progress.schema';
import { ProjectDocument } from '../../schemas/project.schema';
import type {
  EVMDashboardManualVisibility,
  EVMDashboardPreferences,
  EVMDashboardPreferencesInput,
  RecordProgressParamsDto,
} from '../../dto/evm.dto';

@Injectable()
export class EVMProgressService {
  readonly defaultManualVisibility: EVMDashboardManualVisibility = {
    spi: true,
    plannedVsEarned: true,
    completedHours: true,
    consistency: true,
    planAdherence: true,
    trend: true,
    perceivedProgress: true,
    remainingHours: true,
  };

  constructor(
    @InjectModel(ProjectProgress.name)
    private readonly projectProgressModel: Model<ProjectProgressDocument>,
    @InjectModel('Project')
    private readonly projectModel: Model<ProjectDocument>,
  ) {}

  private assertValidObjectId(value: string, fieldName: string): void {
    if (!Types.ObjectId.isValid(value)) {
      throw new BadRequestException(`${fieldName} invalido`);
    }
  }

  async getDashboardPreferences(projectId: string): Promise<EVMDashboardPreferences> {
    this.assertValidObjectId(projectId, 'projectId');

    const project = await this.projectModel
      .findById(projectId)
      .select({ dashboardMetricPreferences: 1 })
      .lean()
      .exec();

    return this.normalizeDashboardPreferences((project as any)?.dashboardMetricPreferences);
  }

  async saveDashboardPreferences(
    projectId: string,
    input: EVMDashboardPreferencesInput | undefined,
  ): Promise<EVMDashboardPreferences> {
    this.assertValidObjectId(projectId, 'projectId');

    const current = await this.getDashboardPreferences(projectId);
    const normalizedInput = this.normalizeDashboardPreferences(input);

    const merged: EVMDashboardPreferences = {
      mode: normalizedInput.mode || current.mode,
      manualVisibility: {
        ...current.manualVisibility,
        ...normalizedInput.manualVisibility,
      },
    };

    await this.projectModel
      .findByIdAndUpdate(projectId, { $set: { dashboardMetricPreferences: merged } }, { new: true })
      .exec();

    return merged;
  }

  async recordProgress(dto: RecordProgressParamsDto): Promise<ProjectProgress> {
    const { projectId, completedHours, plannedValue, date, source, taskId } = dto;
    this.assertValidObjectId(projectId, 'projectId');
    if (taskId) {
      this.assertValidObjectId(taskId, 'taskId');
    }

    return this.projectProgressModel.create({
      projectId: new Types.ObjectId(projectId),
      date: date ? new Date(date) : new Date(),
      completedHours,
      plannedValue,
      source: source || 'manual',
      taskId: taskId ? new Types.ObjectId(taskId) : undefined,
    });
  }

  async getProgressEntries(projectId: string): Promise<ProjectProgress[]> {
    this.assertValidObjectId(projectId, 'projectId');

    return this.projectProgressModel
      .find({ projectId: new Types.ObjectId(projectId) })
      .sort({ date: 1, createdAt: 1 })
      .exec();
  }

  async deleteProgressEntry(projectId: string, entryId: string): Promise<boolean> {
    this.assertValidObjectId(projectId, 'projectId');
    this.assertValidObjectId(entryId, 'entryId');

    const result = await this.projectProgressModel
      .deleteOne({
        _id: new Types.ObjectId(entryId),
        projectId: new Types.ObjectId(projectId),
      })
      .exec();

    return result.deletedCount > 0;
  }

  normalizeDashboardPreferences(raw: any): EVMDashboardPreferences {
    const mode = raw?.mode === 'manual' ? 'manual' : 'auto';

    return {
      mode,
      manualVisibility: {
        ...this.defaultManualVisibility,
        ...(raw?.manualVisibility || {}),
      },
    };
  }
}
