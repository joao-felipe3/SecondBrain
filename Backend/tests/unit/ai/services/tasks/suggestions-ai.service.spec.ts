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

    it('should return mock suggestions on fallback when AI throws or returns invalid response', async () => {
      mockGeminiService.generateContent.mockRejectedValueOnce(new Error('AI Failure'));

      const result = await service.getTaskSuggestions({ projectName: 'Meu Projeto' });
      expect(result.isFallback).toBe(true);
      expect(result.suggestions.length).toBe(3);
    });
  });
});
