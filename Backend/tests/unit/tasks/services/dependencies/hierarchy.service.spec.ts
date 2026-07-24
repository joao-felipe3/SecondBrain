import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { TasksHierarchyService } from '../../../../../src/tasks/services/dependencies/hierarchy.service';

describe('TasksHierarchyService', () => {
  let service: TasksHierarchyService;
  let mockTaskModel: {
    findById: jest.Mock;
    find: jest.Mock;
  };

  const validTaskId = new Types.ObjectId().toString();
  const validParentId = new Types.ObjectId().toString();

  beforeEach(async () => {
    mockTaskModel = {
      findById: jest.fn(),
      find: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [TasksHierarchyService, { provide: getModelToken('Task'), useValue: mockTaskModel }],
    }).compile();

    service = module.get<TasksHierarchyService>(TasksHierarchyService);
  });

  describe('getTaskLineage', () => {
    it('deve rejeitar ID invalido', async () => {
      await expect(service.getTaskLineage('invalid-id')).rejects.toThrow(BadRequestException);
    });

    it('deve lancar NotFoundException se tarefa nao for encontrada', async () => {
      mockTaskModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(service.getTaskLineage(validTaskId)).rejects.toThrow(NotFoundException);
    });

    it('deve retornar ancestrais e filhos da tarefa', async () => {
      const mockParent = {
        _id: validParentId,
        name: 'Parent Task',
        status: 'doing',
        parentTaskId: null,
      };
      const mockTask = { _id: validTaskId, name: 'Current Task', parentTaskId: validParentId };
      const mockChildren = [{ _id: 'child-1', name: 'Child Task', status: 'todo' }];

      mockTaskModel.findById
        .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(mockTask) })
        .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(mockParent) });

      mockTaskModel.find.mockReturnValue({
        select: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(mockChildren),
        }),
      });

      const lineage = await service.getTaskLineage(validTaskId);

      expect(lineage.ancestors).toHaveLength(1);
      expect(lineage.ancestors[0].name).toBe('Parent Task');
      expect(lineage.children).toHaveLength(1);
      expect(lineage.children[0].name).toBe('Child Task');
    });
  });

  describe('getDescendants', () => {
    it('deve percorrer e retornar todos os descendentes', async () => {
      const mockTask = { _id: validTaskId, name: 'Root Task' };
      const mockChild1 = {
        _id: 'c1',
        name: 'Child 1',
        status: 'done',
        experience: 50,
        isConcluded: true,
      };

      mockTaskModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockTask),
      });

      mockTaskModel.find
        .mockReturnValueOnce({
          select: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue([mockChild1]),
          }),
        })
        .mockReturnValueOnce({
          select: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue([]),
          }),
        });

      const descendants = await service.getDescendants(validTaskId);
      expect(descendants).toHaveLength(1);
      expect(descendants[0].name).toBe('Child 1');
    });
  });

  describe('calculateValueContribution', () => {
    it('deve calcular a porcentagem de contribuicao da subarvore', async () => {
      const mockTask = { _id: validTaskId, name: 'Subtree Task', experience: 50, isConcluded: true };

      mockTaskModel.findById.mockReturnValue({
        select: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(mockTask),
        }),
        exec: jest.fn().mockResolvedValue(mockTask),
      });

      mockTaskModel.find.mockReturnValue({
        select: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([]),
        }),
      });

      const result = await service.calculateValueContribution(validTaskId);
      expect(result.contributionPercent).toBeDefined();
      expect(result.subtreeCompletedXP).toBe(50);
      expect(result.totalCompletedXP).toBe(50);
    });
  });
});
