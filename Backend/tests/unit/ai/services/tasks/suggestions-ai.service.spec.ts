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
      const raw = await service.generateTaskSuggestions({ projectName: 'P1' });
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

      const feedback = await service.generateCompletionFeedback({ taskName: 'Task 1' });
      const parsed = JSON.parse(feedback);

      expect(parsed.praise).toBe('Great job!');
      expect(parsed.learning).toBe('Learned TDD');
    });

    it('should handle generateCompletionFeedback when JSON parsing fails', async () => {
      mockGeminiService.generateContent.mockResolvedValueOnce('Non-JSON text feedback');

      const feedback = await service.generateCompletionFeedback({ taskName: 'Task 1' });
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

      const steps = await service.generateNextSteps({ taskName: 'Task 1' });
      expect(steps.length).toBe(1);
      expect(steps[0].title).toBe('Next 1');
    });

    it('should return fallback next steps when AI fails', async () => {
      mockGeminiService.generateContent.mockRejectedValueOnce(new Error('Next steps AI fail'));

      const steps = await service.generateNextSteps({ taskName: 'Task Fallback' });
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

    it('should return model name from gemini executor', () => {
      mockGeminiService.getModelName = jest.fn().mockReturnValue('gemini-2.5-flash');
      expect(service.getModelName()).toBe('gemini-2.5-flash');
    });

    it('should handle generateCompletionFeedback with non-string fields and non-string raw input', async () => {
      mockGeminiService.generateContent.mockResolvedValueOnce(
        JSON.stringify({
          praise: null,
          learning: 123,
          nextStep: undefined,
          finalText: 456,
        }),
      );

      const feedback = await service.generateCompletionFeedback({ taskName: 'T' });
      const parsed = JSON.parse(feedback);
      expect(parsed.praise).toBe('');
      expect(parsed.learning).toBe('');
      expect(parsed.finalText).toBe('');

      // When raw is non-string or fails to parse
      mockGeminiService.generateContent.mockResolvedValueOnce(null);
      const feedbackNull = await service.generateCompletionFeedback({ taskName: 'T' });
      const parsedNull = JSON.parse(feedbackNull);
      expect(parsedNull.finalText).toBe('');
    });

    it('should handle generateCompletionFeedbackStructured with fallback keys and without json mode support', async () => {
      mockGeminiService.supportsJsonMode.mockReturnValue(false);
      mockGeminiService.generateContent.mockResolvedValueOnce(
        JSON.stringify({
          praise: 'Celebrated fallback',
          learning: 'Validated fallback',
          nextStep: 'Next step fallback',
          finalText: 'Suggestion fallback',
        }),
      );

      const struct = await service.generateCompletionFeedbackStructured('prompt');
      expect(struct.celebration).toBe('Celebrated fallback');
      expect(struct.validation).toBe('Validated fallback');
      expect(struct.question).toBe('Next step fallback');
      expect(struct.suggestion).toBe('Suggestion fallback');
    });

    it('should handle generateNextSteps with items missing titles and when json mode is disabled', async () => {
      mockGeminiService.supportsJsonMode.mockReturnValue(false);
      mockGeminiService.generateContent.mockResolvedValueOnce(
        JSON.stringify([
          { title: 'Step 1', description: null },
          { title: '', description: 'No title' },
          { title: 123, description: 'Non-string title' },
        ]),
      );

      const steps = await service.generateNextSteps({ taskName: 'Task' });
      expect(steps.length).toBe(1);
      expect(steps[0].title).toBe('Step 1');
      expect(steps[0].description).toBe('');

      // When parsed is an object instead of array
      mockGeminiService.generateContent.mockResolvedValueOnce(JSON.stringify({ notAnArray: true }));
      const fallbackSteps = await service.generateNextSteps({ taskName: 'Task Object' });
      expect(fallbackSteps[0].title).toContain('Task Object');
    });

    it('should handle getTaskSuggestions when AI returns non-array and with item fallbacks', async () => {
      // Non-array returns fallback
      mockGeminiService.generateContent.mockResolvedValueOnce(JSON.stringify({}));
      const resFallback = await service.getTaskSuggestions({ projectName: '' });
      expect(resFallback.isFallback).toBe(true);
      expect(resFallback.suggestions[0].name).toContain('Projeto');

      // Array with missing/invalid fields
      mockGeminiService.generateContent.mockResolvedValueOnce(
        JSON.stringify([
          {
            name: null,
            deadline: '2026-12-31',
            pomodoros: 'invalid',
            priority: 'invalid',
            difficulty: 'invalid',
            selected: 1,
          },
        ]),
      );

      const resParsed = await service.getTaskSuggestions({ projectName: 'Custom Proj' });
      expect(resParsed.isFallback).toBe(false);
      expect(resParsed.suggestions[0].name).toBe('');
      expect(resParsed.suggestions[0].deadline).toBe('2026-12-31');
      expect(resParsed.suggestions[0].pomodoros).toBe(0);
      expect(resParsed.suggestions[0].selected).toBe(true);
    });

    it('should test safeParseJson fallback mechanisms', () => {
      const safeParse = (service as any).safeParseJson.bind(service);

      expect(safeParse('')).toBeNull();
      expect(safeParse(null)).toBeNull();

      // Markdown wrapped JSON -> extractJsonObject
      const markdownJson = 'Here is the json:\n```json\n{"key": "value"}\n```';
      expect(safeParse(markdownJson)).toEqual({ key: 'value' });

      // Raw string with embedded array of numbers matched by regex
      const textWithArray = 'Leading text [1, 2, 3] trailing text';
      expect(safeParse(textWithArray)).toEqual([1, 2, 3]);

      // String matching regex bracket but invalid json inside
      const brokenRegex = 'Leading [ bad, json, 123 ]';
      expect(safeParse(brokenRegex)).toBeNull();
    });
  });
});
