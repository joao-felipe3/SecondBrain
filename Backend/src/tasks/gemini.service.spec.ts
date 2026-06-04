import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { GeminiService } from './gemini.service';

describe('GeminiService', () => {
  let service: GeminiService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GeminiService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const configMap: Record<string, string | undefined> = {
                GEMINI_API_KEY: 'test-api-key',
                GEMINI_MODEL: 'gemini-2.5-flash-lite',
              };
              return configMap[key];
            }),
          },
        },
      ],
    }).compile();

    service = module.get<GeminiService>(GeminiService);
  });

  it('retorna fallback quando a chamada ao LLM falha', async () => {
    jest
      .spyOn(service as any, 'generateContent')
      .mockRejectedValue(new Error('LLM indisponível'));

    const checklist = await service.generateChecklistForTask(
      'Preparar revisão de código',
      'Revisar PR de sprint 1',
      'subtask',
    );

    expect(checklist).toEqual([
      'Preparar contexto',
      'Executar tarefa',
      'Validar entrega',
    ]);
  });

  it('usa cache e evita nova chamada ao LLM para a mesma chave', async () => {
    const generateContentSpy = jest
      .spyOn(service as any, 'generateContent')
      .mockResolvedValue(
        JSON.stringify([
          'Abrir branch',
          'Implementar endpoint',
          'Validar resposta',
        ]),
      );

    const first = await service.generateChecklistForTask(
      'Criar endpoint de micro-task',
      'Implementação inicial',
      'quick',
    );
    const second = await service.generateChecklistForTask(
      'Criar endpoint de micro-task',
      'Implementação inicial',
      'quick',
    );

    expect(first).toEqual([
      'Abrir branch',
      'Implementar endpoint',
      'Validar resposta',
    ]);
    expect(second).toEqual(first);
    expect(generateContentSpy).toHaveBeenCalledTimes(1);
  });
});
