import { SuggestionsAiService } from '@src/ai/services/tasks/suggestions-ai.service';

describe('SuggestionsAiService', () => {
  let service: SuggestionsAiService;
  let mockGeminiService: any;

  beforeEach(() => {
    mockGeminiService = {
      generateContent: jest.fn(),
      supportsJsonMode: jest.fn().mockReturnValue(true),
    };
    service = new SuggestionsAiService(mockGeminiService);
  });

  describe('generateTaskSuggestions & generateCompletionFeedback', () => {
    it('should call generateTaskSuggestions directly', async () => {
      mockGeminiService.generateContent.mockResolvedValueOnce('ai raw suggestions');
      const raw = await service.generateTaskSuggestions({ projectName: 'P1' } as any);
      expect(raw).toBe('ai raw suggestions');
    });

    it('should generate completion feedback JSON string', async () => {
      mockGeminiService.generateContent.mockResolvedValueOnce(
        JSON.stringify({
          praise: 'Great job!',
          learning: 'Learned TDD',
          nextStep: 'Push changes',
        }),
      );

      const feedback = await service.generateCompletionFeedback({ taskName: 'Task 1' } as any);
      const parsed = JSON.parse(feedback);

      expect(parsed.praise).toBe('Great job!');
      expect(parsed.learning).toBe('Learned TDD');
    });

    it('should handle generateCompletionFeedback when JSON parsing fails', async () => {
      mockGeminiService.generateContent.mockResolvedValueOnce('Non-JSON text feedback');

      const feedback = await service.generateCompletionFeedback({ taskName: 'Task 1' } as any);
      const parsed = JSON.parse(feedback);

      expect(parsed.finalText).toBe('Non-JSON text feedback');
    });

    it('should generate structured completion feedback', async () => {
      mockGeminiService.generateContent.mockResolvedValueOnce(
        JSON.stringify({
          celebration: 'Parabéns!',
          validation: 'Validação OK',
          question: 'Próximo passo?',
          suggestion: 'Refatorar',
        }),
      );

      const struct = await service.generateCompletionFeedbackStructured('prompt text');
      expect(struct.celebration).toBe('Parabéns!');
      expect(struct.question).toBe('Próximo passo?');
    });

    it('should generate next steps array', async () => {
      mockGeminiService.generateContent.mockResolvedValueOnce(
        JSON.stringify([{ title: 'Next 1', description: 'Desc 1' }]),
      );

      const steps = await service.generateNextSteps({ taskName: 'Task 1' } as any);
      expect(steps.length).toBe(1);
      expect(steps[0].title).toBe('Next 1');
    });

    it('should return fallback next steps when AI fails', async () => {
      mockGeminiService.generateContent.mockRejectedValueOnce(new Error('Next steps AI fail'));

      const steps = await service.generateNextSteps({ taskName: 'Task Fallback' } as any);
      expect(steps.length).toBe(1);
      expect(steps[0].title).toContain('Task Fallback');
    });

    it('should return parsed suggestions when getTaskSuggestions succeeds', async () => {
      mockGeminiService.generateContent.mockResolvedValueOnce(
        JSON.stringify([{ name: 'S1', pomodoros: 2, priority: 1, difficulty: 2, selected: true }]),
      );

      const result = await service.getTaskSuggestions({ projectName: 'Meu Projeto' });
      expect(result.isFallback).toBe(false);
      expect(result.suggestions[0].name).toBe('S1');
    });

    it('should return mock suggestions on fallback when AI throws or returns invalid response', async () => {
      mockGeminiService.generateContent.mockRejectedValueOnce(new Error('AI Failure'));

      const result = await service.getTaskSuggestions({ projectName: 'Meu Projeto' });
      expect(result.isFallback).toBe(true);
      expect(result.suggestions.length).toBe(3);
    });
  });
});
