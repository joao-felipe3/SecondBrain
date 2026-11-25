import { describe, it, expect, vi } from 'vitest';
import {
  useAnswerSuggestion,
  friendlySuggestionError,
} from '~/composables/features/useAnswerSuggestion';

const request = {
  projectId: 'p1',
  conversationId: 'conv_1',
  questionIndex: 1,
  question: 'Como medir o progresso?',
  previousAnswers: ['Aprender 500 ideogramas', '', '   '],
  projectContext: 'Nome: Aprender Chinês',
};

describe('friendlySuggestionError', () => {
  it('explica limite de uso, projeto inexistente, falta de conexão e falha genérica', () => {
    expect(friendlySuggestionError({ response: { status: 402 } })).toMatch(/limite de uso/);
    expect(friendlySuggestionError({ response: { status: 429 } })).toMatch(/limite de uso/);
    expect(friendlySuggestionError({ response: { status: 404 } })).toMatch(/Projeto não encontrado/);
    expect(friendlySuggestionError(new Error('Network Error'))).toMatch(/servidor/);
    expect(friendlySuggestionError({ response: { status: 500 } })).toMatch(/responder manualmente/);
  });
});

describe('useAnswerSuggestion', () => {
  it('pede a sugestão ao endpoint certo, com contexto, e devolve o texto limpo', async () => {
    const post = vi
      .fn()
      .mockResolvedValue({ data: { suggestedAnswer: '  Quero dominar 500 ideogramas.  ' } });
    const { requestSuggestion, suggesting, errorMessage } = useAnswerSuggestion(post);

    const text = await requestSuggestion(request);

    expect(text).toBe('Quero dominar 500 ideogramas.');
    expect(post).toHaveBeenCalledWith('/projects/p1/suggest-answer', {
      conversationId: 'conv_1',
      questionIndex: 1,
      question: 'Como medir o progresso?',
      // Respostas vazias não vão para a IA
      previousAnswers: ['Aprender 500 ideogramas'],
      projectContext: 'Nome: Aprender Chinês',
    });
    expect(suggesting.value).toBe(false);
    expect(errorMessage.value).toBe('');
  });

  it('não chama a API sem projeto salvo e avisa o usuário', async () => {
    const post = vi.fn();
    const { requestSuggestion, errorMessage } = useAnswerSuggestion(post);

    for (const projectId of ['', 'undefined', '   ']) {
      expect(await requestSuggestion({ ...request, projectId })).toBeNull();
      expect(errorMessage.value).toMatch(/Salve o projeto/);
    }
    expect(post).not.toHaveBeenCalled();
  });

  it('trata sugestão vazia como erro, sem preencher nada', async () => {
    const post = vi.fn().mockResolvedValue({ data: { suggestedAnswer: '   ' } });
    const { requestSuggestion, errorMessage } = useAnswerSuggestion(post);

    expect(await requestSuggestion(request)).toBeNull();
    expect(errorMessage.value).toMatch(/não retornou/);
  });

  it('mostra erro amigável quando a chamada falha e libera o botão de novo', async () => {
    const post = vi.fn().mockRejectedValue({ response: { status: 500 } });
    const { requestSuggestion, suggesting, errorMessage, clearError } = useAnswerSuggestion(post);

    expect(await requestSuggestion(request)).toBeNull();
    expect(errorMessage.value).toMatch(/responder manualmente/);
    expect(suggesting.value).toBe(false);

    clearError();
    expect(errorMessage.value).toBe('');
  });

  it('ignora um segundo pedido enquanto o primeiro está em andamento', async () => {
    let resolvePost: (value: unknown) => void = () => {};
    const post = vi.fn().mockReturnValue(new Promise((resolve) => (resolvePost = resolve)));
    const { requestSuggestion, suggesting } = useAnswerSuggestion(post);

    const first = requestSuggestion(request);
    expect(suggesting.value).toBe(true);
    expect(await requestSuggestion(request)).toBeNull();
    expect(post).toHaveBeenCalledTimes(1);

    resolvePost({ data: { suggestedAnswer: 'ok' } });
    expect(await first).toBe('ok');
    expect(suggesting.value).toBe(false);
  });

  it('limpa o erro anterior ao pedir de novo', async () => {
    const post = vi
      .fn()
      .mockRejectedValueOnce({ response: { status: 500 } })
      .mockResolvedValueOnce({ data: { suggestedAnswer: 'Segunda tentativa' } });
    const { requestSuggestion, errorMessage } = useAnswerSuggestion(post);

    await requestSuggestion(request);
    expect(errorMessage.value).not.toBe('');

    expect(await requestSuggestion(request)).toBe('Segunda tentativa');
    expect(errorMessage.value).toBe('');
  });
});
