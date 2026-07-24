import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { FeedbackService } from '@src/tasks/services/intelligence/feedback.service';

describe('FeedbackService', () => {
  let service: FeedbackService;
  let mockGeminiService: any;
  let mockTaskModel: any;
  let mockFeedbackModel: any;

  const validTaskId = new Types.ObjectId().toHexString();

  beforeEach(() => {
    mockGeminiService = {
      getModelName: jest.fn().mockReturnValue('gemini-2.5-flash-lite'),
      generateCompletionFeedbackStructured: jest.fn().mockResolvedValue({
        celebration: 'Parabéns!',
        validation: 'Validado',
        question: 'Impedimentos?',
        suggestion: 'Melhorar',
      }),
      generateNextSteps: jest.fn().mockResolvedValue([{ title: 'Passo 1', description: 'Desc' }]),
    };

    mockTaskModel = {
      findById: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: validTaskId,
          name: 'Task Concluída',
          isConcluded: true,
          pomodorosDid: 2,
          checklist: [{ item: 'Step 1', completed: true }],
        }),
      }),
    };

    mockFeedbackModel = {
      create: jest.fn().mockResolvedValue({ _id: new Types.ObjectId() }),
      findOne: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue({
              feedback: '{"celebration":"Parabéns!"}',
              createdAt: new Date(),
            }),
          }),
        }),
      }),
    };

    service = new FeedbackService(
      mockGeminiService,
      mockTaskModel as any,
      mockFeedbackModel as any,
    );
  });

  describe('generateCompletionFeedback', () => {
    it('should throw BadRequestException on invalid ObjectId', async () => {
      await expect(service.generateCompletionFeedback('invalid-id')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException if task is missing', async () => {
      mockTaskModel.findById.mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(null) });
      await expect(service.generateCompletionFeedback(validTaskId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException if task is not concluded', async () => {
      mockTaskModel.findById.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValue({ _id: validTaskId, isConcluded: false }),
      });
      await expect(service.generateCompletionFeedback(validTaskId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should generate structured feedback and persist it', async () => {
      const feedbackStr = await service.generateCompletionFeedback(validTaskId);
      expect(feedbackStr).toBeDefined();
      expect(mockFeedbackModel.create).toHaveBeenCalled();
    });

    it('should save user-provided payload directly', async () => {
      const payload: any = { celebration: 'User Feedback' };
      const res = await service.generateCompletionFeedback(validTaskId, payload);
      expect(res).toContain('User Feedback');
      expect(mockFeedbackModel.create).toHaveBeenCalled();
    });
  });

  describe('getCompletionFeedback & suggestNextSteps', () => {
    it('should fetch completion feedback for valid task', async () => {
      const res = await service.getCompletionFeedback(validTaskId);
      expect(res).not.toBeNull();
      expect(res?.feedback).toContain('Parabéns!');
    });

    it('should suggest next steps using Gemini Service', async () => {
      const task: any = { _id: validTaskId, name: 'Task' };
      const steps = await service.suggestNextSteps(task, 'feedback');
      expect(steps.length).toBe(1);
      expect(steps[0].title).toBe('Passo 1');
    });
  });
});
