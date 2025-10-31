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
    
    // Calculate reward and experience automatically based on priority and difficulty
    const priority = createTaskDto.priority || 0;
    const difficult = createTaskDto.difficult || 0;
    createTaskDto.prize = priority * 5 + difficult * 2;
    createTaskDto.experience = priority * 2 + difficult * 5;
    
    const createdTask = new this.taskModel(createTaskDto);
    const savedTask = await createdTask.save();
    
    // Recalculate project stats after creating task
    if (savedTask.project) {
      await this.projectsService.recalculateProjectStats(savedTask.project.toString());
    }
    
    return savedTask;
  }

  async findAll(): Promise<TaskDocument[]> {
    return await this.taskModel.find().exec();
  }

  async findOne(id: string): Promise<TaskDocument | null> {
    return await this.taskModel.findById(id).exec();
  }

  async update(id: string, updateTaskDto: Partial<CreateTaskDto>): Promise<TaskDocument | null> {
    const oldTask = await this.taskModel.findById(id).exec();
    const oldProjectId = oldTask?.project?.toString();
    
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
    
    // Recalculate reward and experience if priority or difficulty changed
    if (updateTaskDto.priority !== undefined || updateTaskDto.difficult !== undefined) {
      const priority = updateTaskDto.priority !== undefined ? updateTaskDto.priority : (oldTask?.priority || 0);
      const difficult = updateTaskDto.difficult !== undefined ? updateTaskDto.difficult : (oldTask?.difficult || 0);
      updateTaskDto.prize = priority * 5 + difficult * 2;
      updateTaskDto.experience = priority * 2 + difficult * 5;
    }
    
    const updatedTask = await this.taskModel.findByIdAndUpdate(id, updateTaskDto, { new: true }).exec();
    
    // Recalculate project stats after updating task
    if (updatedTask) {
      const newProjectId = updatedTask.project?.toString();
      
      // If project changed, recalculate both old and new projects
      if (oldProjectId && oldProjectId !== newProjectId) {
        await this.projectsService.recalculateProjectStats(oldProjectId);
      }
      if (newProjectId) {
        await this.projectsService.recalculateProjectStats(newProjectId);
      }
    }
    
    return updatedTask;
  }

  async remove(id: string): Promise<boolean> {
    const task = await this.taskModel.findById(id).exec();
    const projectId = task?.project?.toString();
    
    const result = await this.taskModel.findByIdAndDelete(id).exec();
    
    // Recalculate project stats after removing task
    if (result && projectId) {
      await this.projectsService.recalculateProjectStats(projectId);
    }
    
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
