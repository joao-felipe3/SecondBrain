import { ChecklistAiService } from '@src/ai/services/tasks/checklist-ai.service';

describe('ChecklistAiService', () => {
  let service: ChecklistAiService;
  let mockConfigService: any;
  let mockGeminiService: any;

  beforeEach(() => {
    mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'REDIS_URL') return undefined;
        return undefined;
      }),
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

    it('should parse object array format from Gemini response', async () => {
      mockGeminiService.generateContent.mockResolvedValueOnce(
        JSON.stringify([{ item: 'Passo A' }, { item: 'Passo B' }, { item: 'Passo C' }]),
      );

      const items = await service.generateChecklistForTask({
        taskName: 'Task Obj',
        microTaskType: 'code',
      });

      expect(items).toEqual(['Passo A', 'Passo B', 'Passo C']);
    });

    it('should parse markdown code block response from Gemini', async () => {
      mockGeminiService.generateContent.mockResolvedValueOnce(
        '```json\n["Step 1", "Step 2", "Step 3"]\n```',
      );

      const items = await service.generateChecklistForTask({
        taskName: 'Task Md',
        microTaskType: 'code',
      });

      expect(items).toEqual(['Step 1', 'Step 2', 'Step 3']);
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

    it('should return fallback for complex task type on error', async () => {
      mockGeminiService.generateContent.mockRejectedValueOnce(new Error('AI Failure'));

      const items = await service.generateChecklistForTask({
        taskName: 'Tarefa Complexa',
        microTaskType: 'complex',
      });

      expect(items.length).toBe(4);
      expect(items[0]).toContain('Revisar requisitos');
    });

    it('should handle generateChecklistWithHistory with valid history', async () => {
      mockGeminiService.generateContent.mockResolvedValueOnce(
        JSON.stringify(['Passo H1', 'Passo H2', 'Passo H3']),
      );

      const items = await service.generateChecklistWithHistory({
        taskName: 'Tarefa Historica',
        microTaskType: 'complex',
        historicalContext: 'Contexto anterior de execucao',
      });

      expect(items.length).toBe(3);
    });

    it('should handle generateChecklistWithHistory fallback when history is missing', async () => {
      mockGeminiService.generateContent.mockResolvedValueOnce(
        JSON.stringify(['Passo H1', 'Passo H2', 'Passo H3']),
      );

      const items = await service.generateChecklistWithHistory({
        taskName: 'Tarefa Historica 2',
        microTaskType: 'complex',
      });

      expect(items.length).toBe(3);
    });
  });
});
