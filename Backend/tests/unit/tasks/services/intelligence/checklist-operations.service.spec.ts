import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { ChecklistOperationsService } from '@src/tasks/services/intelligence/checklist-operations.service';

describe('ChecklistOperationsService', () => {
  let service: ChecklistOperationsService;
  let mockTaskModel: any;
  let mockChecklistService: any;
  let mockInputService: any;
  let mockGeminiService: any;

  const validTaskId = new Types.ObjectId().toHexString();

  beforeEach(() => {
    mockTaskModel = {
      findById: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: validTaskId,
          name: 'Task 1',
          checklist: [{ item: 'Step 1', completed: false }],
          save: jest.fn().mockResolvedValue({
            _id: validTaskId,
            name: 'Task 1',
            checklist: [{ item: 'Step 1', completed: true }],
          }),
        }),
      }),
      findByIdAndUpdate: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({ _id: validTaskId }),
      }),
    };

    mockChecklistService = {
      validateChecklistStructure: jest.fn().mockReturnValue({ isValid: true }),
      calculateCompletionPercentage: jest.fn().mockReturnValue(100),
      validateChecklistCompletion: jest.fn().mockReturnValue({ isValid: true }),
      findSimilarTasksInProject: jest.fn().mockResolvedValue([]),
      enrichHistoryContext: jest.fn().mockReturnValue(''),
    };

    mockInputService = {
      normalizeChecklist: jest.fn((c) => c),
    };

    mockGeminiService = {
      generateChecklistForTask: jest.fn().mockResolvedValue(['Passo 1', 'Passo 2']),
      generateChecklistWithHistory: jest.fn().mockResolvedValue(['Passo H1', 'Passo H2']),
    };

    service = new ChecklistOperationsService(
      mockTaskModel as any,
      mockChecklistService as any,
      mockInputService as any,
      mockGeminiService as any,
    );
  });

  describe('updateMicroTaskChecklist & updateChecklistItem', () => {
    it('should throw BadRequestException for invalid task ObjectId', async () => {
      await expect(service.updateMicroTaskChecklist('invalid-id', ['item 1'])).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should update task checklist items', async () => {
      const res = await service.updateMicroTaskChecklist(validTaskId, ['item 1']);
      expect(res).toBeDefined();
      expect(mockTaskModel.findByIdAndUpdate).toHaveBeenCalled();
    });

    it('should update individual checklist item completed state', async () => {
      const res = await service.updateChecklistItem({
        taskId: validTaskId,
        itemIndex: '0',
        completed: true,
      });

      expect(res.completionPercentage).toBe(100);
    });
  });

  describe('validateCompletionRequirements & getValidationErrors', () => {
    it('should validate completion requirements for task', async () => {
      const res = await service.validateCompletionRequirements(validTaskId);
      expect(res.isValid).toBe(true);
    });

    it('should get validation errors for incomplete task checklist', async () => {
      const res = await service.getValidationErrors(validTaskId);
      expect(res.valid).toBe(true);
      expect(res.errors.length).toBe(0);
    });
  });
});
