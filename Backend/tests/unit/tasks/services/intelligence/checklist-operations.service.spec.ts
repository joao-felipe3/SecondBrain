import { BadRequestException, NotFoundException } from '@nestjs/common';
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
      findSimilarTasksInProject: jest.fn().mockResolvedValue([{ name: 'Similar' }]),
      enrichHistoryContext: jest.fn().mockReturnValue('History Context'),
    };

    mockInputService = {
      normalizeChecklist: jest.fn((c) => c),
    };

    mockGeminiService = {
      generateChecklistForTask: jest.fn().mockResolvedValue(['Passo 1', 'Passo 2']),
      generateChecklistWithHistory: jest.fn().mockResolvedValue(['Passo H1', 'Passo H2']),
    };

    service = new ChecklistOperationsService(
      mockTaskModel,
      mockChecklistService,
      mockInputService,
      mockGeminiService,
    );
  });

  describe('Checklist operations & AI generation', () => {
    it('should validate checklist structure', () => {
      const res = service.validateChecklistStructure(['item 1']);
      expect(res.isValid).toBe(true);
    });

    it('should throw BadRequestException for invalid task ObjectId', async () => {
      await expect(service.updateMicroTaskChecklist('invalid-id', ['item 1'])).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException if task not found on update', async () => {
      mockTaskModel.findByIdAndUpdate.mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(null) });
      await expect(service.updateMicroTaskChecklist(validTaskId, ['item 1'])).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should update task checklist items', async () => {
      const res = await service.updateMicroTaskChecklist(validTaskId, ['item 1']);
      expect(res).toBeDefined();
    });

    it('should update individual checklist item completed state', async () => {
      const res = await service.updateChecklistItem({
        taskId: validTaskId,
        itemIndex: '0',
        completed: true,
      });

      expect(res.completionPercentage).toBe(100);
    });

    it('should throw BadRequestException if itemIndex is out of range', async () => {
      await expect(
        service.updateChecklistItem({
          taskId: validTaskId,
          itemIndex: '99',
          completed: true,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should validate completion requirements for task', async () => {
      const res = await service.validateCompletionRequirements(validTaskId);
      expect(res.isValid).toBe(true);

      const invalidRes = await service.validateCompletionRequirements('invalid-id');
      expect(invalidRes.isValid).toBe(false);
    });

    it('should get validation errors for incomplete task checklist', async () => {
      const res = await service.getValidationErrors(validTaskId);
      expect(res.valid).toBe(true);

      const invalidRes = await service.getValidationErrors('invalid-id');
      expect(invalidRes.valid).toBe(false);
    });

    it('should generate checklist with AI and history', async () => {
      const simple = await service.generateChecklistForTask({ taskName: 'T1' });
      expect(simple.length).toBe(2);

      const history = await service.generateChecklistWithHistory({
        taskName: 'T1',
        projectId: new Types.ObjectId().toHexString(),
      });
      expect(history.length).toBe(2);
    });
  });
});
