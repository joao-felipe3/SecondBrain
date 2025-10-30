import { Injectable, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateTaskDto } from './dto/create-task.dto';
import { TaskDocument } from './schemas/task.schema';
import { ProjectDocument } from '../projects/schemas/project.schema';
import { ProjectsService } from '../projects/projects.service';

@Injectable()
export class TasksService {
  constructor(
    @InjectModel('Task') private readonly taskModel: Model<TaskDocument>,
    @InjectModel('Project') private readonly projectModel: Model<ProjectDocument>,
    @Inject(forwardRef(() => ProjectsService))
    private readonly projectsService: ProjectsService,
  ) {}

  async create(createTaskDto: CreateTaskDto): Promise<TaskDocument> {
    if (createTaskDto.project && typeof createTaskDto.project === 'string') {
      const value = createTaskDto.project as string;
      // tenta como ObjectId primeiro
      const isObjectId = /^[a-f\d]{24}$/i.test(value);
      let projectDoc: ProjectDocument | null = null;
      if (isObjectId) {
        projectDoc = await this.projectModel.findById(value).exec();
      }
      // se não achou por id, tenta por nome
      if (!projectDoc) {
        projectDoc = await this.projectModel.findOne({ name: value }).exec();
      }
      if (!projectDoc) {
        throw new NotFoundException(`Project not found by id or name '${value}'`);
      }
      createTaskDto.project = projectDoc._id as import('mongoose').Types.ObjectId;
    }
    const createdTask = new this.taskModel(createTaskDto);
    return await createdTask.save();
  }

  async findAll(): Promise<TaskDocument[]> {
    return await this.taskModel.find().exec();
  }

  async findOne(id: string): Promise<TaskDocument | null> {
    return await this.taskModel.findById(id).exec();
  }

  async update(id: string, updateTaskDto: Partial<CreateTaskDto>): Promise<TaskDocument | null> {
    if (updateTaskDto.project && typeof updateTaskDto.project === 'string') {
      const value = updateTaskDto.project as string;
      const isObjectId = /^[a-f\d]{24}$/i.test(value);
      let projectDoc: ProjectDocument | null = null;
      if (isObjectId) {
        projectDoc = await this.projectModel.findById(value).exec();
      }
      if (!projectDoc) {
        projectDoc = await this.projectModel.findOne({ name: value }).exec();
      }
      if (!projectDoc) {
        throw new NotFoundException(`Project not found by id or name '${value}'`);
      }
      updateTaskDto.project = projectDoc._id as import('mongoose').Types.ObjectId;
    }
    return await this.taskModel.findByIdAndUpdate(id, updateTaskDto, { new: true }).exec();
  }

  async remove(id: string): Promise<boolean> {
    const result = await this.taskModel.findByIdAndDelete(id).exec();
    return result !== null;
  }

  async markAsConcluded(id: string): Promise<TaskDocument> {
    const updatedTask = await this.taskModel.findByIdAndUpdate(
      id,
      { isConcluded: true },
      { new: true }
    ).exec();

    if (!updatedTask) {
      throw new NotFoundException(`Task with id ${id} not found`);
    }

    return updatedTask;
  }

  async incrementPomodorosDid(id: string): Promise<TaskDocument> {
    const task = await this.taskModel.findById(id).exec();

    if (!task) {
      throw new NotFoundException(`Task with id ${id} not found`);
    }

    if (task.pomodorosDid === undefined || task.pomodorosDid === null) {
      task.pomodorosDid = 0;
    }

    task.pomodorosDid += 1;
    const updatedTask = await task.save();

    // If task is associated with a project, increment totalHoursWorked
    // Each pomodoro = 0.5 hours
    if (task.project) {
      const projectId = task.project.toString();
      await this.projectsService.incrementHoursWorked(projectId, 0.5);
    }

    return updatedTask;
  }

}
