import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { FeedbackService } from '../../../../../src/tasks/services/intelligence/feedback.service';
import { GeminiService } from '../../../../../src/ai/services/core/gemini.service';

describe('FeedbackService', () => {
  let service: FeedbackService;
  let mockGeminiService: {
    generateContent: jest.Mock;
  };
  let mockTaskModel: {
    findById: jest.Mock;
  };
  let mockFeedbackModel: {
    create: jest.Mock;
    findOne: jest.Mock;
  };

  const validTaskId = new Types.ObjectId().toString();

  beforeEach(async () => {
    mockGeminiService = {
      generateContent: jest.fn(),
    };

    mockTaskModel = {
      findById: jest.fn(),
    };

    mockFeedbackModel = {
      create: jest.fn().mockResolvedValue({ _id: 'feedback-1' }),
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeedbackService,
        { provide: GeminiService, useValue: mockGeminiService },
        { provide: getModelToken('Task'), useValue: mockTaskModel },
        { provide: getModelToken('TaskCompletionFeedback'), useValue: mockFeedbackModel },
      ],
    }).compile();

    service = module.get<FeedbackService>(FeedbackService);
  });

  describe('generateCompletionFeedback', () => {
    it('deve lancar NotFoundException se a tarefa nao existir', async () => {
      mockTaskModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(service.generateCompletionFeedback(validTaskId)).rejects.toThrow(NotFoundException);
    });

    it('deve salvar feedback do usuario diretamente se o payload for fornecido', async () => {
      const mockTask = { _id: validTaskId, name: 'Task Test', isConcluded: true };
      mockTaskModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockTask),
      });

      const payload = { celebration: 'Excelente progresso realizado' };
      const result = await service.generateCompletionFeedback(validTaskId, payload);

      expect(result).toBe(JSON.stringify(payload));
      expect(mockFeedbackModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ feedback: JSON.stringify(payload) }),
      );
    });
  });

  describe('getCompletionFeedback', () => {
    it('deve rejeitar ID invalido', async () => {
      await expect(service.getCompletionFeedback('invalid-id')).rejects.toThrow(BadRequestException);
    });

    it('deve retornar null se nao houver feedback registrado', async () => {
      mockFeedbackModel.findOne.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue(null),
          }),
        }),
      });

      const result = await service.getCompletionFeedback(validTaskId);
      expect(result).toBeNull();
    });

    it('deve retornar o feedback se for encontrado', async () => {
      const mockDoc = { feedback: 'Bom trabalho', createdAt: new Date() };
      mockFeedbackModel.findOne.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue(mockDoc),
          }),
        }),
      });

      const result = await service.getCompletionFeedback(validTaskId);
      expect(result).toEqual({
        feedback: 'Bom trabalho',
        createdAt: mockDoc.createdAt,
      });
    });
  });
});
