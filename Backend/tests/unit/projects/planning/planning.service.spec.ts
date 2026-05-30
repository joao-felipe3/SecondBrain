import { Test, TestingModule } from '@nestjs/testing';
import { PlanningService } from '../../../../src/projects/planning/planning.service';
import { GeminiService } from '../../../../src/ai/gemini.service';

describe('PlanningService', () => {
  let service: PlanningService;
  let geminiService: jest.Mocked<GeminiService>;

  beforeEach(async () => {
    const mockGeminiService = {
      generateContent: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlanningService,
        {
          provide: GeminiService,
          useValue: mockGeminiService,
        },
      ],
    }).compile();

    service = module.get<PlanningService>(PlanningService);
    geminiService = module.get(GeminiService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('startCatchball', () => {
    it('should generate catchball questions', async () => {
      const mockQuestions = [
        'Qual é o público-alvo?',
        'Qual é o prazo desejado?',
        'Quais são as funcionalidades principais?',
      ];

      geminiService.generateContent.mockResolvedValue(JSON.stringify(mockQuestions));

      const projectData = {
        projectName: 'E-commerce Platform',
        projectDescription: 'Criar um e-commerce',
        shortTermGoal: 'MVP em 1 mês',
        midTermGoal: 'Lançamento em 3 meses',
        longTermGoal: 'Escalar para 10k usuários',
      };

      const result = await service.startCatchball(projectData);

      expect(result.questions).toEqual(mockQuestions);
      expect(result.conversationId).toBeDefined();
      expect(geminiService.generateContent).toHaveBeenCalledWith(
        expect.stringContaining('E-commerce Platform'),
      );
    });

    it('should handle JSON with code blocks', async () => {
      const mockQuestions = ['Pergunta 1', 'Pergunta 2'];
      const responseWithCodeBlock = `\`\`\`json\n${JSON.stringify(mockQuestions)}\n\`\`\``;

      geminiService.generateContent.mockResolvedValue(responseWithCodeBlock);

      const projectData = {
        projectName: 'Test Project',
        projectDescription: 'Test description',
      };

      const result = await service.startCatchball(projectData);

      expect(result.questions).toEqual(mockQuestions);
    });

    it('should use fallback questions on parse error', async () => {
      geminiService.generateContent.mockResolvedValue('Invalid JSON');

      const projectData = {
        projectName: 'Test Project',
        projectDescription: 'Test description',
      };

      const result = await service.startCatchball(projectData);

      expect(result.questions).toHaveLength(5);
      expect(result.questions[0]).toContain('público-alvo');
    });
  });

  describe('suggestAnswer', () => {
    it('should generate a suggested answer for a question', async () => {
      const mockSuggestion = 'Sugestão de resposta baseada na pergunta';

      geminiService.generateContent.mockResolvedValue(
        JSON.stringify({ suggestedAnswer: mockSuggestion }),
      );

      const result = await service.suggestAnswer('conv_123', 0, 'Qual é o público-alvo?', []);

      expect(result).toBe(mockSuggestion);
      expect(geminiService.generateContent).toHaveBeenCalled();
    });

    it('should include previous answers in context', async () => {
      const mockSuggestion = 'Resposta baseada no contexto';

      geminiService.generateContent.mockResolvedValue(
        JSON.stringify({ suggestedAnswer: mockSuggestion }),
      );

      const previousAnswers = ['Resposta 1', 'Resposta 2'];
      const result = await service.suggestAnswer('conv_123', 2, 'Próxima pergunta', previousAnswers);

      expect(result).toBe(mockSuggestion);
      expect(geminiService.generateContent).toHaveBeenCalledWith(expect.stringContaining('Resposta 1'));
    });
  });
  it('should generate SMART objectives from answers', async () => {
    const mockSmart = {
      specific: 'Criar e-commerce com 500 produtos',
      measurable: '500 produtos catalogados, 1000 visitas/dia',
      achievable: 'Com 2 devs em 3 meses é viável',
      relevant: 'Expande presença online da empresa',
      temporal: 'Lançamento em 30/06/2026',
      summary: 'E-commerce para vender produtos artesanais',
      risks: ['Integração de pagamento', 'Prazo apertado'],
    };

    geminiService.generateContent.mockResolvedValue(JSON.stringify(mockSmart));

    const conversationId = 'conv_123';
    const answers = ['Público geral', '3 meses', 'Catálogo + carrinho'];

    const result = await service.generateSmartObjective(conversationId, answers);

    expect(result).toEqual(mockSmart);
    expect(geminiService.generateContent).toHaveBeenCalledWith(expect.stringContaining(answers[0]));
  });

  it('should handle JSON with code blocks', async () => {
    const mockSmart = {
      specific: 'Test',
      measurable: 'Test',
      achievable: 'Test',
      relevant: 'Test',
      temporal: 'Test',
      summary: 'Test',
      risks: [],
    };

    const responseWithCodeBlock = `\`\`\`json\n${JSON.stringify(mockSmart)}\n\`\`\``;
    geminiService.generateContent.mockResolvedValue(responseWithCodeBlock);

    const result = await service.generateSmartObjective('conv_123', ['answer']);

    expect(result.specific).toBe('Test');
  });

  it('should throw error on invalid response', async () => {
    geminiService.generateContent.mockResolvedValue('Invalid JSON');

    await expect(service.generateSmartObjective('conv_123', ['answer'])).rejects.toThrow(
      'Não foi possível processar o objetivo SMART',
    );
  });
});
