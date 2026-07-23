import { Test, TestingModule } from '@nestjs/testing';
import { SuggestionsAiService } from '../../../../../src/ai/services/tasks/suggestions-ai.service';
import { GeminiService } from '../../../../../src/ai/services/core/gemini.service';

describe('SuggestionsAiService', () => {
  let service: SuggestionsAiService;
  let geminiServiceMock: any;

  beforeEach(async () => {
    geminiServiceMock = {
      generateContent: jest.fn().mockResolvedValue(
        JSON.stringify({
          praise: 'Ótimo trabalho',
          learning: 'Aprendizado útil',
          nextStep: 'Próxima ação',
          finalText: 'Final',
          celebration: 'Celebração',
          validation: 'Validação',
          question: 'Pergunta',
          suggestion: 'Sugestão',
        }),
      ),
      supportsJsonMode: jest.fn().mockReturnValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SuggestionsAiService,
        { provide: GeminiService, useValue: geminiServiceMock },
      ],
    }).compile();

    service = module.get<SuggestionsAiService>(SuggestionsAiService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateTaskSuggestions', () => {
    it('deve chamar o geminiService para gerar sugestões de tarefas', async () => {
      const result = await service.generateTaskSuggestions({ projectName: 'Projeto X' });

      expect(result).toBeDefined();
      expect(geminiServiceMock.generateContent).toHaveBeenCalled();
    });
  });

  describe('generateCompletionFeedback', () => {
    it('deve gerar e estruturar o feedback de conclusão de tarefa', async () => {
      const resultJson = await service.generateCompletionFeedback({ taskName: 'Task 1' } as any);
      const parsed = JSON.parse(resultJson);

      expect(parsed.praise).toBe('Ótimo trabalho');
      expect(parsed.learning).toBe('Aprendizado útil');
    });
  });

  describe('generateCompletionFeedbackStructured', () => {
    it('deve retornar objeto estruturado com celebração, validação, pergunta e sugestão', async () => {
      const result = await service.generateCompletionFeedbackStructured('Prompt');

      expect(result.celebration).toBe('Celebração');
      expect(result.validation).toBe('Validação');
      expect(result.question).toBe('Pergunta');
      expect(result.suggestion).toBe('Sugestão');
    });
  });
});
