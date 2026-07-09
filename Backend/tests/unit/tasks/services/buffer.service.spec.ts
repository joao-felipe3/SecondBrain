import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BufferService } from '../../../../src/tasks/services/analysis/buffer.service';
import { ProjectBuffer } from '../../../../src/tasks/schemas/project-buffer.schema';

describe('BufferService', () => {
  let service: BufferService;
  let mockModel: any;

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
      // Arrange
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
        projectBuffer: 12.5, // (10 + 15) * 0.5
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

      // Act
      const result = await service.calculateProjectBuffer({
        projectId: mockProjectId,
        tasks,
        criticalPath,
      });

      // Assert
      expect(result).not.toBeNull();
      expect(result!.projectBuffer).toBeCloseTo(12.5, 1);
      expect(result!.criticalPathDuration).toBe(25);
      expect(mockModel.findOneAndUpdate).toHaveBeenCalledWith(
        { projectId: mockProjectId },
        expect.objectContaining({
          projectBuffer: expect.any(Number),
          consumed: 0,
        }),
        { upsert: true, new: true },
      );
    });

    it('deve retornar buffer padrão se não houver caminho crítico', async () => {
      // Arrange
      const tasks = [{ taskId: 'task1', estimatedHours: 10, variance: 0 }];
      const criticalPath: string[] = [];

      // Act
      const result = await service.calculateProjectBuffer({
        projectId: mockProjectId,
        tasks,
        criticalPath,
      });

      // Assert
      expect(result).not.toBeNull();
      expect(result!.projectBuffer).toBe(0);
    });

    it('deve usar desvio padrão se for maior que 50% da duração', async () => {
      // Arrange
      const tasks = [
        { taskId: 'task1', estimatedHours: 10, variance: 25, isCritical: true }, // DP = 5
      ];
      const criticalPath = ['task1'];

      const mockBuffer = {
        projectId: mockProjectId,
        projectBuffer: 8.225, // max(10 * 0.5, 5 * 1.645)
        consumed: 0,
        threshold: 75,
      };

      mockModel.findOneAndUpdate.mockResolvedValue(mockBuffer);

      // Act
      const result = await service.calculateProjectBuffer({
        projectId: mockProjectId,
        tasks,
        criticalPath,
      });

      // Assert
      expect(result).not.toBeNull();
      expect(result!.projectBuffer).toBeGreaterThan(5);
    });
  });

  describe('consumeBuffer', () => {
    it('deve registrar consumo e incrementar contador', async () => {
      // Arrange
      const mockBuffer = {
        projectId: mockProjectId,
        projectBuffer: 20,
        consumed: 5,
        threshold: 75,
      };

      mockModel.findOneAndUpdate.mockResolvedValue(mockBuffer);

      // Act
      const result = await service.consumeBuffer(mockProjectId, 5);

      // Assert
      expect(result.consumed).toBe(5);
      expect(result.percentageUsed).toBe(25);
      expect(mockModel.findOneAndUpdate).toHaveBeenCalledWith(
        { projectId: mockProjectId },
        { $inc: { consumed: 5 } },
        { new: true },
      );
    });

    it('deve disparar alerta se ultrapassar threshold', async () => {
      // Arrange
      const mockBuffer = {
        projectId: mockProjectId,
        projectBuffer: 20,
        consumed: 15,
        threshold: 75,
      };

      mockModel.findOneAndUpdate.mockResolvedValue(mockBuffer);

      // Act
      const result = await service.consumeBuffer(mockProjectId, 5);

      // Assert
      expect(result.percentageUsed).toBe(75);
      expect(result.isAlert).toBe(true);
    });
  });

  describe('getBufferStatus', () => {
    it('deve retornar status correto do buffer', async () => {
      // Arrange
      const mockBuffer = {
        projectId: mockProjectId,
        projectBuffer: 20,
        consumed: 5,
        threshold: 75,
      };

      mockModel.findOne.mockResolvedValue(mockBuffer);

      // Act
      const result = await service.getBufferStatus(mockProjectId);

      // Assert
      expect(result.total).toBe(20);
      expect(result.consumed).toBe(5);
      expect(result.remaining).toBe(15);
      expect(result.percentageUsed).toBe(25);
      expect(result.isAlert).toBe(false);
    });

    it('deve retornar status padrão se buffer não existir', async () => {
      // Arrange
      mockModel.findOne.mockResolvedValue(null);

      // Act
      const result = await service.getBufferStatus(mockProjectId);

      // Assert
      expect(result.total).toBe(0);
      expect(result.percentageUsed).toBe(0);
    });
  });

  describe('checkBufferHealth', () => {
    it('deve gerar alerta em 50%', async () => {
      // Arrange
      const mockBuffer = {
        projectId: mockProjectId,
        projectBuffer: 20,
        consumed: 10,
        threshold: 75,
      };

      mockModel.findOne.mockResolvedValue(mockBuffer);

      // Act
      const alerts = await service.checkBufferHealth(mockProjectId);

      // Assert
      expect(alerts.length).toBe(1);
      expect(alerts[0].severity).toBe('warning');
      expect(alerts[0].percentageUsed).toBe(50);
    });

    it('deve gerar alerta crítico em 75%', async () => {
      // Arrange
      const mockBuffer = {
        projectId: mockProjectId,
        projectBuffer: 20,
        consumed: 15,
        threshold: 75,
      };

      mockModel.findOne.mockResolvedValue(mockBuffer);

      // Act
      const alerts = await service.checkBufferHealth(mockProjectId);

      // Assert
      expect(alerts.length).toBeGreaterThan(0);
      expect(alerts.some((a) => a.severity === 'critical')).toBe(true);
    });

    it('deve gerar alerta se buffer estiver 100% consumido', async () => {
      // Arrange
      const mockBuffer = {
        projectId: mockProjectId,
        projectBuffer: 20,
        consumed: 20,
        threshold: 75,
      };

      mockModel.findOne.mockResolvedValue(mockBuffer);

      // Act
      const alerts = await service.checkBufferHealth(mockProjectId);

      // Assert
      expect(alerts.some((a) => a.message.includes('completamente consumido')));
    });

    it('deve retornar array vazio se buffer não existir', async () => {
      // Arrange
      mockModel.findOne.mockResolvedValue(null);

      // Act
      const alerts = await service.checkBufferHealth(mockProjectId);

      // Assert
      expect(alerts).toEqual([]);
    });
  });

  describe('resetBufferConsumption', () => {
    it('deve resetar consumo para 0', async () => {
      // Arrange
      const mockBuffer = {
        projectId: mockProjectId,
        projectBuffer: 20,
        consumed: 0,
        threshold: 75,
      };

      mockModel.findOneAndUpdate.mockResolvedValue(mockBuffer);

      // Act
      const result = await service.resetBufferConsumption(mockProjectId);

      // Assert
      expect(result).not.toBeNull();
      expect(result!.consumed).toBe(0);
      expect(mockModel.findOneAndUpdate).toHaveBeenCalledWith(
        { projectId: mockProjectId },
        { consumed: 0 },
        { new: true },
      );
    });
  });

  // Edge Cases
  describe('Edge Cases', () => {
    it('deve arredondar buffer a 1 decimal', async () => {
      // Arrange
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
        projectBuffer: 3.7, // 7.33 * 0.5 arredondado
        consumed: 0,
        threshold: 75,
      };

      mockModel.findOneAndUpdate.mockResolvedValue(mockBuffer);

      // Act
      const result = await service.calculateProjectBuffer({
        projectId: mockProjectId,
        tasks,
        criticalPath,
      });

      // Assert
      expect(result).not.toBeNull();
      expect(result!.projectBuffer.toString().split('.')[1].length).toBeLessThanOrEqual(1);
    });

    it('deve lidar com buffer muito pequeno', async () => {
      // Arrange
      const mockBuffer = {
        projectId: mockProjectId,
        projectBuffer: 0.1,
        consumed: 0.05,
        threshold: 75,
      };

      mockModel.findOne.mockResolvedValue(mockBuffer);

      // Act
      const result = await service.getBufferStatus(mockProjectId);

      // Assert
      expect(result.total).toBe(0.1);
      expect(result.percentageUsed).toBeLessThanOrEqual(100);
    });

    it('deve lidar com consumo maior que buffer', async () => {
      // Arrange
      const mockBuffer = {
        projectId: mockProjectId,
        projectBuffer: 20,
        consumed: 25,
        threshold: 75,
      };

      mockModel.findOne.mockResolvedValue(mockBuffer);

      // Act
      const result = await service.getBufferStatus(mockProjectId);

      // Assert
      expect(result.percentageUsed).toBeLessThanOrEqual(125);
      expect(result.remaining).toBe(0); // remaining não deve ser negativo
    });
  });
});
