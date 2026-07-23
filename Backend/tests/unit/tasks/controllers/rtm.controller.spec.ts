import { Test, TestingModule } from '@nestjs/testing';
import { RTMController } from '../../../../src/tasks/controllers/rtm.controller';
import { RTMService } from '../../../../src/tasks/services/traceability';
import { TasksService } from '../../../../src/tasks/tasks.service';

describe('RTMController', () => {
  let controller: RTMController;
  let rtmServiceMock: any;
  let tasksServiceMock: any;

  beforeEach(async () => {
    rtmServiceMock = {
      generateRequirements: jest.fn().mockResolvedValue([
        { description: 'Req 1', type: 'functional' },
      ]),
      saveRequirements: jest.fn().mockResolvedValue([
        { _id: 'req-1', description: 'Req 1', type: 'functional' },
      ]),
      getRTMMatrix: jest.fn().mockResolvedValue({
        requirements: [{ id: 'req-1', description: 'Req 1' }],
        tasks: [{ id: 'task-1', name: 'Task 1' }],
        matrix: new Map(),
      }),
      mapRequirementToTask: jest.fn().mockResolvedValue({
        _id: 'req-1',
        traceableItems: ['task-1'],
      }),
      unmapRequirementFromTask: jest.fn().mockResolvedValue({
        _id: 'req-1',
        traceableItems: [],
      }),
      validateRTM: jest.fn().mockResolvedValue({
        isValid: true,
        coverage: 100,
        unmappedRequirements: [],
        risks: [],
      }),
      deleteRequirement: jest.fn().mockResolvedValue(true),
      autoMapRequirementsToTasks: jest.fn().mockResolvedValue({
        success: true,
        mappedCount: 1,
        createdRequirementsCount: 0,
        coverage: 100,
        validation: { isValid: true, coverage: 100, unmappedRequirements: [], risks: [] },
        timestamp: new Date().toISOString(),
      }),
      generateTasksForUnmappedRequirements: jest.fn().mockResolvedValue({
        success: true,
        createdTasksCount: 2,
        coverage: 100,
        validation: { isValid: true, coverage: 100, unmappedRequirements: [], risks: [] },
        timestamp: new Date().toISOString(),
      }),
    };

    tasksServiceMock = {
      findByProjectId: jest.fn().mockResolvedValue([
        { id: 'task-1', name: 'Task 1' },
      ]),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RTMController],
      providers: [
        { provide: RTMService, useValue: rtmServiceMock },
        { provide: TasksService, useValue: tasksServiceMock },
      ],
    }).compile();

    controller = module.get<RTMController>(RTMController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('autoGenerateRequirements', () => {
    it('deve gerar e salvar requisitos com sucesso', async () => {
      const body = { smartObjective: { objective: 'Aumentar vendas' } };
      const result = await controller.autoGenerateRequirements('p-1', body);

      expect(result.success).toBe(true);
      expect(result.count).toBe(1);
      expect(rtmServiceMock.generateRequirements).toHaveBeenCalledWith(body.smartObjective);
      expect(rtmServiceMock.saveRequirements).toHaveBeenCalledWith(
        'p-1',
        expect.arrayContaining([expect.objectContaining({ description: 'Req 1', type: 'functional' })]),
      );
    });

    it('deve retornar mensagem de aviso caso nenhum requisito seja gerado', async () => {
      rtmServiceMock.generateRequirements.mockResolvedValueOnce([]);

      const body = { smartObjective: { objective: 'Aumentar vendas' } };
      const result = await controller.autoGenerateRequirements('p-1', body);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Nenhum item da jornada foi gerado');
    });

    it('deve capturar erro e retornar formato estático de erro', async () => {
      rtmServiceMock.generateRequirements.mockRejectedValueOnce(new Error('IA indisponível'));

      const body = { smartObjective: { objective: 'Aumentar vendas' } };
      const result = await controller.autoGenerateRequirements('p-1', body);

      expect(result.success).toBe(false);
      expect(result.error).toBe('IA indisponível');
    });
  });

  describe('getRTMMatrix', () => {
    it('deve buscar a matriz RTM', async () => {
      const result = await controller.getRTMMatrix('p-1');

      expect(result.success).toBe(true);
      expect(tasksServiceMock.findByProjectId).toHaveBeenCalledWith('p-1');
      expect(rtmServiceMock.getRTMMatrix).toHaveBeenCalled();
    });
  });

  describe('mapRequirementToTask', () => {
    it('deve mapear requisito para tarefa', async () => {
      const body = { requirementId: 'req-1', taskId: 'task-1' };
      const result = await controller.mapRequirementToTask('p-1', body);

      expect(result.success).toBe(true);
      expect(rtmServiceMock.mapRequirementToTask).toHaveBeenCalledWith({
        projectId: 'p-1',
        requirementId: 'req-1',
        taskId: 'task-1',
      });
    });
  });

  describe('unmapRequirementFromTask', () => {
    it('deve remover mapeamento entre requisito e tarefa', async () => {
      const result = await controller.unmapRequirementFromTask('p-1', {
        requirementId: 'req-1',
        taskId: 'task-1',
      });

      expect(result.success).toBe(true);
      expect(rtmServiceMock.unmapRequirementFromTask).toHaveBeenCalledWith('req-1', 'task-1');
    });
  });

  describe('deleteRequirement', () => {
    it('deve deletar requisito', async () => {
      const result = await controller.deleteRequirement('req-1');

      expect(result.success).toBe(true);
      expect(rtmServiceMock.deleteRequirement).toHaveBeenCalledWith('req-1');
    });
  });

  describe('autoMapRequirements', () => {
    it('deve mapear automaticamente requisitos para tarefas', async () => {
      const result = await controller.autoMapRequirementsToTasks('p-1');

      expect(result.success).toBe(true);
      expect(rtmServiceMock.autoMapRequirementsToTasks).toHaveBeenCalled();
    });
  });

  describe('generateTasksForUnmappedRequirements', () => {
    it('deve gerar tarefas a partir de requisitos', async () => {
      const result = await controller.generateTasksForUnmappedRequirements('p-1');

      expect(result.success).toBe(true);
      expect(rtmServiceMock.generateTasksForUnmappedRequirements).toHaveBeenCalled();
    });
  });
});
