import { Types } from 'mongoose';
import { MongooseTaskRepository } from '@src/tasks/repositories/mongoose-task.repository';
import { Task } from '@src/tasks/entities/task.entity';

describe('MongooseTaskRepository', () => {
  let repository: MongooseTaskRepository;
  let mockTaskModel: any;

  const validId = new Types.ObjectId().toHexString();

  beforeEach(() => {
    mockTaskModel = {
      find: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue([{ _id: new Types.ObjectId(), name: 'Task 1' }]),
      }),
      findById: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({ _id: new Types.ObjectId(), name: 'Task 1' }),
      }),
      findByIdAndUpdate: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({ _id: new Types.ObjectId(), name: 'Updated' }),
      }),
      create: jest.fn().mockResolvedValue({ _id: new Types.ObjectId(), name: 'Created' }),
      deleteOne: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({ deletedCount: 1 }),
      }),
    };

    repository = new MongooseTaskRepository(mockTaskModel);
  });

  it('findAll: should return array of Task domain entities', async () => {
    const tasks = await repository.findAll();
    expect(tasks.length).toBe(1);
    expect(tasks[0].name).toBe('Task 1');
  });

  it('findById: should return Task domain entity or null', async () => {
    const task = await repository.findById(validId);
    expect(task).not.toBeNull();

    const invalid = await repository.findById('invalid-id');
    expect(invalid).toBeNull();
  });

  it('findByProjectId: should find by project id and options', async () => {
    const tasks = await repository.findByProjectId(validId, {
      taskIds: [validId],
      parentWbsNodeId: 'node1',
    });
    expect(tasks.length).toBe(1);

    await expect(repository.findByProjectId('null')).rejects.toThrow();
  });

  it('save & delete: should create/update and delete task', async () => {
    const newTask = new Task();
    newTask.name = 'New Task';

    const created = await repository.save(newTask);
    expect(created).toBeDefined();

    newTask.id = validId;
    const updated = await repository.save(newTask);
    expect(updated).toBeDefined();

    await repository.delete(validId);
    expect(mockTaskModel.deleteOne).toHaveBeenCalled();
  });
});
