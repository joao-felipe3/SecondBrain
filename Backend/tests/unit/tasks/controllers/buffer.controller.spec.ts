import { Test, TestingModule } from '@nestjs/testing';
import { BufferController } from '../../../../src/tasks/controllers/buffer.controller';
import { BufferService } from '../../../../src/tasks/services/analysis/buffer.service';
import { CPMService } from '../../../../src/tasks/services/dependencies/cpm.service';
import { TasksService } from '../../../../src/tasks/tasks.service';

describe('BufferController', () => {
  let controller: BufferController;
  let bufferServiceMock: any;
  let cpmServiceMock: any;
  let tasksServiceMock: any;

  beforeEach(async () => {
    bufferServiceMock = {
      calculateProjectBuffer: jest.fn().mockResolvedValue({
        projectId: 'p-1',
        projectBuffer: 10,
        criticalPathDuration: 20,
        totalVariance: 4,
        standardDeviation: 2,
      }),
      getBufferStatus: jest.fn().mockResolvedValue({
        total: 10,
        consumed: 2,
        remaining: 8,
        percentageUsed: 20,
        isAlert: false,
      }),
      checkBufferHealth: jest.fn().mockResolvedValue([]),
      consumeBuffer: jest.fn().mockResolvedValue({
        total: 10,
        consumed: 5,
        remaining: 5,
        percentageUsed: 50,
        isAlert: true,
      }),
      resetBufferConsumption: jest.fn().mockResolvedValue(true),
      getBufferHistory: jest.fn().mockResolvedValue([{ date: new Date(), consumed: 2, percentageUsed: 20 }]),
    };

    cpmServiceMock = {
      getDependencies: jest.fn().mockResolvedValue([
        { taskId: 't-2', dependsOnTaskId: 't-1' },
      ]),
      calculateCriticalPath: jest.fn().mockReturnValue({
        criticalPath: ['t-1', 't-2'],
        tasksByImpact: [
          { id: 't-1', name: 'Task 1', duration: 10, isCritical: true, slack: 0 },
          { id: 't-2', name: 'Task 2', duration: 10, isCritical: true, slack: 0 },
        ],
      }),
    };

    tasksServiceMock = {
      findByProjectId: jest.fn().mockResolvedValue([
        { id: 't-1', name: 'Task 1', pertExpectedMinutes: 10 },
        { id: 't-2', name: 'Task 2', pertExpectedMinutes: 10 },
      ]),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BufferController],
      providers: [
        { provide: BufferService, useValue: bufferServiceMock },
        { provide: CPMService, useValue: cpmServiceMock },
        { provide: TasksService, useValue: tasksServiceMock },
      ],
    }).compile();

    controller = module.get<BufferController>(BufferController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('calculateProjectBuffer', () => {
    it('deve calcular buffer do projeto com sucesso', async () => {
      const result = await controller.calculateProjectBuffer('p-1');

      expect(result.success).toBe(true);
      expect(result.buffer).toBeDefined();
      expect(bufferServiceMock.calculateProjectBuffer).toHaveBeenCalled();
    });

    it('deve retornar success false se o buffer for nulo', async () => {
      bufferServiceMock.calculateProjectBuffer.mockResolvedValueOnce(null);

      const result = await controller.calculateProjectBuffer('p-1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('No se pudo calcular el buffer');
    });

    it('deve tratar exceções e retornar objeto de erro', async () => {
      tasksServiceMock.findByProjectId.mockRejectedValueOnce(new Error('Erro DB'));

      const result = await controller.calculateProjectBuffer('p-1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Erro DB');
    });
  });

  describe('getBufferStatus', () => {
    it('deve retornar status do buffer', async () => {
      const result: any = await controller.getBufferStatus('p-1');

      expect(result.success).toBe(true);
      expect(result.status.total).toBe(10);
      expect(result.status.consumed).toBe(2);
    });

    it('deve tratar erros no getBufferStatus', async () => {
      bufferServiceMock.getBufferStatus.mockRejectedValueOnce(new Error('Erro status'));

      const result = await controller.getBufferStatus('p-1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Erro status');
    });
  });

  describe('consumeBuffer', () => {
    it('deve registrar consumo de buffer', async () => {
      const result: any = await controller.consumeBuffer('p-1', { hoursUsed: 3 });

      expect(result.success).toBe(true);
      expect(result.status.consumed).toBe(5);
      expect(bufferServiceMock.consumeBuffer).toHaveBeenCalledWith('p-1', 3);
    });

    it('deve tratar erros no consumeBuffer', async () => {
      bufferServiceMock.consumeBuffer.mockRejectedValueOnce(new Error('Erro consumo'));

      const result = await controller.consumeBuffer('p-1', { hoursUsed: 3 });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Erro consumo');
    });
  });

  describe('checkBufferHealth', () => {
    it('deve retornar saude do buffer', async () => {
      const result: any = await controller.checkBufferHealth('p-1');

      expect(result.success).toBe(true);
      expect(result.health.status.isHealthy).toBe(true);
    });

    it('deve tratar erros no checkBufferHealth', async () => {
      bufferServiceMock.checkBufferHealth.mockRejectedValueOnce(new Error('Erro saude'));

      const result = await controller.checkBufferHealth('p-1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Erro saude');
    });
  });

  describe('resetBufferConsumption', () => {
    it('deve resetar o consumo de buffer', async () => {
      const result = await controller.resetBufferConsumption('p-1');

      expect(result.success).toBe(true);
      expect(result.message).toContain('p-1');
    });

    it('deve tratar erros no resetBufferConsumption', async () => {
      bufferServiceMock.resetBufferConsumption.mockRejectedValueOnce(new Error('Erro reset'));

      const result = await controller.resetBufferConsumption('p-1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Erro reset');
    });
  });

  describe('getBufferHistory', () => {
    it('deve retornar historico do buffer', async () => {
      const result = await controller.getBufferHistory('p-1');

      expect(result.success).toBe(true);
      expect(result.history).toHaveLength(1);
    });

    it('deve tratar erros no getBufferHistory', async () => {
      bufferServiceMock.getBufferHistory.mockRejectedValueOnce(new Error('Erro historico'));

      const result = await controller.getBufferHistory('p-1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Erro historico');
    });
  });
});
