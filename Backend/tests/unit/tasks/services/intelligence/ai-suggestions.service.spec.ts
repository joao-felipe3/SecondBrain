import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { TasksAiSuggestionsService } from '../../../../../src/tasks/services/intelligence/ai-suggestions.service';
import { GeminiService } from '../../../../../src/ai/services/core/gemini.service';
import { TasksAiSuggestionsLoopRunner } from '../../../../../src/tasks/services/intelligence/ai-suggestions-runner.service';

describe('TasksAiSuggestionsService', () => {
  let service: TasksAiSuggestionsService;
  let mockTaskModel: {
    find: jest.Mock;
  };
  let mockGeminiService: {
    generateContent: jest.Mock;
    getTaskSuggestions?: jest.Mock;
  };
  let mockLoopRunner: {
    handleSuggestionsError: jest.Mock;
    runGenerationLoop: jest.Mock;
    runMultiBatchGenerationLoop?: jest.Mock;
  };

  beforeEach(async () => {
    mockTaskModel = {
      find: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([]),
        }),
        exec: jest.fn().mockResolvedValue([]),
      }),
    };

    mockGeminiService = {
      generateContent: jest.fn(),
      getTaskSuggestions: jest.fn().mockResolvedValue({
        suggestions: [{ name: 'Zero Hours Task', pomodoros: 2 }],
        isFallback: false,
      }),
    };

    mockLoopRunner = {
      handleSuggestionsError: jest.fn(),
      runGenerationLoop: jest.fn().mockResolvedValue({
        suggestions: [{ name: 'Task Sugerida', pomodorosPlanned: 2 }],
        totalHours: 1,
      }),
      runMultiBatchGenerationLoop: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksAiSuggestionsService,
        { provide: getModelToken('Task'), useValue: mockTaskModel },
        { provide: GeminiService, useValue: mockGeminiService },
        { provide: TasksAiSuggestionsLoopRunner, useValue: mockLoopRunner },
      ],
    }).compile();

    service = module.get<TasksAiSuggestionsService>(TasksAiSuggestionsService);
  });

  describe('generateAiSuggestions', () => {
    it('deve inicializar estado e gerar sugestoes', async () => {
      const dto = {
        projectId: 'proj-1',
        desiredHoursPerWeek: 10,
        deadline: '2026-06-01',
      };

      mockLoopRunner.runGenerationLoop = jest.fn().mockResolvedValue({
        suggestions: [{ name: 'Task Sugerida', pomodorosPlanned: 2 }],
        totalHours: 1,
      });

      const result = await service.generateAiSuggestions(dto as any);
      expect(result).toBeDefined();
    });
  });

  describe('generateAiSuggestionsWithProgress', () => {
    it('deve disparar callbacks de progresso e conclusao', async () => {
      const dto = {
        projectId: 'proj-1',
        desiredHoursPerWeek: 10,
      };

      const onProgress = jest.fn();
      const onComplete = jest.fn();
      const onError = jest.fn();

      await service.generateAiSuggestionsWithProgress({
        dto: dto as any,
        onProgress,
        onComplete,
        onError,
      });

      expect(onProgress).toHaveBeenCalled();
      expect(onComplete).toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
    });

    it('deve disparar callback onError se ocorrer uma excecao', async () => {
      mockTaskModel.find.mockImplementation(() => {
        throw new Error('Fatal error');
      });

      const onProgress = jest.fn();
      const onComplete = jest.fn();
      const onError = jest.fn();

      await service.generateAiSuggestionsWithProgress({
        dto: { projectId: 'proj-1' } as any,
        onProgress,
        onComplete,
        onError,
      });

      expect(onError).toHaveBeenCalled();
    });
  });
});
