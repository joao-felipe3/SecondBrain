import { Types } from 'mongoose';
import { ProjectsCoreController } from '@src/projects/controllers/projects-core.controller';

describe('ProjectsCoreController', () => {
  let controller: ProjectsCoreController;
  let mockProjectsService: any;
  let mockTaskModel: any;

  const validProjId = new Types.ObjectId().toHexString();

  beforeEach(() => {
    mockProjectsService = {
      findOne: jest.fn().mockResolvedValue({ _id: validProjId, name: 'Proj 1', deadline: new Date() }),
      findAll: jest.fn().mockResolvedValue([{ _id: validProjId, name: 'Proj 1' }]),
      create: jest.fn().mockResolvedValue({ _id: validProjId }),
      update: jest.fn().mockResolvedValue({ _id: validProjId }),
      remove: jest.fn().mockResolvedValue(true),
      removeWithOptions: jest.fn().mockResolvedValue({ deleted: true, tasksAffected: 3 }),
      getTasksForProject: jest.fn().mockResolvedValue([]),
      incrementHoursWorked: jest.fn().mockResolvedValue({ _id: validProjId }),
      recalculateProjectStats: jest.fn().mockResolvedValue({ _id: validProjId }),
    };

    mockTaskModel = {
      find: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([{ name: 'MicroTask 1' }]),
        }),
      }),
    };

    controller = new ProjectsCoreController(mockProjectsService, mockTaskModel);
  });

  it('should create, list, and find project', async () => {
    const created = await controller.create({ name: 'Proj 1' });
    expect(created._id).toBe(validProjId);

    const all = await controller.findAll();
    expect(all.length).toBe(1);

    const one = await controller.findOne(validProjId);
    expect(one._id).toBe(validProjId);
  });

  it('should update and remove project', async () => {
    const updated = await controller.update(validProjId, { name: 'Proj 2' });
    expect(updated?._id).toBe(validProjId);

    const removed = await controller.remove(validProjId, 'true');
    expect(removed.tasksDeleted).toBe(true);
  });

  it('should recalculate stats for all projects', async () => {
    const res = await controller.recalculateAllStats();
    expect(res.count).toBe(1);
  });

  it('should fetch tasks and micro-tasks', async () => {
    const tasks = await controller.getTasksForProject(validProjId);
    expect(tasks).toEqual([]);

    const micro = await controller.getMicroTasks(validProjId, 'todo');
    expect(micro.length).toBe(1);
  });
});
