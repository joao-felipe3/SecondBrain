import { Test, TestingModule } from '@nestjs/testing';
import { PlanningService } from '../../../../../src/projects/services/strategy';
import { GeminiService } from '../../../../../src/ai/services/core/gemini.service';

describe('PlanningService', () => {
  let service: PlanningService;
  let generateContentMock: jest.Mock;

  beforeEach(async () => {
    generateContentMock = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlanningService,
        {
          provide: GeminiService,
          useValue: {
            generateContent: generateContentMock,
          },
        },
      ],
    }).compile();

    service = module.get<PlanningService>(PlanningService);
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

      generateContentMock.mockResolvedValue(JSON.stringify(mockQuestions));

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
      expect(generateContentMock).toHaveBeenCalledWith(expect.stringContaining('E-commerce Platform'));
    });

    it('should handle JSON with code blocks', async () => {
      const mockQuestions = ['Pergunta 1', 'Pergunta 2'];
      const responseWithCodeBlock = `\`\`\`json\n${JSON.stringify(mockQuestions)}\n\`\`\``;

      generateContentMock.mockResolvedValue(responseWithCodeBlock);

      const projectData = {
        projectName: 'Test Project',
        projectDescription: 'Test description',
      };

      const result = await service.startCatchball(projectData);

      expect(result.questions).toEqual(mockQuestions);
    });

    it('should use fallback questions on parse error', async () => {
      generateContentMock.mockResolvedValue('Invalid JSON');

      const projectData = {
        projectName: 'Test Project',
        projectDescription: 'Test description',
      };

      const result = await service.startCatchball(projectData);

      // Uma pergunta por dimensão do SMART, sem jargão de nenhum tipo de projeto
      expect(result.questions).toHaveLength(6);
      expect(result.questions[0]).toContain('entregar');
      expect(result.questions.join(' ')).not.toMatch(/stakeholder|integra/i);
    });

    it('should extract the JSON array when the AI adds text around it', async () => {
      const questions = ['O que você quer aprender primeiro?', 'Como medir o avanço?'];
      generateContentMock.mockResolvedValue(
        `Claro! Aqui estão as perguntas:\n${JSON.stringify(questions)}\nEspero ter ajudado.`,
      );

      const result = await service.startCatchball({
        projectName: 'Chinês',
        projectDescription: 'Estudar',
      });

      expect(result.questions).toEqual(questions);
    });

    it('should accept an object with a questions array', async () => {
      generateContentMock.mockResolvedValue(JSON.stringify({ questions: ['Pergunta A', 'Pergunta B'] }));

      const result = await service.startCatchball({ projectName: 'Teste', projectDescription: 'Teste' });

      expect(result.questions).toEqual(['Pergunta A', 'Pergunta B']);
    });

    it('should trim, drop empty and duplicated questions and cap the total', async () => {
      const many = Array.from({ length: 12 }, (_, i) => `  Pergunta ${i + 1}  `);
      generateContentMock.mockResolvedValue(
        JSON.stringify(['', '   ', 'Repetida', 'Repetida', ...many]),
      );

      const result = await service.startCatchball({ projectName: 'Teste', projectDescription: 'Teste' });

      expect(result.questions).toHaveLength(8);
      expect(result.questions[0]).toBe('Repetida');
      expect(result.questions[1]).toBe('Pergunta 1');
      expect(new Set(result.questions).size).toBe(result.questions.length);
    });

    it('should use the fallback when the array has no valid question', async () => {
      generateContentMock.mockResolvedValue(JSON.stringify(['', '  ']));

      const result = await service.startCatchball({ projectName: 'Teste', projectDescription: 'Teste' });

      expect(result.questions).toHaveLength(6);
    });

    it('should ask one question per SMART dimension and adapt to the project type', async () => {
      generateContentMock.mockResolvedValue(JSON.stringify(['P1']));

      await service.startCatchball({
        projectName: 'Aprender Chinês',
        projectDescription: 'Ter um aprendizado contínuo da língua chinesa',
        longTermGoal: 'Nível B2',
      });

      const prompt = generateContentMock.mock.calls[0][0] as string;
      expect(prompt).toContain('Aprender Chinês');
      expect(prompt).toContain('Nível B2');
      for (const dimension of [
        'Específico',
        'Mensurável',
        'Atingível',
        'Relevante',
        'Temporal',
        'Capacidade',
      ]) {
        expect(prompt).toContain(dimension);
      }
      // O prompt não pode forçar temas de software em qualquer projeto
      expect(prompt).toMatch(/Adapte o conteúdo/);
      expect(prompt).not.toContain('Integrações e dependências técnicas');
    });
  });

  describe('suggestAnswer', () => {
    it('should generate a suggested answer for a question', async () => {
      const mockSuggestion = 'Sugestão de resposta baseada na pergunta';

      generateContentMock.mockResolvedValue(JSON.stringify({ suggestedAnswer: mockSuggestion }));

      const result = await service.suggestAnswer({
        conversationId: 'conv_123',
        questionIndex: 0,
        question: 'Qual é o público-alvo?',
        previousAnswers: [],
      });

      expect(result).toBe(mockSuggestion);
      expect(generateContentMock).toHaveBeenCalled();
    });

    it('should include previous answers in context', async () => {
      const mockSuggestion = 'Resposta baseada no contexto';

      generateContentMock.mockResolvedValue(JSON.stringify({ suggestedAnswer: mockSuggestion }));

      const previousAnswers = ['Resposta 1', 'Resposta 2'];
      const result = await service.suggestAnswer({
        conversationId: 'conv_123',
        questionIndex: 2,
        question: 'Próxima pergunta',
        previousAnswers,
      });

      expect(result).toBe(mockSuggestion);
      expect(generateContentMock).toHaveBeenCalledWith(expect.stringContaining('Resposta 1'));
    });

    it('should use the project context sent by the client when the conversation is not in memory', async () => {
      generateContentMock.mockResolvedValue('Quero aprender 500 ideogramas.');

      await service.suggestAnswer({
        conversationId: 'conversa_perdida_apos_reinicio',
        questionIndex: 0,
        question: 'O que você quer alcançar?',
        previousAnswers: [],
        projectContext: 'Nome: Aprender Chinês\nDescrição: estudar mandarim',
      });

      expect(generateContentMock).toHaveBeenCalledWith(expect.stringContaining('Aprender Chinês'));
    });

    it('should work without previous answers', async () => {
      generateContentMock.mockResolvedValue('Resposta curta.');

      const result = await service.suggestAnswer({
        conversationId: 'conv_x',
        questionIndex: 0,
        question: 'Pergunta?',
      });

      expect(result).toBe('Resposta curta.');
    });

    it('should clean quotes and code fences around a plain-text suggestion', async () => {
      generateContentMock.mockResolvedValue('"Quero estudar 5h por semana."');
      const quoted = await service.suggestAnswer({
        conversationId: 'c1',
        questionIndex: 0,
        question: 'Quanto tempo?',
        previousAnswers: [],
      });
      expect(quoted).toBe('Quero estudar 5h por semana.');

      generateContentMock.mockResolvedValue('```\nQuero estudar 5h por semana.\n```');
      const fenced = await service.suggestAnswer({
        conversationId: 'c1',
        questionIndex: 0,
        question: 'Quanto tempo?',
        previousAnswers: [],
      });
      expect(fenced).toBe('Quero estudar 5h por semana.');
    });

    it('should fail with a clear error when the AI returns an empty suggestion', async () => {
      generateContentMock.mockResolvedValue('   ');

      await expect(
        service.suggestAnswer({
          conversationId: 'c1',
          questionIndex: 0,
          question: 'P?',
          previousAnswers: [],
        }),
      ).rejects.toThrow('Não foi possível gerar sugestão de resposta');
    });

    it('should ask for a short first-person answer in the prompt', async () => {
      generateContentMock.mockResolvedValue('ok');

      await service.suggestAnswer({
        conversationId: 'c1',
        questionIndex: 2,
        question: 'Quais recursos você tem?',
        previousAnswers: ['Resposta A', ''],
        projectContext: 'Nome: Projeto',
      });

      const prompt = generateContentMock.mock.calls[0][0] as string;
      expect(prompt).toContain('primeira pessoa');
      expect(prompt).toContain('Resposta A');
      // Respostas vazias não entram no contexto
      expect(prompt).not.toMatch(/Pergunta 2: \s*\n/);
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

    generateContentMock.mockResolvedValue(JSON.stringify(mockSmart));

    const conversationId = 'conv_123';
    const answers = ['Público geral', '3 meses', 'Catálogo + carrinho'];

    const result = await service.generateSmartObjective({ conversationId, answers });

    expect(result).toEqual(mockSmart);
    expect(generateContentMock).toHaveBeenCalledWith(expect.stringContaining(answers[0]));
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
    generateContentMock.mockResolvedValue(responseWithCodeBlock);

    const result = await service.generateSmartObjective({
      conversationId: 'conv_123',
      answers: ['answer'],
    });

    expect(result.specific).toBe('Test');
  });

  it('should throw error on invalid response', async () => {
    generateContentMock.mockResolvedValue('Invalid JSON');

    await expect(
      service.generateSmartObjective({ conversationId: 'conv_123', answers: ['answer'] }),
    ).rejects.toThrow('Não foi possível processar o objetivo SMART');
  });
});
