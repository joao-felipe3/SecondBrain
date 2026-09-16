import {
  filterDuplicateSuggestions,
  calculateSuggestionsHours,
  buildSuggestionsProgress,
  buildSuggestionsResponse,
  createInitialState,
  calculateExistingTasksHoursAndNames,
  addSuggestionsToState,
} from '@src/tasks/services/intelligence/utils/ai-suggestions.utils';
import { SuggestionState } from '@src/tasks/interfaces';

describe('ai-suggestions.utils', () => {
  describe('filterDuplicateSuggestions', () => {
    it('should filter out suggestions that match existing task names (case and whitespace insensitive)', () => {
      const suggestions: any[] = [
        { name: '  TASK 1  ', pomodoros: 2 },
        { name: 'Task 2', pomodoros: 3 },
        { name: 'Task 3', pomodoros: 1 },
      ];
      const existing = ['task 1', 'Task 4'];

      const filtered = filterDuplicateSuggestions(suggestions, existing);
      expect(filtered.length).toBe(2);
      expect(filtered.map((t) => t.name)).toEqual(['Task 2', 'Task 3']);
    });

    it('should return all suggestions if existing task names list is empty', () => {
      const suggestions: any[] = [{ name: 'Task 1' }, { name: 'Task 2' }];
      const filtered = filterDuplicateSuggestions(suggestions, []);
      expect(filtered.length).toBe(2);
    });
  });

  describe('calculateSuggestionsHours', () => {
    it('should sum estimated hours based on pomodoros * 0.5', () => {
      const suggestions: any[] = [
        { name: 'Task 1', pomodoros: 4 }, // 2h
        { name: 'Task 2', pomodoros: 2 }, // 1h
        { name: 'Task 3' }, // undefined pomodoros -> 0h
      ];

      const hours = calculateSuggestionsHours(suggestions);
      expect(hours).toBe(3);
    });

    it('should return 0 for empty suggestions', () => {
      expect(calculateSuggestionsHours([])).toBe(0);
    });
  });

  describe('buildSuggestionsProgress and buildSuggestionsResponse', () => {
    const mockState: SuggestionState = {
      targetHours: 10,
      alreadyPlannedHours: 2,
      currentHours: 3,
      currentIteration: 1,
      maxIterations: 15,
      allSuggestions: [{ name: 'Task 1', pomodoros: 6 } as any],
      existingTaskNames: ['Task 1'],
    };

    it('should correctly format progress DTO', () => {
      const progress = buildSuggestionsProgress({
        state: mockState,
        status: 'loading',
        message: 'Gerando tarefas...',
      });

      expect(progress).toEqual({
        currentIteration: 1,
        maxIterations: 15,
        currentHours: 5, // 2 + 3
        targetHours: 10,
        tasksGenerated: 1,
        status: 'loading',
        message: 'Gerando tarefas...',
      });
    });

    it('should correctly format response DTO including suggestions and progress', () => {
      const response = buildSuggestionsResponse({
        state: mockState,
        status: 'success',
        message: 'Concluído com sucesso',
      });

      expect(response.suggestions).toBe(mockState.allSuggestions);
      expect(response.progress.status).toBe('success');
      expect(response.progress.message).toBe('Concluído com sucesso');
    });
  });

  describe('createInitialState', () => {
    it('should initialize state with provided targetHours', () => {
      const state = createInitialState({ targetHours: 8 } as any);
      expect(state.targetHours).toBe(8);
      expect(state.currentIteration).toBe(0);
      expect(state.maxIterations).toBe(15);
      expect(state.allSuggestions).toEqual([]);
      expect(state.existingTaskNames).toEqual([]);
    });

    it('should fallback targetHours to 0 if not provided or 0', () => {
      const state = createInitialState({} as any);
      expect(state.targetHours).toBe(0);
    });
  });

  describe('calculateExistingTasksHoursAndNames', () => {
    it('should calculate hours and extract names from existing tasks', () => {
      const existingTasks = [
        { name: 'Task Alpha', pomodorosPlanned: 4 }, // 2h
        { name: 'Task Beta' }, // undefined pomodorosPlanned -> 0h
        { name: 'Task Gamma', pomodorosPlanned: 2 }, // 1h
      ];

      const result = calculateExistingTasksHoursAndNames(existingTasks);
      expect(result.hours).toBe(3);
      expect(result.names).toEqual(['Task Alpha', 'Task Beta', 'Task Gamma']);
    });

    it('should handle empty task list', () => {
      const result = calculateExistingTasksHoursAndNames([]);
      expect(result.hours).toBe(0);
      expect(result.names).toEqual([]);
    });
  });

  describe('addSuggestionsToState', () => {
    it('should append suggestions, update existing names and increment currentHours', () => {
      const state: SuggestionState = {
        targetHours: 10,
        alreadyPlannedHours: 0,
        currentHours: 2,
        currentIteration: 1,
        maxIterations: 15,
        allSuggestions: [],
        existingTaskNames: ['Existing Task'],
      };

      const newSuggestions: any[] = [
        { name: 'New Task 1', pomodoros: 2 }, // 1h
        { name: 'New Task 2' }, // undefined pomodoros -> 0h
      ];

      addSuggestionsToState(state, newSuggestions);

      expect(state.allSuggestions.length).toBe(2);
      expect(state.existingTaskNames).toEqual(['Existing Task', 'New Task 1', 'New Task 2']);
      expect(state.currentHours).toBe(3); // 2 + 1 + 0
    });
  });
});
