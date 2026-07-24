import { TasksInputService } from '@src/tasks/services/workflow/input.service';
import { BadRequestException } from '@nestjs/common';

describe('TasksInputService', () => {
  let service: TasksInputService;

  beforeEach(() => {
    service = new TasksInputService();
  });

  describe('validatePertInput', () => {
    it('should do nothing if all PERT values are undefined', () => {
      expect(() => service.validatePertInput({})).not.toThrow();
    });

    it('should throw BadRequestException if PERT is partially provided', () => {
      expect(() =>
        service.validatePertInput({ pertOptimisticMinutes: 30, pertMostLikelyMinutes: 60 }),
      ).toThrow(BadRequestException);
    });

    it('should throw BadRequestException if PERT values are non-positive', () => {
      expect(() =>
        service.validatePertInput({
          pertOptimisticMinutes: -10,
          pertMostLikelyMinutes: 60,
          pertPessimisticMinutes: 120,
        }),
      ).toThrow(BadRequestException);
    });

    it('should throw BadRequestException if PERT values are out of order', () => {
      expect(() =>
        service.validatePertInput({
          pertOptimisticMinutes: 60,
          pertMostLikelyMinutes: 30,
          pertPessimisticMinutes: 120,
        }),
      ).toThrow(BadRequestException);
    });

    it('should validate valid PERT input', () => {
      expect(() =>
        service.validatePertInput({
          pertOptimisticMinutes: 30,
          pertMostLikelyMinutes: 60,
          pertPessimisticMinutes: 120,
        }),
      ).not.toThrow();
    });
  });

  describe('normalizeChecklist', () => {
    it('should return undefined for empty or invalid checklist', () => {
      expect(service.normalizeChecklist(undefined)).toBeUndefined();
      expect(service.normalizeChecklist([])).toBeUndefined();
      expect(service.normalizeChecklist(['   '])).toBeUndefined();
    });

    it('should normalize string items', () => {
      const res = service.normalizeChecklist(['Step 1', 'Step 2']);
      expect(res).toEqual([
        { item: 'Step 1', completed: false, order: 0 },
        { item: 'Step 2', completed: false, order: 1 },
      ]);
    });

    it('should normalize item object DTOs', () => {
      const res = service.normalizeChecklist([
        { item: 'Step A', completed: true, order: 0 },
        { item: 'Step B', completed: false, order: 1 },
        null as any,
      ]);

      expect(res).toEqual([
        { item: 'Step A', completed: true, order: 0 },
        { item: 'Step B', completed: false, order: 1 },
      ]);
    });
  });
});
