import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ChecklistOperationsService } from '../../../../../src/tasks/services/intelligence/checklist-operations.service';
import { ChecklistService } from '../../../../../src/tasks/services/intelligence/checklist.service';
import { TasksInputService } from '../../../../../src/tasks/services/workflow/input.service';
import { GeminiService } from '../../../../../src/ai/services/core/gemini.service';

describe('ChecklistOperationsService', () => {
  let service: ChecklistOperationsService;
  let mockTaskModel: any;
  let checklistServiceMock: any;
  let inputServiceMock: any;
  let geminiServiceMock: any;

  const validObjectId = '507f1f77bcf86cd799439011';

  beforeEach(async () => {
    mockTaskModel = {
      findByIdAndUpdate: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({ _id: validObjectId, checklist: [{ item: 'Step 1', completed: false }] }),
      }),
      findById: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: validObjectId,
          checklist: [{ item: 'Step 1', completed: false }],
          save: jest.fn().mockResolvedValue({ _id: validObjectId, checklist: [{ item: 'Step 1', completed: true }] }),
        }),
      }),
    };

    checklistServiceMock = {
      validateChecklistStructure: jest.fn().mockReturnValue({ isValid: true }),
      calculateCompletionPercentage: jest.fn().mockReturnValue(100),
    };

    inputServiceMock = {
      normalizeChecklist: jest.fn().mockImplementation((list) => list.map((item: any) => ({ item: typeof item === 'string' ? item : item.item, completed: false }))),
    };

    geminiServiceMock = {
      generateContent: jest.fn().mockResolvedValue(JSON.stringify({ checklist: ['Passo 1', 'Passo 2', 'Passo 3'] })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChecklistOperationsService,
        { provide: getModelToken('Task'), useValue: mockTaskModel },
        { provide: ChecklistService, useValue: checklistServiceMock },
        { provide: TasksInputService, useValue: inputServiceMock },
        { provide: GeminiService, useValue: geminiServiceMock },
      ],
    }).compile();

    service = module.get<ChecklistOperationsService>(ChecklistOperationsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('updateMicroTaskChecklist', () => {
    it('deve lançar BadRequestException se o ID for inválido', async () => {
      await expect(service.updateMicroTaskChecklist('invalid', ['Item 1'])).rejects.toThrow(BadRequestException);
    });

    it('deve atualizar o checklist da tarefa', async () => {
      const result = await service.updateMicroTaskChecklist(validObjectId, ['Item 1', 'Item 2']);
      expect(result).toBeDefined();
      expect(mockTaskModel.findByIdAndUpdate).toHaveBeenCalled();
    });
  });

  describe('updateChecklistItem', () => {
    it('deve marcar o item do checklist como concluído', async () => {
      const result = await service.updateChecklistItem({
        taskId: validObjectId,
        itemIndex: '0',
        completed: true,
      });

      expect(result).toBeDefined();
      expect(result.completionPercentage).toBe(100);
    });
  });
});
