import { Test, TestingModule } from '@nestjs/testing';
import { DependencyInferenceService } from '../../../../../src/tasks/services/dependencies/dependency-inference.service';
import { GeminiService } from '../../../../../src/ai/services/core/gemini.service';

describe('DependencyInferenceService', () => {
  let service: DependencyInferenceService;
  let mockGeminiService: {
    inferDependencies: jest.Mock;
  };

  beforeEach(async () => {
    mockGeminiService = {
      inferDependencies: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DependencyInferenceService,
        { provide: GeminiService, useValue: mockGeminiService },
      ],
    }).compile();

    service = module.get<DependencyInferenceService>(DependencyInferenceService);
  });

  describe('inferHeuristicPhases', () => {
    it('deve inferir dependencias heurísticas entre tarefas com fases ou metadados', () => {
      const tasks = [
        { id: '1', name: 'Fase 1: Requisitos', phase: 'Planning' },
        { id: '2', name: 'Fase 2: Desenvolvimento', phase: 'Execution' },
      ];

      const result = service.inferHeuristicPhases(tasks as any);
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('inferWithAi', () => {
    it('deve retornar array vazio se houver menos de 2 tarefas', async () => {
      const result = await service.inferWithAi({ tasks: [{ id: '1', name: 'Task 1' }] } as any);
      expect(result).toEqual([]);
    });

    it('deve chamar geminiService e retornar dependencias aciclicas filtradas', async () => {
      const tasks = [
        { id: 't1', name: 'Task 1' },
        { id: 't2', name: 'Task 2' },
      ];

      mockGeminiService.inferDependencies.mockResolvedValue([
        { taskId: 't2', dependsOnTaskId: 't1', relationship: 'FINISH_TO_START' },
      ]);

      const result = await service.inferWithAi({
        requestId: 'req-1',
        tasks: tasks as any,
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(
        expect.objectContaining({ taskId: 't2', dependsOnTaskId: 't1' }),
      );
      expect(mockGeminiService.inferDependencies).toHaveBeenCalledTimes(1);
    });

    it('deve tentar retry se a tentativa inicial falhar', async () => {
      const tasks = [
        { id: 't1', name: 'Task 1' },
        { id: 't2', name: 'Task 2' },
      ];

      mockGeminiService.inferDependencies
        .mockRejectedValueOnce(new Error('AI error'))
        .mockResolvedValueOnce([
          { taskId: 't2', dependsOnTaskId: 't1', relationship: 'FINISH_TO_START' },
        ]);

      const result = await service.inferWithAi({
        requestId: 'req-retry',
        tasks: tasks as any,
      });

      expect(result).toHaveLength(1);
      expect(mockGeminiService.inferDependencies).toHaveBeenCalledTimes(2);
    });
  });

  describe('inferInterLeafWithAi', () => {
    it('deve retornar array vazio se houver menos de 2 folhagens (leaves)', async () => {
      const result = await service.inferInterLeafWithAi({
        projectId: 'proj-1',
        leaves: [{ leafId: 'l1', startGateId: 'g1', endGateId: 'g2' }] as any,
      });
      expect(result).toEqual([]);
    });

    it('deve inferir dependencias entre gates de folhas via IA', async () => {
      const leaves = [
        { leafId: 'l1', startGateId: 'g1', endGateId: 'g2', leafName: 'Leaf 1' },
        { leafId: 'l2', startGateId: 'g3', endGateId: 'g4', leafName: 'Leaf 2' },
      ];

      mockGeminiService.inferDependencies.mockResolvedValue([
        { successor: 'g3', predecessor: 'g2', type: 'FS', lag: 0 },
      ]);

      const result = await service.inferInterLeafWithAi({
        projectId: 'proj-1',
        requestId: 'req-leaf',
        leaves: leaves as any,
      });

      expect(mockGeminiService.inferDependencies).toHaveBeenCalled();
      expect(Array.isArray(result)).toBe(true);
    });
  });
});
