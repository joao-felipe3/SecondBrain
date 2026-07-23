import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { TasksAiSuggestionsService } from '../../../../../src/tasks/services/intelligence/ai-suggestions.service';
import { GeminiService } from '../../../../../src/ai/services/core/gemini.service';
import { TasksAiSuggestionsLoopRunner } from '../../../../../src/tasks/services/intelligence/ai-suggestions-runner.service';

describe('TasksAiSuggestionsService', () => {
  let service: TasksAiSuggestionsService;
  let mockTaskModel: any;
  let geminiServiceMock: any;
  let loopRunnerMock: any;

  beforeEach(async () => {
    mockTaskModel = {
      find: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([
            { name: 'Tarefa Existente 1', estimatedHours: 5 },
          ]),
        }),
      }),
    };

    geminiServiceMock = {
      generateContent: jest.fn().mockResolvedValue(
        JSON.stringify({
          suggestions: [
            { name: 'Sugestão 1', description: 'Desc 1', estimatedHours: 4, priority: 'alta' },
          ],
        }),
      ),
    };

    loopRunnerMock = {
      handleSuggestionsError: jest.fn().mockReturnValue({ suggestions: [], summary: 'Erro' }),
      executeGenerationLoop: jest.fn().mockResolvedValue({
        suggestions: [{ name: 'Sugestão 1', description: 'Desc 1', estimatedHours: 4, priority: 'alta' }],
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksAiSuggestionsService,
        { provide: getModelToken('Task'), useValue: mockTaskModel },
        { provide: GeminiService, useValue: geminiServiceMock },
        { provide: TasksAiSuggestionsLoopRunner, useValue: loopRunnerMock },
      ],
    }).compile();

    service = module.get<TasksAiSuggestionsService>(TasksAiSuggestionsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateAiSuggestions', () => {
    it('deve gerar sugestões de tarefas usando o serviço de IA', async () => {
      const dto: any = { projectDescription: 'Sistema de e-commerce', availableHours: 20 };
      const result = await service.generateAiSuggestions(dto);

      expect(result).toBeDefined();
    });
  });

  describe('generateAiSuggestionsWithProgress', () => {
    it('deve emitir progresso e chamar onComplete ao finalizar', async () => {
      const dto: any = { projectDescription: 'Sistema de e-commerce', availableHours: 20 };
      const onProgress = jest.fn();
      const onComplete = jest.fn();
      const onError = jest.fn();

      await service.generateAiSuggestionsWithProgress({ dto, onProgress, onComplete, onError });

      expect(onComplete).toHaveBeenCalled();
      expect(onProgress).toHaveBeenCalled();
    });
  });
});
