import { Test, TestingModule } from '@nestjs/testing';
import { GeminiService } from '../../../../../src/ai/services/core/gemini.service';
import { GeminiExecutorService } from '../../../../../src/ai/services/core/gemini-executor.service';
import { ChecklistAiService } from '../../../../../src/ai/services/tasks/checklist-ai.service';
import { PertAiService } from '../../../../../src/ai/services/tasks/pert-ai.service';
import { SuggestionsAiService } from '../../../../../src/ai/services/tasks/suggestions-ai.service';
import { DependencyAiService } from '../../../../../src/ai/services/tasks/dependency-ai.service';

describe('GeminiService', () => {
  let service: GeminiService;
  let executorMock: any;
  let checklistMock: any;
  let pertMock: any;
  let suggestionsMock: any;
  let dependencyMock: any;

  beforeEach(async () => {
    executorMock = {
      generateEmbedding: jest.fn().mockResolvedValue([0.1, 0.2]),
      generateContent: jest.fn().mockResolvedValue('Resposta'),
      supportsJsonMode: jest.fn().mockReturnValue(true),
      getModelName: jest.fn().mockReturnValue('gemini-2.5-flash'),
      getStrongModelName: jest.fn().mockReturnValue('gemini-2.5-pro'),
    };

    checklistMock = {
      generateChecklistForTask: jest.fn().mockResolvedValue(['Passo 1']),
      generateChecklistWithHistory: jest.fn().mockResolvedValue(['Passo Histórico']),
    };

    pertMock = {
      suggestPertEstimates: jest.fn().mockResolvedValue({ optimistic: 1, likely: 2, pessimistic: 3 }),
    };

    suggestionsMock = {
      generateTaskSuggestions: jest.fn().mockResolvedValue('Sugestões'),
      generateCompletionFeedback: jest.fn().mockResolvedValue('Feedback'),
      generateCompletionFeedbackStructured: jest.fn().mockResolvedValue({ celebration: 'Parabéns' }),
      generateNextSteps: jest.fn().mockResolvedValue([{ title: 'Passo 1' }]),
      getTaskSuggestions: jest.fn().mockResolvedValue({ suggestions: [], isFallback: false }),
      generateMockSuggestions: jest.fn().mockReturnValue(['Mock 1']),
    };

    dependencyMock = {
      inferDependencies: jest.fn().mockResolvedValue([{ taskId: 't1' }]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GeminiService,
        { provide: GeminiExecutorService, useValue: executorMock },
        { provide: ChecklistAiService, useValue: checklistMock },
        { provide: PertAiService, useValue: pertMock },
        { provide: SuggestionsAiService, useValue: suggestionsMock },
        { provide: DependencyAiService, useValue: dependencyMock },
      ],
    }).compile();

    service = module.get<GeminiService>(GeminiService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('deve delegar chamadas para os serviços especializados de IA', async () => {
    await service.generateChecklistForTask({ taskName: 'T1' });
    expect(checklistMock.generateChecklistForTask).toHaveBeenCalled();

    await service.suggestPertEstimates({ taskName: 'T1' } as any);
    expect(pertMock.suggestPertEstimates).toHaveBeenCalled();

    await service.generateTaskSuggestions({ projectName: 'P1' });
    expect(suggestionsMock.generateTaskSuggestions).toHaveBeenCalled();

    await service.inferDependencies({ prompt: 'prompt', maxOutputTokens: 100 });
    expect(dependencyMock.inferDependencies).toHaveBeenCalled();

    await service.generateContent('Prompt');
    expect(executorMock.generateContent).toHaveBeenCalledWith('Prompt', undefined);

    expect(service.getModelName()).toBe('gemini-2.5-flash');
    expect(service.getStrongModelName()).toBe('gemini-2.5-pro');
  });
});
