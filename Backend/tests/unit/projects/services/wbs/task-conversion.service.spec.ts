import { Test, TestingModule } from '@nestjs/testing';
import { TaskConversionService } from '../../../../../src/projects/services/wbs/conversion/task-conversion.service';
import { TaskConversionHelperService } from '../../../../../src/projects/services/wbs/conversion/task-conversion-helper.service';

describe('TaskConversionService', () => {
  let service: TaskConversionService;
  let helperMock: any;

  beforeEach(async () => {
    helperMock = {
      generateTasksForLeafNode: jest
        .fn()
        .mockResolvedValue([{ name: 'Micro-tarefa 1', pomodorosPlanned: 2 }]),
      createAndSaveLeaveTasks: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [TaskConversionService, { provide: TaskConversionHelperService, useValue: helperMock }],
    }).compile();

    service = module.get<TaskConversionService>(TaskConversionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('convertWBSToTasks', () => {
    it('deve converter nós folhas de WBS em tarefas simples (modo legado)', () => {
      const nodes: any[] = [
        { name: 'Fase 1', children: [{ name: 'Pacote 1.1', estimatedHours: 10, children: [] }] },
      ];

      const result = service.convertWBSToTasks(nodes, 'p-1');
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].name).toContain('Pacote 1.1');
    });
  });

  describe('convertWBSToTasksWithAI', () => {
    it('deve converter WBS em tarefas com enriquecimento de IA', async () => {
      const p: any = {
        nodes: [
          { name: 'Fase 1', children: [{ name: 'Pacote 1.1', estimatedHours: 10, children: [] }] },
        ],
        projectId: 'p-1',
        project: { name: 'Projeto' },
        tasksService: {
          createMany: jest.fn().mockResolvedValue([{ id: 't-1' }]),
          findByProjectId: jest.fn().mockResolvedValue([]),
        },
        options: { autoResolveDiscrepancies: true },
      };

      const result = await service.convertWBSToTasksWithAI(p);
      expect(result).toBeDefined();
      expect(helperMock.generateTasksForLeafNode).toHaveBeenCalled();
    });
  });
});
