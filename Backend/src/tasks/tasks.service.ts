import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateTaskDto } from './dto/create-task.dto';
import { Task } from './entities/task.entity';

@Injectable()
export class TasksService {
  constructor(
    @InjectModel('Task') private readonly taskModel: Model<Task>
  ) {}

  async create(createTaskDto: CreateTaskDto): Promise<Task> {
    const createdTask = new this.taskModel(createTaskDto);
    return await createdTask.save();
  }

  async findAll(): Promise<Task[]> {
    return await this.taskModel.find().exec();
  }

  async findOne(id: string): Promise<Task | null> {
    return await this.taskModel.findById(id).exec();
  }

  async update(id: string, updateTaskDto: Partial<CreateTaskDto>): Promise<Task | null> {
    return await this.taskModel.findByIdAndUpdate(id, updateTaskDto, { new: true }).exec();
  }


  async remove(id: string): Promise<boolean> {
    const result = await this.taskModel.findByIdAndDelete(id).exec();
    return result !== null;
  }
}
