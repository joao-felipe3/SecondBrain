import { TasksAiSuggestionsLoopRunner } from '@src/tasks/services/intelligence/ai-suggestions-runner.service';

describe('TasksAiSuggestionsLoopRunner', () => {
  let runner: TasksAiSuggestionsLoopRunner;
  let mockTaskModel: any;
  let mockGeminiService: any;

  beforeEach(() => {
    jest.setTimeout(15000);
    mockTaskModel = {};
    mockGeminiService = {
      getTaskSuggestions: jest.fn(),
      generateMockSuggestions: jest.fn().mockReturnValue([
        { name: 'Mock 1', pomodoros: 2, priority: 2, difficulty: 2, selected: false },
      ]),
    };

    runner = new TasksAiSuggestionsLoopRunner(mockTaskModel as any, mockGeminiService as any);
  });

  describe('runMultiBatchGenerationLoop', () => {
    it('should loop until target hours are satisfied and invoke progress callback', async () => {
      mockGeminiService.getTaskSuggestions.mockResolvedValue({
        suggestions: [
          { name: 'Sug 1', pomodoros: 4, priority: 2, difficulty: 2, selected: false },
          { name: 'Sug 2', pomodoros: 4, priority: 2, difficulty: 2, selected: false },
        ],
        isFallback: false,
      });

      const state: any = {
        currentIteration: 0,
        maxIterations: 3,
        currentHours: 0,
        allSuggestions: [],
        existingTaskNames: [],
      };
      const onProgress = jest.fn();

      await runner.runMultiBatchGenerationLoop({
        dto: { projectName: 'Test' } as any,
        state,
        remainingHours: 4,
        onProgress,
      });

      expect(state.allSuggestions.length).toBeGreaterThan(0);
      expect(onProgress).toHaveBeenCalled();
    });

    it(
      'should break loop early if AI returns empty or duplicate suggestions',
      async () => {
        mockGeminiService.getTaskSuggestions.mockResolvedValue({
          suggestions: [],
          isFallback: false,
        });

        const state: any = {
          currentIteration: 0,
          maxIterations: 3,
          currentHours: 0,
          allSuggestions: [],
          existingTaskNames: [],
        };

        await runner.runMultiBatchGenerationLoop({
          dto: { projectName: 'Test' } as any,
          state,
          remainingHours: 10,
        });

        expect(state.currentIteration).toBe(state.maxIterations);
      },
      15000,
    );
  });

  describe('handleSuggestionsError', () => {
    it('should return partial response if suggestions exist in state', () => {
      const state: any = {
        allSuggestions: [{ name: 'Existing' }],
      };
      const res = runner.handleSuggestionsError({
        error: new Error('API Error'),
        dto: { projectName: 'Test' } as any,
        state,
      });

      expect(res.progress.status).toBe('partial');
    });

    it('should use fallback mock suggestions when no suggestions exist', () => {
      const state: any = {
        allSuggestions: [],
        existingTaskNames: [],
      };
      const res = runner.handleSuggestionsError({
        error: new Error('API Error'),
        dto: { projectName: 'Test' } as any,
        state,
      });

      expect(res.progress.status).toBe('error');
      expect(state.allSuggestions.length).toBe(1);
    });
  });
});
