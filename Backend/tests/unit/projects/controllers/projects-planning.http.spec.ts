import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { ProjectsPlanningController } from '../../../../src/projects/controllers/projects-planning.controller';
import { ProjectsService } from '../../../../src/projects/projects.service';
import { PlanningService } from '../../../../src/projects/services/strategy';
import { GeminiService } from '../../../../src/ai/services/core/gemini.service';

/**
 * Teste HTTP do planejamento com IA passando pelo ValidationPipe global (igual ao src/main.ts)
 * e pelo PlanningService real; só o Gemini é simulado.
 * Regressão: com `whitelist: true` e DTOs sem decorador, o corpo chegava vazio ao serviço e a
 * IA gerava perguntas genéricas e sugestões "sem contexto".
 */
describe('ProjectsPlanningController (HTTP)', () => {
  let app: INestApplication;
  let generateContent: jest.Mock;
  let update: jest.Mock;

  beforeEach(async () => {
    generateContent = jest.fn();
    update = jest.fn().mockResolvedValue({});

    const moduleRef = await Test.createTestingModule({
      controllers: [ProjectsPlanningController],
      providers: [
        PlanningService,
        { provide: GeminiService, useValue: { generateContent } },
        {
          provide: ProjectsService,
          useValue: {
            findOne: jest.fn().mockResolvedValue({ _id: 'p1', name: 'Aprender Chinês' }),
            update,
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: false }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('plan-with-ai: o nome, a descrição e os objetivos do projeto chegam ao prompt', async () => {
    generateContent.mockResolvedValue(
      JSON.stringify(['O que você quer conseguir ler em chinês?', 'Como medir?']),
    );

    const res = await request(app.getHttpServer())
      .post('/projects/p1/plan-with-ai')
      .send({
        projectName: 'Aprender Chinês',
        projectDescription: 'Ter um aprendizado contínuo da língua chinesa',
        shortTermGoal: 'Aprender os primeiros ideogramas',
      })
      .expect(201);

    expect(res.body.questions).toEqual(['O que você quer conseguir ler em chinês?', 'Como medir?']);
    expect(res.body.conversationId).toMatch(/^conv_/);

    const prompt = generateContent.mock.calls[0][0] as string;
    expect(prompt).toContain('Aprender Chinês');
    expect(prompt).toContain('Ter um aprendizado contínuo da língua chinesa');
    expect(prompt).toContain('Aprender os primeiros ideogramas');
    expect(prompt).not.toContain('undefined');
  });

  it('suggest-answer: a pergunta, as respostas anteriores e o contexto enviado chegam ao prompt', async () => {
    generateContent.mockResolvedValue('Quero ler textos simples em chinês.');

    const res = await request(app.getHttpServer())
      .post('/projects/p1/suggest-answer')
      .send({
        conversationId: 'conversa_que_o_servidor_nao_tem_mais',
        questionIndex: 1,
        question: 'Como medir o progresso?',
        previousAnswers: ['Conversar o básico em chinês'],
        projectContext: 'Nome: Aprender Chinês\nDescrição: estudar mandarim',
      })
      .expect(201);

    expect(res.body.suggestedAnswer).toBe('Quero ler textos simples em chinês.');

    const prompt = generateContent.mock.calls[0][0] as string;
    expect(prompt).toContain('Aprender Chinês');
    expect(prompt).toContain('Como medir o progresso?');
    expect(prompt).toContain('Conversar o básico em chinês');
    expect(prompt).not.toContain('sem contexto adicional');
    expect(prompt).not.toContain('undefined');
  });

  it('suggest-answer: rejeita requisição sem a pergunta (400), em vez de gerar um prompt vazio', async () => {
    await request(app.getHttpServer())
      .post('/projects/p1/suggest-answer')
      .send({ conversationId: 'c', questionIndex: 0 })
      .expect(400);

    expect(generateContent).not.toHaveBeenCalled();
  });

  it('plan-with-ai: rejeita requisição sem o nome do projeto (400)', async () => {
    await request(app.getHttpServer())
      .post('/projects/p1/plan-with-ai')
      .send({ projectDescription: 'sem nome' })
      .expect(400);

    expect(generateContent).not.toHaveBeenCalled();
  });

  it('refine-objective: as respostas chegam ao prompt e o SMART é salvo no projeto', async () => {
    generateContent.mockResolvedValue(
      JSON.stringify({
        specific: 'Conversar o básico',
        measurable: '500 ideogramas',
        achievable: 'Sim',
        relevant: 'Viagem',
        temporal: 'Em 12 meses',
        weeklyHours: 6,
        summary: 'Aprender chinês',
        risks: [],
      }),
    );

    const res = await request(app.getHttpServer())
      .post('/projects/p1/refine-objective')
      .send({ conversationId: 'c1', answers: ['Quero conversar', 'Medir por ideogramas'] })
      .expect(201);

    expect(res.body.smart.weeklyHours).toBe(6);
    expect(generateContent.mock.calls[0][0]).toContain('Medir por ideogramas');
    expect(update).toHaveBeenCalledWith('p1', {
      smartObjective: expect.objectContaining({ weeklyHours: 6 }),
    });
  });
});
