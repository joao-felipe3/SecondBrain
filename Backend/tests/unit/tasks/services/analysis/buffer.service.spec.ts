import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BufferService } from '../../../../../src/tasks/services/analysis/buffer.service';
import { ProjectBuffer } from '../../../../../src/tasks/schemas/project-buffer.schema';

describe('BufferService', () => {
  let service: BufferService;
  let mockModel: {
    findOneAndUpdate: jest.Mock;
    findOne: jest.Mock;
  };

  const mockProjectId = 'project-123';

  beforeEach(async () => {
    mockModel = {
      findOneAndUpdate: jest.fn(),
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BufferService,
        {
          provide: getModelToken(ProjectBuffer.name),
          useValue: mockModel,
        },
      ],
    }).compile();

    service = module.get<BufferService>(BufferService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('calculateProjectBuffer', () => {
    it('deve calcular buffer como 50% da duração do caminho crítico', async () => {
      const tasks = [
        { taskId: 'task1', estimatedHours: 10, variance: 1, isCritical: true },
        { taskId: 'task2', estimatedHours: 15, variance: 2, isCritical: true },
        {
          taskId: 'task3',
          estimatedHours: 5,
          variance: 0.5,
          isCritical: false,
        },
      ];
      const criticalPath = ['task1', 'task2'];

      const mockBuffer = {
        projectId: mockProjectId,
        projectBuffer: 12.5,
        consumed: 0,
        threshold: 75,
        criticalPathDuration: 25,
        totalVariance: 3,
        standardDeviation: 1.73,
        taskVariances: [
          { taskId: 'task1', variance: 1 },
          { taskId: 'task2', variance: 2 },
        ],
      };

      mockModel.findOneAndUpdate.mockResolvedValue(mockBuffer);

      const result = await service.calculateProjectBuffer({
        projectId: mockProjectId,
        tasks,
        criticalPath,
      });

      expect(result).not.toBeNull();
      expect(result!.projectBuffer).toBeCloseTo(12.5, 1);
      expect(result!.criticalPathDuration).toBe(25);
      expect(mockModel.findOneAndUpdate).toHaveBeenCalledWith(
        { projectId: mockProjectId },
        expect.objectContaining({
          projectBuffer: expect.any(Number) as number,
          consumed: 0,
        }),
        { upsert: true, new: true },
      );
    });

    it('deve retornar buffer padrão se não houver caminho crítico', async () => {
      const tasks = [{ taskId: 'task1', estimatedHours: 10, variance: 0 }];
      const criticalPath: string[] = [];

      const result = await service.calculateProjectBuffer({
        projectId: mockProjectId,
        tasks,
        criticalPath,
      });

      expect(result).not.toBeNull();
      expect(result!.projectBuffer).toBe(0);
    });

    it('deve usar desvio padrão se for maior que 50% da duração', async () => {
      const tasks = [{ taskId: 'task1', estimatedHours: 10, variance: 25, isCritical: true }];
      const criticalPath = ['task1'];

      const mockBuffer = {
        projectId: mockProjectId,
        projectBuffer: 8.225,
        consumed: 0,
        threshold: 75,
      };

      mockModel.findOneAndUpdate.mockResolvedValue(mockBuffer);

      const result = await service.calculateProjectBuffer({
        projectId: mockProjectId,
        tasks,
        criticalPath,
      });

      expect(result).not.toBeNull();
      expect(result!.projectBuffer).toBeGreaterThan(5);
    });
  });

  describe('consumeBuffer', () => {
    it('deve registrar consumo e incrementar contador', async () => {
      const mockBuffer = {
        projectId: mockProjectId,
        projectBuffer: 20,
        consumed: 5,
        threshold: 75,
      };

      mockModel.findOneAndUpdate.mockResolvedValue(mockBuffer);

      const result = await service.consumeBuffer(mockProjectId, 5);

      expect(result.consumed).toBe(5);
      expect(result.percentageUsed).toBe(25);
      expect(mockModel.findOneAndUpdate).toHaveBeenCalledWith(
        { projectId: mockProjectId },
        { $inc: { consumed: 5 } },
        { new: true },
      );
    });

    it('deve disparar alerta se ultrapassar threshold', async () => {
      const mockBuffer = {
        projectId: mockProjectId,
        projectBuffer: 20,
        consumed: 15,
        threshold: 75,
      };

      mockModel.findOneAndUpdate.mockResolvedValue(mockBuffer);

      const result = await service.consumeBuffer(mockProjectId, 5);

      expect(result.percentageUsed).toBe(75);
      expect(result.isAlert).toBe(true);
    });
  });

  describe('getBufferStatus', () => {
    it('deve retornar status correto do buffer', async () => {
      const mockBuffer = {
        projectId: mockProjectId,
        projectBuffer: 20,
        consumed: 5,
        threshold: 75,
      };

      mockModel.findOne.mockResolvedValue(mockBuffer);

      const result = await service.getBufferStatus(mockProjectId);

      expect(result.total).toBe(20);
      expect(result.consumed).toBe(5);
      expect(result.remaining).toBe(15);
      expect(result.percentageUsed).toBe(25);
      expect(result.isAlert).toBe(false);
    });

    it('deve retornar status padrão se buffer não existir', async () => {
      mockModel.findOne.mockResolvedValue(null);

      const result = await service.getBufferStatus(mockProjectId);

      expect(result.total).toBe(0);
      expect(result.percentageUsed).toBe(0);
    });
  });

  describe('checkBufferHealth', () => {
    it('deve gerar alerta em 50%', async () => {
      const mockBuffer = {
        projectId: mockProjectId,
        projectBuffer: 20,
        consumed: 10,
        threshold: 75,
      };

      mockModel.findOne.mockResolvedValue(mockBuffer);

      const alerts = await service.checkBufferHealth(mockProjectId);

      expect(alerts.length).toBe(1);
      expect(alerts[0].severity).toBe('warning');
      expect(alerts[0].percentageUsed).toBe(50);
    });

    it('deve gerar alerta crítico em 75%', async () => {
      const mockBuffer = {
        projectId: mockProjectId,
        projectBuffer: 20,
        consumed: 15,
        threshold: 75,
      };

      mockModel.findOne.mockResolvedValue(mockBuffer);

      const alerts = await service.checkBufferHealth(mockProjectId);

      expect(alerts.length).toBeGreaterThan(0);
      expect(alerts.some((a) => a.severity === 'critical')).toBe(true);
    });

    it('deve gerar alerta se buffer estiver 100% consumido', async () => {
      const mockBuffer = {
        projectId: mockProjectId,
        projectBuffer: 20,
        consumed: 20,
        threshold: 75,
      };

      mockModel.findOne.mockResolvedValue(mockBuffer);

      const alerts = await service.checkBufferHealth(mockProjectId);

      expect(alerts.some((a) => a.message.includes('completamente consumido')));
    });

    it('deve retornar array vazio se buffer não existir', async () => {
      mockModel.findOne.mockResolvedValue(null);

      const alerts = await service.checkBufferHealth(mockProjectId);

      expect(alerts).toEqual([]);
    });
  });

  describe('resetBufferConsumption', () => {
    it('deve resetar consumo para 0', async () => {
      const mockBuffer = {
        projectId: mockProjectId,
        projectBuffer: 20,
        consumed: 0,
        threshold: 75,
      };

      mockModel.findOneAndUpdate.mockResolvedValue(mockBuffer);

      const result = await service.resetBufferConsumption(mockProjectId);

      expect(result).not.toBeNull();
      expect(result!.consumed).toBe(0);
      expect(mockModel.findOneAndUpdate).toHaveBeenCalledWith(
        { projectId: mockProjectId },
        { consumed: 0 },
        { new: true },
      );
    });
  });

  describe('getBufferHistory', () => {
    it('deve retornar o histórico do buffer se ele existir', async () => {
      const date = new Date('2026-07-11T00:00:00.000Z');
      const mockBuffer = {
        projectId: mockProjectId,
        projectBuffer: 20,
        consumed: 5,
        createdAt: date,
      };
      mockModel.findOne.mockResolvedValue(mockBuffer);

      const result = await service.getBufferHistory(mockProjectId);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        date,
        consumed: 5,
        percentageUsed: 25,
      });
      expect(mockModel.findOne).toHaveBeenCalledWith({ projectId: mockProjectId });
    });

    it('deve retornar array vazio se o buffer não for encontrado', async () => {
      mockModel.findOne.mockResolvedValue(null);

      const result = await service.getBufferHistory(mockProjectId);

      expect(result).toEqual([]);
    });
  });

  describe('Edge Cases', () => {
    it('deve arredondar buffer a 1 decimal', async () => {
      const tasks = [
        {
          taskId: 'task1',
          estimatedHours: 7.33,
          variance: 1,
          isCritical: true,
        },
      ];
      const criticalPath = ['task1'];

      const mockBuffer = {
        projectId: mockProjectId,
        projectBuffer: 3.7,
        consumed: 0,
        threshold: 75,
      };

      mockModel.findOneAndUpdate.mockResolvedValue(mockBuffer);

      const result = await service.calculateProjectBuffer({
        projectId: mockProjectId,
        tasks,
        criticalPath,
      });

      expect(result).not.toBeNull();
      expect(result!.projectBuffer.toString().split('.')[1].length).toBeLessThanOrEqual(1);
    });

    it('deve lidar com buffer muito pequeno', async () => {
      const mockBuffer = {
        projectId: mockProjectId,
        projectBuffer: 0.1,
        consumed: 0.05,
        threshold: 75,
      };

      mockModel.findOne.mockResolvedValue(mockBuffer);

      const result = await service.getBufferStatus(mockProjectId);

      expect(result.total).toBe(0.1);
      expect(result.percentageUsed).toBeLessThanOrEqual(100);
    });

    it('deve lidar com consumo maior que buffer', async () => {
      const mockBuffer = {
        projectId: mockProjectId,
        projectBuffer: 20,
        consumed: 25,
        threshold: 75,
      };

      mockModel.findOne.mockResolvedValue(mockBuffer);

      const result = await service.getBufferStatus(mockProjectId);

      expect(result.percentageUsed).toBeLessThanOrEqual(125);
      expect(result.remaining).toBe(0);
    });
  });
});
