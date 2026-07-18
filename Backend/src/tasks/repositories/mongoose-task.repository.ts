import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, FilterQuery } from 'mongoose';
import { TaskRepository } from '../interfaces/task-repository.interface';
import { TaskDocument } from '../schemas/task.schema';
import { Task } from '../entities/task.entity';
import { TaskMapper } from '../mappers/task.mapper';
import { FindByProjectIdOptionsDto } from '../dto/query/find-by-project-id-options.dto';

@Injectable()
export class MongooseTaskRepository implements TaskRepository {
  constructor(@InjectModel('Task') private readonly taskModel: Model<TaskDocument>) {}

  async findAll(): Promise<Task[]> {
    const docs = await this.taskModel.find().exec();
    return docs.map((doc) => TaskMapper.toDomain(doc));
  }

  async findById(id: string): Promise<Task | null> {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }
    const doc = await this.taskModel.findById(id).exec();
    return doc ? TaskMapper.toDomain(doc) : null;
  }

  async findByProjectId(projectId: string, opts?: FindByProjectIdOptionsDto): Promise<Task[]> {
    if (!projectId || projectId === 'null' || projectId === 'undefined') {
      throw new BadRequestException(`Project ID inválido: ${projectId}`);
    }

    const query: FilterQuery<TaskDocument> & { parentWbsNodeId?: string } = {};
    if (Types.ObjectId.isValid(projectId)) {
      query.project = new Types.ObjectId(projectId);
    }

    const taskIds = Array.isArray(opts?.taskIds) ? opts.taskIds : [];
    if (taskIds.length > 0) {
      const validIds = taskIds.filter((id) => Types.ObjectId.isValid(id));
      if (validIds.length > 0) {
        const validObjectIds = validIds.map((id) => new Types.ObjectId(id));
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        query._id = { $in: validObjectIds } as any;
      }
    }

    if (opts?.parentWbsNodeId) {
      query.parentWbsNodeId = String(opts.parentWbsNodeId);
    }

    const docs = await this.taskModel.find(query).exec();
    return docs.map((doc) => TaskMapper.toDomain(doc));
  }

  async save(task: Task): Promise<Task> {
    const persistenceData = TaskMapper.toPersistence(task);
    let doc: TaskDocument | null;
    if (task.id) {
      doc = await this.taskModel.findByIdAndUpdate(task.id, persistenceData, { new: true }).exec();
      if (!doc) {
        throw new BadRequestException(`Tarefa com ID ${task.id} não encontrada para atualização`);
      }
    } else {
      doc = await this.taskModel.create(persistenceData);
    }
    return TaskMapper.toDomain(doc);
  }

  async delete(id: string): Promise<void> {
    if (Types.ObjectId.isValid(id)) {
      await this.taskModel.deleteOne({ _id: id }).exec();
    }
  }
}
