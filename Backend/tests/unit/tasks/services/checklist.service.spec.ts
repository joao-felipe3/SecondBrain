import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ChecklistService } from '../../../../src/tasks/services/shared/checklist.service';
import { Types } from 'mongoose';

describe('ChecklistService', () => {
  let service: ChecklistService;
  let mockTaskModel: any;

  beforeEach(async () => {
    mockTaskModel = {
      find: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChecklistService,
        {
          provide: getModelToken('Task'),
          useValue: mockTaskModel,
        },
      ],
    }).compile();

    service = module.get<ChecklistService>(ChecklistService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('validateChecklistStructure', () => {
    it('should reject empty checklist', () => {
      const result = service.validateChecklistStructure([]);
      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('vazio');
    });

    it('should reject checklist with less than 3 items', () => {
      const result = service.validateChecklistStructure(['item1', 'item2']);
      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('mínimo 3');
    });

    it('should reject checklist with more than 10 items', () => {
      const items = Array.from({ length: 11 }, (_, i) => `item${i + 1}`);
      const result = service.validateChecklistStructure(items);
      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('mais de 10');
    });

    it('should reject checklist with duplicate items', () => {
      const result = service.validateChecklistStructure(['item1', 'item2', 'ITEM1']);
      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('duplicado');
    });

    it('should reject checklist with empty items', () => {
      const result = service.validateChecklistStructure(['item1', '', 'item3']);
      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('vazios');
    });

    it('should accept valid checklist with strings', () => {
      const result = service.validateChecklistStructure(['item1', 'item2', 'item3']);
      expect(result.isValid).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('should accept valid checklist with objects', () => {
      const result = service.validateChecklistStructure([
        { item: 'item1', completed: false, order: 0 },
        { item: 'item2', completed: true, order: 1 },
        { item: 'item3', completed: false, order: 2 },
      ]);
      expect(result.isValid).toBe(true);
    });

    it('should accept checklist with 10 items (boundary)', () => {
      const items = Array.from({ length: 10 }, (_, i) => `item${i + 1}`);
      const result = service.validateChecklistStructure(items);
      expect(result.isValid).toBe(true);
    });

    it('should accept checklist with 3 items (boundary)', () => {
      const result = service.validateChecklistStructure(['item1', 'item2', 'item3']);
      expect(result.isValid).toBe(true);
    });
  });

  describe('validateChecklistCompletion', () => {
    it('should pass for empty checklist', () => {
      const result = service.validateChecklistCompletion([]);
      expect(result.isValid).toBe(true);
    });

    it('should pass for 100% complete checklist', () => {
      const result = service.validateChecklistCompletion([
        { completed: true },
        { completed: true },
        { completed: true },
      ]);
      expect(result.isValid).toBe(true);
    });

    it('should fail for 50% complete checklist', () => {
      const result = service.validateChecklistCompletion([{ completed: true }, { completed: false }]);
      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('incompleto');
      expect(result.reason).toContain('50%');
    });

    it('should fail for 0% complete checklist', () => {
      const result = service.validateChecklistCompletion([
        { completed: false },
        { completed: false },
        { completed: false },
      ]);
      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('0%');
    });

    it('should fail for 75% complete checklist', () => {
      const result = service.validateChecklistCompletion([
        { completed: true },
        { completed: true },
        { completed: true },
        { completed: false },
      ]);
      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('75%');
    });
  });

  describe('calculateCompletionPercentage', () => {
    it('should return 0 for empty checklist', () => {
      const result = service.calculateCompletionPercentage([]);
      expect(result).toBe(0);
    });

    it('should return 0 for undefined checklist', () => {
      const result = service.calculateCompletionPercentage(undefined);
      expect(result).toBe(0);
    });

    it('should return 50 for half complete checklist', () => {
      const result = service.calculateCompletionPercentage([{ completed: true }, { completed: false }]);
      expect(result).toBe(50);
    });

    it('should return 100 for fully complete checklist', () => {
      const result = service.calculateCompletionPercentage([
        { completed: true },
        { completed: true },
        { completed: true },
      ]);
      expect(result).toBe(100);
    });

    it('should round correctly', () => {
      const result = service.calculateCompletionPercentage([
        { completed: true },
        { completed: false },
        { completed: false },
      ]);
      expect(result).toBe(33); // 1/3 = 0.333... → 33
    });
  });

  describe('enrichHistoryContext', () => {
    it('should return empty string for empty history', () => {
      const result = service.enrichHistoryContext([]);
      expect(result).toBe('');
    });

    it('should format single task history', () => {
      const result = service.enrichHistoryContext([
        {
          name: 'Task 1',
          description: 'Desc 1',
          checklist: [{ item: 'item1' }, { item: 'item2' }],
        },
      ]);
      expect(result).toContain('Task 1');
      expect(result).toContain('item1');
      expect(result).toContain('item2');
    });

    it('should format multiple task history', () => {
      const result = service.enrichHistoryContext([
        {
          name: 'Task 1',
          checklist: [{ item: 'item1' }],
        },
        {
          name: 'Task 2',
          checklist: [{ item: 'item2' }],
        },
      ]);
      expect(result).toContain('Task 1');
      expect(result).toContain('Task 2');
      expect(result).toContain('similares concluídas');
    });

    it('should handle task without checklist', () => {
      const result = service.enrichHistoryContext([
        {
          name: 'Task 1',
          checklist: undefined,
        },
      ]);
      expect(result).toContain('Task 1');
      expect(result).toContain('N/A');
    });
  });

  describe('findSimilarTasksInProject', () => {
    it('should return empty array for invalid projectId', async () => {
      const result = await service.findSimilarTasksInProject('invalid-id', 'habit');
      expect(result).toEqual([]);
    });

    it('should return empty array for invalid microTaskType', async () => {
      const projectId = new Types.ObjectId().toString();
      const result = await service.findSimilarTasksInProject(projectId, 'invalid-type');
      expect(result).toEqual([]);
    });

    it('should query database for similar completed tasks', async () => {
      const projectId = new Types.ObjectId();
      const mockExec = jest.fn().mockResolvedValue([
        {
          name: 'Similar Task 1',
          description: 'Desc 1',
          checklist: [{ item: 'item1', completed: true }],
        },
      ]);
      const mockLimit = jest.fn().mockReturnValue({ exec: mockExec });
      const mockSelect = jest.fn().mockReturnValue({ limit: mockLimit });
      mockTaskModel.find.mockReturnValue({ select: mockSelect });

      const result = await service.findSimilarTasksInProject(projectId.toString(), 'habit', 1);

      expect(mockTaskModel.find).toHaveBeenCalled();
      expect(mockSelect).toHaveBeenCalledWith('name description checklist');
      expect(mockLimit).toHaveBeenCalledWith(1);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Similar Task 1');
    });

    it('should limit results to specified count', async () => {
      const projectId = new Types.ObjectId();
      const mockExec = jest.fn().mockResolvedValue([]);
      const mockLimit = jest.fn().mockReturnValue({ exec: mockExec });
      mockTaskModel.find.mockReturnValue({
        select: jest.fn().mockReturnValue({ limit: mockLimit }),
      });

      await service.findSimilarTasksInProject(projectId.toString(), 'habit', 5);

      expect(mockLimit).toHaveBeenCalledWith(5);
    });

    it('should handle database errors gracefully', async () => {
      const projectId = new Types.ObjectId();
      mockTaskModel.find.mockImplementation(() => {
        throw new Error('DB error');
      });

      const result = await service.findSimilarTasksInProject(projectId.toString(), 'habit');

      expect(result).toEqual([]);
    });
  });
});
