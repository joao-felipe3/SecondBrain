import { Test, TestingModule } from '@nestjs/testing';
import { DependencyAiService } from '../../../../../src/ai/services/tasks/dependency-ai.service';
import { GeminiExecutorService } from '../../../../../src/ai/services/core/gemini-executor.service';

describe('DependencyAiService', () => {
  let service: DependencyAiService;
  let mockGeminiExecutor: {
    generateContent: jest.Mock;
  };

  beforeEach(async () => {
    mockGeminiExecutor = {
      generateContent: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [DependencyAiService, { provide: GeminiExecutorService, useValue: mockGeminiExecutor }],
    }).compile();

    service = module.get<DependencyAiService>(DependencyAiService);
  });

  describe('inferDependencies', () => {
    it('deve inferir dependencias em formato de objeto', async () => {
      const jsonResponse = JSON.stringify({
        dependencies: [
          {
            taskId: 'task-2',
            dependsOnTaskId: 'task-1',
            relationship: 'FINISH_TO_START',
            reason: 'Task 2 precisa de Task 1',
            confidence: 0.9,
          },
        ],
      });

      mockGeminiExecutor.generateContent.mockResolvedValue(jsonResponse);

      const result = await service.inferDependencies({
        prompt: 'Inspecionar dependencias',
        maxOutputTokens: 1000,
      });

      expect(result).toHaveLength(1);
      expect(result[0].taskId).toBe('task-2');
      expect(result[0].dependsOnTaskId).toBe('task-1');
      expect(result[0].confidence).toBe(0.9);
    });

    it('deve inferir dependencias em formato de tupla [taskId, dependsOnTaskId, relationship]', async () => {
      const jsonResponse = JSON.stringify({
        dependencies: [['task-3', 'task-2', 'START_TO_START']],
      });

      mockGeminiExecutor.generateContent.mockResolvedValue(jsonResponse);

      const result = await service.inferDependencies({
        prompt: 'Inspecionar tuplas',
        maxOutputTokens: 1000,
      });

      expect(result).toHaveLength(1);
      expect(result[0].taskId).toBe('task-3');
      expect(result[0].dependsOnTaskId).toBe('task-2');
      expect(result[0].relationship).toBe('START_TO_START');
    });
  });
});
