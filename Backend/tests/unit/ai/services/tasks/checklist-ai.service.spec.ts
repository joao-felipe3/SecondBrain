import { ChecklistAiService } from '@src/ai/services/tasks/checklist-ai.service';

describe('ChecklistAiService', () => {
  let service: ChecklistAiService;
  let mockConfigService: any;
  let mockGeminiService: any;

  beforeEach(() => {
    mockConfigService = {
      get: jest.fn().mockReturnValue(undefined),
    };
    mockGeminiService = {
      generateContent: jest.fn(),
    };

    service = new ChecklistAiService(mockConfigService, mockGeminiService);
  });

  describe('generateChecklistForTask & generateChecklistWithHistory', () => {
    it('should generate checklist items using Gemini and cache them in memory', async () => {
      mockGeminiService.generateContent.mockResolvedValueOnce(
        JSON.stringify(['Passo 1', 'Passo 2', 'Passo 3']),
      );

      const items = await service.generateChecklistForTask({
        taskName: 'Criar API Rest',
        microTaskType: 'code',
      });

      expect(items).toEqual(['Passo 1', 'Passo 2', 'Passo 3']);

      // Second call should return cached result without hitting AI again
      const cachedItems = await service.generateChecklistForTask({
        taskName: 'Criar API Rest',
        microTaskType: 'code',
      });
      expect(cachedItems).toEqual(['Passo 1', 'Passo 2', 'Passo 3']);
      expect(mockGeminiService.generateContent).toHaveBeenCalledTimes(1);
    });

    it('should return fallback checklist when AI throws error', async () => {
      mockGeminiService.generateContent.mockRejectedValueOnce(new Error('AI Failure'));

      const items = await service.generateChecklistForTask({
        taskName: 'Tarefa Habito',
        microTaskType: 'habit',
      });

      expect(items.length).toBe(3);
      expect(items[0]).toContain('Preparar ambiente');
    });

    it('should handle generateChecklistWithHistory fallback when history is missing', async () => {
      mockGeminiService.generateContent.mockResolvedValueOnce(
        JSON.stringify(['Passo H1', 'Passo H2', 'Passo H3']),
      );

      const items = await service.generateChecklistWithHistory({
        taskName: 'Tarefa Historica',
        microTaskType: 'complex',
      });

      expect(items.length).toBe(3);
    });
  });
});
