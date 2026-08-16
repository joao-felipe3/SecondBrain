import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ProjectDocument } from '../../schemas/project.schema';
import { TaskDocument } from '../../../tasks/schemas/task.schema';

@Injectable()
export class ProjectStatsService {
  constructor(
    @InjectModel('Project')
    private readonly projectModel: Model<ProjectDocument>,
    @InjectModel('Task')
    private readonly taskModel: Model<TaskDocument>,
  ) {}

  async incrementHoursWorked(id: string, hours: number): Promise<ProjectDocument> {
    const project = await this.projectModel.findById(id);
    if (!project) {
      throw new NotFoundException(`Project with id ${id} not found`);
    }
    project.totalHoursWorked = (project.totalHoursWorked || 0) + hours;
    if (project.plannedHours > 0) {
      const pct = (project.totalHoursWorked / project.plannedHours) * 100;
      project.progressPercentage = Math.min(100, +pct.toFixed(2));
    }
    return await project.save();
  }

  async recalculateProjectStats(projectId: string): Promise<ProjectDocument | null> {
    if (
      !projectId ||
      projectId === 'null' ||
      projectId === 'undefined' ||
      !Types.ObjectId.isValid(projectId)
    ) {
      const sanitizedProjectId = String(projectId).replace(/[\r\n]/g, '');
      console.warn(`recalculateProjectStats: ID inválido ignorado: ${sanitizedProjectId}`);
      return null;
    }

    const project = await this.projectModel.findById(projectId).exec();
    if (!project) {
      return null;
    }

    const tasks = await this.taskModel.find({ project: projectId }).exec();

    const plannedHours = tasks.reduce((sum, task) => {
      const pomodoros = task.pomodorosPlanned || 0;
      return sum + pomodoros * 0.5;
    }, 0);

    const experience = tasks.reduce((sum, task) => {
      return sum + (task.experience || 0);
    }, 0);

    const reward = tasks.reduce((sum, task) => {
      return sum + (task.prize || 0);
    }, 0);

    project.plannedHours = plannedHours;
    project.experience = experience;
    project.reward = reward;

    if (project.plannedHours > 0) {
      const pct = (project.totalHoursWorked / project.plannedHours) * 100;
      project.progressPercentage = Math.min(100, +pct.toFixed(2));
    } else {
      project.progressPercentage = 0;
    }

    return await project.save();
  }
}
