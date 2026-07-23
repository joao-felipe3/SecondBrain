import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException } from '@nestjs/common';
import { FeedbackService } from '../../../../../src/tasks/services/intelligence/feedback.service';
import { GeminiService } from '../../../../../src/ai/services/core/gemini.service';

describe('FeedbackService', () => {
  let service: FeedbackService;
  let taskModelMock: any;
  let feedbackModelMock: any;
  let geminiServiceMock: any;

  const validObjectId = '507f1f77bcf86cd799439011';

  beforeEach(async () => {
    taskModelMock = {
      findById: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: validObjectId,
          name: 'Task Concluída',
          description: 'Desc',
          isConcluded: true,
          pomodorosDid: 2,
          checklist: [{ item: 'Step 1', completed: true }],
        }),
      }),
    };

    feedbackModelMock = {
      findOne: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue({ feedback: 'Excelente trabalho!', createdAt: new Date() }),
          }),
        }),
      }),
      create: jest.fn().mockResolvedValue({ _id: 'f-1' }),
    };

    geminiServiceMock = {
      getModelName: jest.fn().mockReturnValue('gemini-2.5-flash-lite'),
      generateCompletionFeedbackStructured: jest.fn().mockResolvedValue({
        celebration: 'Parabéns!',
        validation: 'Checklist 100% completo',
        question: 'Algum obstáculo?',
        nextStepSuggestions: [],
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeedbackService,
        { provide: getModelToken('Task'), useValue: taskModelMock },
        { provide: getModelToken('TaskCompletionFeedback'), useValue: feedbackModelMock },
        { provide: GeminiService, useValue: geminiServiceMock },
      ],
    }).compile();

    service = module.get<FeedbackService>(FeedbackService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getCompletionFeedback', () => {
    it('deve lançar BadRequestException para ID de tarefa inválido', async () => {
      await expect(service.getCompletionFeedback('invalid')).rejects.toThrow(BadRequestException);
    });

    it('deve retornar o feedback gerado da tarefa', async () => {
      const result = await service.getCompletionFeedback(validObjectId);

      expect(result).toBeDefined();
      expect(result?.feedback).toBe('Excelente trabalho!');
    });
  });

  describe('generateCompletionFeedback', () => {
    it('deve gerar feedback estruturado para conclusão de tarefa', async () => {
      const result = await service.generateCompletionFeedback(validObjectId);

      expect(result).toBeDefined();
      expect(geminiServiceMock.generateCompletionFeedbackStructured).toHaveBeenCalled();
    });
  });
});
