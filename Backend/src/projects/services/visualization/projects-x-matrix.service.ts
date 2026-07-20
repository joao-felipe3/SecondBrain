import { InjectModel } from '@nestjs/mongoose';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Model, Types, FilterQuery } from 'mongoose';
import { TaskDocument } from '../../../tasks/schemas/task.schema';
import { ProjectDocument } from '../../schemas/project.schema';
import { ProjectWave, type ProjectWaveDocument } from '../../schemas/project-wave.schema';
import { CreateXMatrixDto, type XMatrixResponseDto } from '../../dto/x-matrix.dto';
import { XMatrixSnapshot, type XMatrixSnapshotDocument } from '../../schemas/x-matrix-snapshot.schema';
import { generateXMatrixData } from './utils/x-matrix-helpers.util';

@Injectable()
export class ProjectsXMatrixService {
  constructor(
    @InjectModel('Project')
    private readonly projectModel: Model<ProjectDocument>,
    @InjectModel('Task') private readonly taskModel: Model<TaskDocument>,
    @InjectModel(ProjectWave.name)
    private readonly waveModel: Model<ProjectWaveDocument>,
    @InjectModel(XMatrixSnapshot.name)
    private readonly xMatrixSnapshotModel: Model<XMatrixSnapshotDocument>,
  ) {}

  async createXMatrix(projectId: string, dto: CreateXMatrixDto): Promise<XMatrixResponseDto> {
    const project = await this.validateAndGetProject(projectId);
    const { tasks, waves } = await this.fetchTasksAndWaves(projectId, dto);

    const matrixData = generateXMatrixData({ project, tasks, waves, dto });

    const response: XMatrixResponseDto = {
      projectId,
      projectName: project.name || 'Projeto',
      ...matrixData,
    };

    await this.xMatrixSnapshotModel
      .updateOne(
        { projectId: new Types.ObjectId(projectId) },
        { $set: { data: response } },
        { upsert: true },
      )
      .exec();

    return response;
  }

  private async validateAndGetProject(projectId: string): Promise<ProjectDocument> {
    if (
      !projectId ||
      projectId === 'null' ||
      projectId === 'undefined' ||
      !Types.ObjectId.isValid(projectId)
    ) {
      throw new BadRequestException(`ID invalido: ${projectId}`);
    }

    const project = await this.projectModel.findById(projectId).exec();
    if (!project) throw new NotFoundException('Project not found');

    return project;
  }

  private async fetchTasksAndWaves(
    projectId: string,
    dto: CreateXMatrixDto,
  ): Promise<{ tasks: TaskDocument[]; waves: ProjectWaveDocument[] }> {
    const includeCompleted = dto?.includeCompleted ?? true;
    const taskQuery: FilterQuery<TaskDocument> = { project: projectId };

    if (!includeCompleted) {
      taskQuery.isConcluded = { $ne: true };
    }
    if (dto?.taskIds?.length) {
      taskQuery._id = {
        $in: dto.taskIds.filter((id) => Types.ObjectId.isValid(id)).map((id) => new Types.ObjectId(id)),
      };
    }

    const [tasks, waves] = await Promise.all([
      this.taskModel.find(taskQuery).exec(),
      this.waveModel
        .find({ projectId: new Types.ObjectId(projectId) })
        .sort({ waveNumber: 1 })
        .exec(),
    ]);

    return { tasks, waves };
  }

  async getSavedXMatrix(projectId: string): Promise<XMatrixResponseDto | null> {
    if (
      !projectId ||
      projectId === 'null' ||
      projectId === 'undefined' ||
      !Types.ObjectId.isValid(projectId)
    ) {
      throw new BadRequestException(`ID invalido: ${projectId}`);
    }

    const project = await this.projectModel.findById(projectId).exec();
    if (!project) throw new NotFoundException('Project not found');

    const snapshot = await this.xMatrixSnapshotModel
      .findOne({ projectId: new Types.ObjectId(projectId) })
      .exec();

    if (snapshot?.data) return snapshot.data as XMatrixResponseDto;

    const legacySnapshot = (project as ProjectDocument & { xMatrixSnapshot?: XMatrixResponseDto })
      .xMatrixSnapshot;
    if (legacySnapshot) {
      await this.xMatrixSnapshotModel
        .updateOne(
          { projectId: new Types.ObjectId(projectId) },
          { $set: { data: legacySnapshot } },
          { upsert: true },
        )
        .exec();

      await this.projectModel.updateOne({ _id: projectId }, { $unset: { xMatrixSnapshot: '' } }).exec();

      return legacySnapshot;
    }

    return null;
  }
}
