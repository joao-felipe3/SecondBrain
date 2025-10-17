import { Injectable, NotFoundException  } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateTaskDto } from './dto/create-task.dto';
import { TaskDocument } from './schemas/task.schema';
import { ProjectDocument } from '../projects/schemas/project.schema';

@Injectable()
export class TasksService {
  constructor(
    @InjectModel('Task') private readonly taskModel: Model<TaskDocument>,
    @InjectModel('Project') private readonly projectModel: Model<ProjectDocument>,
  ) {}

  async create(createTaskDto: CreateTaskDto): Promise<TaskDocument> {
    if (createTaskDto.project && typeof createTaskDto.project === 'string') {
      const projectDoc = await this.projectModel.findOne({ name: createTaskDto.project }).exec();
      if (projectDoc) {
        createTaskDto.project = projectDoc._id as import('mongoose').Types.ObjectId;
      } else {
        throw new NotFoundException(`Project with name '${createTaskDto.project}' not found`);
      }
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
      const projectDoc = await this.projectModel.findOne({ name: updateTaskDto.project }).exec();
      if (projectDoc) {
        updateTaskDto.project = projectDoc._id as import('mongoose').Types.ObjectId;
      } else {
        throw new NotFoundException(`Project with name '${updateTaskDto.project}' not found`);
      }
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
    return await task.save();
  }

}
