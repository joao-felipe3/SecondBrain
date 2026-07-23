import { Test, TestingModule } from '@nestjs/testing';
import { DependencyInferenceService } from '../../../../../src/tasks/services/dependencies/dependency-inference.service';
import { GeminiService } from '../../../../../src/ai/services/core/gemini.service';

describe('DependencyInferenceService', () => {
  let service: DependencyInferenceService;
  let geminiServiceMock: any;

  beforeEach(async () => {
    geminiServiceMock = {
      inferDependencies: jest.fn().mockResolvedValue([
        { taskId: 't-2', dependsOnTaskId: 't-1', relationship: 'FINISH_TO_START', confidence: 0.9 },
      ]),
      generateObject: jest.fn().mockResolvedValue({
        dependencies: [
          { taskId: 't-2', dependsOnTaskId: 't-1', relationship: 'FINISH_TO_START', confidence: 0.9 },
        ],
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DependencyInferenceService,
        { provide: GeminiService, useValue: geminiServiceMock },
      ],
    }).compile();

    service = module.get<DependencyInferenceService>(DependencyInferenceService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('inferHeuristicPhases', () => {
    it('deve inferir dependências usando heurística de fases', () => {
      const tasks: any[] = [
        { id: 't-1', name: 'Criar banco de dados' },
        { id: 't-2', name: 'Desenvolver API' },
        { id: 't-3', name: 'Testar API' },
      ];

      const result = service.inferHeuristicPhases(tasks);
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('inferWithAi', () => {
    it('deve retornar array vazio se houver menos de 2 tarefas', async () => {
      const result = await service.inferWithAi({
        requestId: 'req-1',
        tasks: [{ id: 't-1', name: 'Task 1' }],
      } as any);

      expect(result).toHaveLength(0);
    });

    it('deve inferir dependências via IA com pelo menos 2 tarefas', async () => {
      const result = await service.inferWithAi({
        requestId: 'req-1',
        tasks: [
          { id: 't-1', name: 'Criar DB' },
          { id: 't-2', name: 'Criar API' },
        ],
      } as any);

      expect(result).toBeDefined();
      expect(geminiServiceMock.inferDependencies).toHaveBeenCalled();
    });
  });

  describe('inferInterLeafWithAi', () => {
    it('deve retornar array vazio se houver menos de 2 folhas', async () => {
      const result = await service.inferInterLeafWithAi({
        requestId: 'req-1',
        projectId: 'p-1',
        leaves: [{ leafId: 'l-1', startGateId: 't-1', endGateId: 't-2' }],
      } as any);

      expect(result).toHaveLength(0);
    });

    it('deve inferir dependências inter-folhas via IA para 2+ folhas', async () => {
      const result = await service.inferInterLeafWithAi({
        requestId: 'req-1',
        projectId: 'p-1',
        leaves: [
          { leafId: 'l-1', startGateId: 't-1', endGateId: 't-2' },
          { leafId: 'l-2', startGateId: 't-3', endGateId: 't-4' },
        ],
      } as any);

      expect(result).toBeDefined();
      expect(geminiServiceMock.inferDependencies).toHaveBeenCalled();
    });
  });
});
