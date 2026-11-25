import { ref } from 'vue';

export interface AnswerSuggestionRequest {
  projectId: string;
  conversationId: string;
  questionIndex: number;
  question: string;
  /** Respostas já dadas às perguntas anteriores (vazias são ignoradas) */
  previousAnswers: string[];
  /** Nome, descrição e objetivos do projeto, para a IA não depender da memória do servidor */
  projectContext: string;
}

type PostFn = (url: string, body: unknown) => Promise<{ data?: { suggestedAnswer?: unknown } }>;

function hasValidProjectId(projectId: string): boolean {
  const id = String(projectId ?? '').trim();
  return id !== '' && id !== 'undefined';
}

/** Traduz a falha da chamada em uma mensagem que o usuário entende e sabe como contornar. */
export function friendlySuggestionError(error: unknown): string {
  const status = (error as { response?: { status?: number } } | null)?.response?.status;
  const hasResponse = Boolean((error as { response?: unknown } | null)?.response);

  if (status === 404) return 'Projeto não encontrado. Salve o projeto e tente de novo.';
  if (status === 402 || status === 429) {
    return 'O limite de uso da IA foi atingido. Tente mais tarde ou responda manualmente.';
  }
  if (!hasResponse) {
    return 'Não foi possível falar com o servidor. Verifique a conexão ou responda manualmente.';
  }
  return 'A IA não conseguiu gerar a sugestão agora (pode estar indisponível). Você pode responder manualmente.';
}

/**
 * Pede à IA uma sugestão de resposta para uma pergunta do Catchball.
 * Só roda quando o usuário pede; não preenche nada sozinho.
 */
export function useAnswerSuggestion(post: PostFn) {
  const suggesting = ref(false);
  const errorMessage = ref('');

  function clearError() {
    errorMessage.value = '';
  }

  /** Devolve o texto sugerido, ou null se não foi possível (a mensagem fica em `errorMessage`). */
  async function requestSuggestion(request: AnswerSuggestionRequest): Promise<string | null> {
    if (suggesting.value) return null;

    if (!hasValidProjectId(request.projectId)) {
      errorMessage.value = 'Salve o projeto antes de pedir sugestões à IA.';
      return null;
    }

    suggesting.value = true;
    errorMessage.value = '';

    try {
      const response = await post(`/projects/${request.projectId}/suggest-answer`, {
        conversationId: request.conversationId,
        questionIndex: request.questionIndex,
        question: request.question,
        previousAnswers: request.previousAnswers.filter((answer) => answer && answer.trim()),
        projectContext: request.projectContext,
      });

      const text = String(response?.data?.suggestedAnswer ?? '').trim();
      if (!text) {
        errorMessage.value = 'A IA não retornou uma sugestão. Tente novamente.';
        return null;
      }
      return text;
    } catch (error) {
      errorMessage.value = friendlySuggestionError(error);
      return null;
    } finally {
      suggesting.value = false;
    }
  }

  return { suggesting, errorMessage, requestSuggestion, clearError };
}
