import { InjectModel } from '@nestjs/mongoose';
import { TaskDocument } from '../tasks/schemas/task.schema';
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Model, Types } from 'mongoose';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectDocument } from './schemas/project.schema';
import type { GanttDataResponse } from './dto/gantt.dto';
import type { PertDiagramDataResponse } from './dto/pert-diagram.dto';
import type { CreateXMatrixDto, XMatrixResponseDto } from './dto/x-matrix.dto';
import { ProjectsXMatrixService } from './services/strategy';
import { GanttService, PertDiagramService } from './services/visualization';
import { ProjectStatsService } from './services/execution';

@Injectable()
export class ProjectsService {
  constructor(
    @InjectModel('Project')
    private readonly projectModel: Model<ProjectDocument>,
    @InjectModel('Task') private readonly taskModel: Model<TaskDocument>,
    private readonly xMatrixService: ProjectsXMatrixService,
    private readonly ganttService: GanttService,
    private readonly pertDiagramService: PertDiagramService,
    private readonly projectStatsService: ProjectStatsService,
  ) { }

  async createXMatrix(projectId: string, dto: CreateXMatrixDto): Promise<XMatrixResponseDto> {
    return this.xMatrixService.createXMatrix(projectId, dto);
  }

  async getSavedXMatrix(projectId: string): Promise<XMatrixResponseDto | null> {
    return this.xMatrixService.getSavedXMatrix(projectId);
  }

  async getGanttData(
    projectId: string,
    options?: { includeCompleted?: boolean },
  ): Promise<GanttDataResponse> {
    return this.ganttService.getGanttData(projectId, options);
  }

  async getPertDiagramData(
    projectId: string,
    options?: { includeCompleted?: boolean },
  ): Promise<PertDiagramDataResponse> {
    return this.pertDiagramService.getPertDiagramData(projectId, options);
  }

  async getTasksForProject(projectId: string): Promise<TaskDocument[]> {
    if (
      !projectId ||
      projectId === 'null' ||
      projectId === 'undefined' ||
      !Types.ObjectId.isValid(projectId)
    ) {
      throw new BadRequestException(`ID inválido: ${projectId}`);
    }
    return this.taskModel.find({ project: projectId }).exec();
  }

  async create(dto: CreateProjectDto): Promise<ProjectDocument> {
    const created = new this.projectModel(dto);
    return await created.save();
  }

  async findAll(): Promise<ProjectDocument[]> {
    return await this.projectModel.find().exec();
  }

  async findOne(id: string): Promise<ProjectDocument | null> {
    if (!id || id === 'null' || id === 'undefined' || !Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`ID inválido: ${id}`);
    }
    return await this.projectModel.findById(id).exec();
  }

  async update(id: string, dto: UpdateProjectDto): Promise<ProjectDocument | null> {
    if (!id || id === 'null' || id === 'undefined' || !Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`ID inválido: ${id}`);
    }
    return await this.projectModel.findByIdAndUpdate(id, dto, { new: true }).exec();
  }

  async remove(id: string): Promise<boolean> {
    if (!id || id === 'null' || id === 'undefined' || !Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`ID inválido: ${id}`);
    }
    const result = await this.projectModel.findByIdAndDelete(id).exec();
    return result !== null;
  }


  async removeWithOptions(
    id: string,
    deleteTasks: boolean,
  ): Promise<{ deleted: boolean; tasksAffected: number }> {
    if (!id || id === 'null' || id === 'undefined' || !Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`ID inválido: ${id}`);
    }

    const project = await this.projectModel.findById(id).exec();
    if (!project) return { deleted: false, tasksAffected: 0 };

    const tasks = await this.taskModel.find({ project: id }).exec();
    const tasksAffected = tasks.length;

    if (deleteTasks) {
      await this.taskModel.deleteMany({ project: id }).exec();
    } else {
      await this.taskModel.updateMany({ project: id }, { $unset: { project: '' } }).exec();
    }

    const result = await this.projectModel.findByIdAndDelete(id).exec();
    return { deleted: result !== null, tasksAffected };
  }

  async incrementHoursWorked(id: string, hours: number): Promise<ProjectDocument> {
    const project = await this.projectModel.findById(id).exec();
    if (!project) throw new NotFoundException('Project not found');
    project.totalHoursWorked = (project.totalHoursWorked || 0) + hours;
    // optionally recompute progress if plannedHours exists
    if (project.plannedHours) {
      const pct = (project.totalHoursWorked / project.plannedHours) * 100;
      project.progressPercentage = Math.min(100, +pct.toFixed(2));
    }
    return await project.save();
  }

  async addTaskToProject(projectId: string, taskId: string): Promise<void> {
    await this.projectModel
      .findByIdAndUpdate(projectId, { $addToSet: { tasks: taskId } }, { new: true })
      .exec();
  }

  async removeTaskFromProject(projectId: string, taskId: string): Promise<void> {
    await this.projectModel
      .findByIdAndUpdate(projectId, { $pull: { tasks: taskId } }, { new: true })
      .exec();
  }

  async moveTaskToProject(taskId: string, oldProjectId: string, newProjectId: string): Promise<void> {
    if (oldProjectId) {
      await this.removeTaskFromProject(oldProjectId, taskId);
      await this.recalculateProjectStats(oldProjectId);
    }
    await this.addTaskToProject(newProjectId, taskId);
    await this.recalculateProjectStats(newProjectId);
  }

  async recalculateProjectStats(projectId: string): Promise<ProjectDocument | null> {
    return this.projectStatsService.recalculateProjectStats(projectId);
  }
}
