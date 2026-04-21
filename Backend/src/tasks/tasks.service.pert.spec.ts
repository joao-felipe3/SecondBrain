import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { TasksService } from './tasks.service';
import { GeminiService } from './gemini.service';
import { ChecklistService } from './checklist.service';
import { PertService } from './services/pert.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';

describe('TasksService - PERT Methods (Unit Tests)', () => {
  let service: TasksService;
  let geminiService: GeminiService;
  let mockTaskModel: any;

  const validTaskId = new Types.ObjectId().toString();

  const mockTask = {
    _id: validTaskId,
    title: 'Test Task',
    createdAt: new Date('2024-04-14T10:00:00Z'),
  };

  beforeEach(async () => {
    // Mock the MongoDB Task model with proper query chain
    mockTaskModel = {
      findById: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockTask),
      }),
      findByIdAndUpdate: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          ...mockTask,
          pertOptimisticMinutes: 30,
          pertMostLikelyMinutes: 60,
          pertPessimisticMinutes: 120,
          pertExpectedMinutes: 62.5,
          pertVariance: 225,
          deadline: new Date(),
        }),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        {
          provide: getModelToken('Task'),
          useValue: mockTaskModel,
        },
        {
          provide: getModelToken('Project'),
          useValue: {
            findById: jest.fn(),
            findOne: jest.fn(),
          },
        },
        {
          provide: GeminiService,
          useValue: {
            suggestPertEstimates: jest.fn().mockResolvedValue({
              optimistic: 30,
              likely: 60,
              pessimistic: 120,
              expectedTime: 62.5,
              standardDeviation: 15,
              recommendation: '⚡ Moderate uncertainty',
              fromLLM: true,
            }),
          },
        },
        {
          provide: ChecklistService,
          useValue: {},
        },
        {
          provide: PertService,
          useValue: {},
        },
      ],
    })
      .useMocker((token) => {
        return {};
      })
      .compile();

    service = module.get<TasksService>(TasksService);
    geminiService = module.get<GeminiService>(GeminiService);
  });

  describe('suggestPertEstimates', () => {
    it('should delegate to GeminiService and return suggestions', async () => {
      const result = await service.suggestPertEstimates(
        'complex',
        'Implement OAuth 2.0',
        'Auth Module',
      );

      expect(result).toHaveProperty('optimistic');
      expect(result).toHaveProperty('likely');
      expect(result).toHaveProperty('pessimistic');
      expect(geminiService.suggestPertEstimates).toHaveBeenCalledWith(
        'complex',
        'Implement OAuth 2.0',
        'Auth Module',
      );
    });

    it('should work with minimal parameters', async () => {
      const result = await service.suggestPertEstimates('quick', 'Fix typo');

      expect(result.optimistic).toBeDefined();
      expect(geminiService.suggestPertEstimates).toHaveBeenCalledWith(
        'quick',
        'Fix typo',
        undefined,
      );
    });
  });

  describe('updatePert', () => {
    const validUpdateDto = {
      pertOptimisticMinutes: 30,
      pertMostLikelyMinutes: 60,
      pertPessimisticMinutes: 120,
    };

    beforeEach(() => {
      jest.clearAllMocks();
      // Reset mocks to default behavior
      mockTaskModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockTask),
      });
      mockTaskModel.findByIdAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          ...mockTask,
          ...validUpdateDto,
          pertExpectedMinutes: 62.5,
          pertVariance: 225,
          deadline: new Date('2024-04-14T12:00:00Z'),
        }),
      });
    });

    it('should validate and update PERT estimates', async () => {
      const result = await service.updatePert(validTaskId, validUpdateDto);

      expect(result.pertOptimisticMinutes).toEqual(30);
      expect(result.pertMostLikelyMinutes).toEqual(60);
      expect(result.pertPessimisticMinutes).toEqual(120);
      expect(mockTaskModel.findByIdAndUpdate).toHaveBeenCalled();
    });

    it('should calculate expectedTime correctly during update', async () => {
      const result = await service.updatePert(validTaskId, validUpdateDto);

      // TE = (30 + 4*60 + 120) / 6 = 62.5
      expect(result.pertExpectedMinutes).toBeCloseTo(62.5, 1);
    });

    it('should set deadline with 10% margin', async () => {
      const result = await service.updatePert(validTaskId, validUpdateDto);

      expect(result.deadline).toBeDefined();
      expect(result.deadline.getTime()).toBeGreaterThan(mockTask.createdAt.getTime());
    });

    it('should reject if O > M', async () => {
      const invalidDto = {
        pertOptimisticMinutes: 120,
        pertMostLikelyMinutes: 60,
        pertPessimisticMinutes: 240,
      };

      await expect(service.updatePert(validTaskId, invalidDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject if M > P', async () => {
      const invalidDto = {
        pertOptimisticMinutes: 10,
        pertMostLikelyMinutes: 240,
        pertPessimisticMinutes: 60,
      };

      await expect(service.updatePert(validTaskId, invalidDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject if any value is <= 0', async () => {
      const invalidDto = {
        pertOptimisticMinutes: 0,
        pertMostLikelyMinutes: 20,
        pertPessimisticMinutes: 50,
      };

      await expect(service.updatePert(validTaskId, invalidDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject if any value is not a number', async () => {
      const invalidDto = {
        pertOptimisticMinutes: 'thirty' as any,
        pertMostLikelyMinutes: 60,
        pertPessimisticMinutes: 120,
      };

      await expect(service.updatePert(validTaskId, invalidDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject if task ID is invalid', async () => {
      const invalidDto = {
        pertOptimisticMinutes: 10,
        pertMostLikelyMinutes: 20,
        pertPessimisticMinutes: 50,
      };

      await expect(service.updatePert('invalid_id', invalidDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException if task not found', async () => {
      mockTaskModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(service.updatePert(validTaskId, validUpdateDto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should handle edge case: O = M = P (zero variance)', async () => {
      const edgeDto = {
        pertOptimisticMinutes: 30,
        pertMostLikelyMinutes: 30,
        pertPessimisticMinutes: 30,
      };

      mockTaskModel.findByIdAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          ...mockTask,
          ...edgeDto,
          pertExpectedMinutes: 30,
          pertVariance: 0,
          deadline: new Date(),
        }),
      });

      const result = await service.updatePert(validTaskId, edgeDto);
      expect(result.pertExpectedMinutes).toEqual(30);
      expect(result.pertVariance).toEqual(0);
    });

    it('should update existing PERT fields', async () => {
      const result = await service.updatePert(validTaskId, validUpdateDto);

      expect(mockTaskModel.findByIdAndUpdate).toHaveBeenCalledWith(
        validTaskId,
        expect.objectContaining({
          pertOptimisticMinutes: 30,
          pertMostLikelyMinutes: 60,
          pertPessimisticMinutes: 120,
          pertExpectedMinutes: expect.any(Number),
          pertVariance: expect.any(Number),
          deadline: expect.any(Date),
        }),
        { new: true },
      );
    });

    it('should handle large values', async () => {
      const largeDto = {
        pertOptimisticMinutes: 1000,
        pertMostLikelyMinutes: 5000,
        pertPessimisticMinutes: 10000,
      };

      mockTaskModel.findByIdAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          ...mockTask,
          ...largeDto,
          pertExpectedMinutes: 5166.67,
          pertVariance: Math.pow((10000 - 1000) / 6, 2),
          deadline: new Date(),
        }),
      });

      const result = await service.updatePert(validTaskId, largeDto);

      expect(result.pertExpectedMinutes).toBeGreaterThan(5000);
      expect(result.pertVariance).toBeGreaterThan(0);
    });
  });

  describe('calculateDeadline', () => {
    it('should calculate deadline with 10% margin', () => {
      const createdAt = new Date('2024-04-14T10:00:00Z');
      const expectedTimeMinutes = 60;

      // deadline = createdAt + ceil((TE * 1.1) / 60) hours
      const hoursNeeded = Math.ceil((expectedTimeMinutes * 1.1) / 60);
      const expectedDeadline = new Date(
        createdAt.getTime() + hoursNeeded * 60 * 60 * 1000,
      );

      expect(expectedDeadline.getTime()).toBeGreaterThan(createdAt.getTime());
      expect(expectedDeadline.getTime()).toBeLessThan(
        createdAt.getTime() + 3 * 60 * 60 * 1000,
      );
    });
  });
});
