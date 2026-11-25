import { ArgumentMetadata, BadRequestException, ValidationPipe } from '@nestjs/common';
import {
  CatchballRequestDto,
  RefineObjectiveDto,
  SuggestAnswerDto,
} from '../../../../src/projects/dto/smart-objective.dto';

/**
 * Mesma configuração do ValidationPipe global (src/main.ts). Com `whitelist: true`, qualquer
 * propriedade sem decorador do class-validator é REMOVIDA do corpo da requisição: o serviço
 * recebia nome, descrição, pergunta e contexto vazios e a IA respondia "sem contexto".
 */
const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: false });

function run<T>(metatype: new () => T, body: unknown): Promise<T> {
  const metadata: ArgumentMetadata = { type: 'body', metatype };
  return pipe.transform(body, metadata) as Promise<T>;
}

describe('DTOs do planejamento com IA (com o ValidationPipe global)', () => {
  describe('CatchballRequestDto', () => {
    it('mantém nome, descrição e objetivos do projeto', async () => {
      const body = {
        projectName: 'Aprender Chinês',
        projectDescription: 'Ter um aprendizado contínuo da língua chinesa',
        shortTermGoal: 'Aprender os primeiros ideogramas',
        midTermGoal: 'Conversar o básico',
        longTermGoal: 'Nível B2',
      };

      const dto = await run(CatchballRequestDto, body);

      expect(dto).toMatchObject(body);
    });

    it('aceita descrição vazia e objetivos ausentes', async () => {
      const dto = await run(CatchballRequestDto, { projectName: 'Projeto', projectDescription: '' });

      expect(dto.projectName).toBe('Projeto');
      expect(dto.projectDescription).toBe('');
      expect(dto.shortTermGoal).toBeUndefined();
    });

    it('rejeita requisição sem nome do projeto', async () => {
      await expect(run(CatchballRequestDto, { projectDescription: 'x' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('SuggestAnswerDto', () => {
    it('mantém pergunta, respostas anteriores e contexto do projeto', async () => {
      const body = {
        conversationId: 'conv_1',
        questionIndex: 2,
        question: 'Como medir o progresso?',
        previousAnswers: ['Aprender 500 ideogramas', ''],
        projectContext: 'Nome: Aprender Chinês',
      };

      const dto = await run(SuggestAnswerDto, body);

      expect(dto).toMatchObject(body);
    });

    it('aceita o corpo sem respostas anteriores e sem contexto', async () => {
      const dto = await run(SuggestAnswerDto, {
        conversationId: '',
        questionIndex: 0,
        question: 'Pergunta?',
      });

      expect(dto.question).toBe('Pergunta?');
      expect(dto.previousAnswers).toBeUndefined();
    });

    it('rejeita requisição sem a pergunta', async () => {
      await expect(
        run(SuggestAnswerDto, { conversationId: 'c', questionIndex: 0 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('RefineObjectiveDto', () => {
    it('mantém o id da conversa e as respostas', async () => {
      const body = { conversationId: 'conv_1', answers: ['Resposta 1', 'Resposta 2'] };

      const dto = await run(RefineObjectiveDto, body);

      expect(dto).toMatchObject(body);
    });

    it('rejeita requisição sem respostas', async () => {
      await expect(run(RefineObjectiveDto, { conversationId: 'c' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });
});
