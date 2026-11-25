import { Injectable, Logger } from '@nestjs/common';
import { GeminiService } from '../../../ai/services/core/gemini.service';
import {
  SmartObjectiveDto,
  CatchballRequestDto,
  CatchballResponseDto,
  SuggestAnswerDto,
  RefineObjectiveDto,
} from '../../dto/smart-objective.dto';
import {
  buildCatchballQuestionsPrompt,
  buildSuggestAnswerPrompt,
  buildSmartObjectivePrompt,
} from '../../../ai/prompts';

interface ConversationContext {
  projectContext: string;
}

/** Máximo de perguntas aceitas da IA (o prompt pede 6, uma por dimensão do SMART) */
const MAX_QUESTIONS = 8;

/** Usadas só quando a resposta da IA não pode ser lida: uma por dimensão do SMART */
const FALLBACK_QUESTIONS = [
  'O que exatamente você quer entregar ou alcançar com este projeto?',
  'Como você vai medir o progresso e saber que alcançou o resultado (números, indicadores ou marcos)?',
  'Quais recursos, conhecimentos e limitações atuais podem facilitar ou dificultar o projeto?',
  'Por que este projeto é importante agora e que benefício você espera?',
  'Qual é o prazo final e quais marcos intermediários você consegue definir?',
  'Quantas horas por semana você consegue dedicar a este projeto?',
] as const;

@Injectable()
export class PlanningService {
  private readonly logger = new Logger(PlanningService.name);
  private conversationHistory = new Map<string, ConversationContext>();

  constructor(private readonly geminiService: GeminiService) {}

  async startCatchball(projectData: CatchballRequestDto): Promise<CatchballResponseDto> {
    const conversationId = this.generateConversationId();

    const goalsContext: string[] = [];
    if (projectData.shortTermGoal) goalsContext.push(`Curto prazo: ${projectData.shortTermGoal}`);
    if (projectData.midTermGoal) goalsContext.push(`Médio prazo: ${projectData.midTermGoal}`);
    if (projectData.longTermGoal) goalsContext.push(`Longo prazo: ${projectData.longTermGoal}`);

    const prompt = buildCatchballQuestionsPrompt(projectData);

    try {
      const response = await this.geminiService.generateContent(prompt);
      const questions = this.parseQuestionsFromResponse(response);

      // Armazena histórico com todos os dados
      const projectContext = `Nome: ${projectData.projectName}\nDescrição: ${projectData.projectDescription}\n${goalsContext.join('\n')}`;
      this.conversationHistory.set(conversationId, { projectContext });

      return { questions, conversationId };
    } catch (error) {
      this.logger.error(
        'Erro ao gerar perguntas de Catchball:',
        error instanceof Error ? error.stack : error,
      );
      throw new Error('Não foi possível iniciar o planejamento com IA');
    }
  }

  async suggestAnswer(dto: SuggestAnswerDto): Promise<string> {
    const history = this.conversationHistory.get(dto.conversationId);
    // A conversa vive só na memória do servidor: se ele reiniciou, usa o contexto enviado pelo cliente
    const projectContext = history?.projectContext || dto.projectContext || '';

    const prompt = buildSuggestAnswerPrompt({
      questionIndex: dto.questionIndex,
      question: dto.question,
      projectContext,
      previousAnswers: (dto.previousAnswers ?? []).filter((answer) => answer && answer.trim()),
    });

    try {
      const response = await this.geminiService.generateContent(prompt);
      // Some models/providers may still wrap the answer in JSON.
      const parsed = this.tryParseJson<{ suggestedAnswer?: string }>(response);
      const suggestion =
        parsed && typeof parsed.suggestedAnswer === 'string' && parsed.suggestedAnswer.trim()
          ? this.cleanSuggestion(parsed.suggestedAnswer)
          : this.cleanSuggestion(response);

      if (!suggestion) {
        throw new Error('A IA não retornou uma sugestão');
      }
      return suggestion;
    } catch (error) {
      this.logger.error(
        'Erro ao gerar sugestão de resposta:',
        error instanceof Error ? error.stack : error,
      );
      throw new Error('Não foi possível gerar sugestão de resposta');
    }
  }

  async generateSmartObjective(dto: RefineObjectiveDto): Promise<SmartObjectiveDto> {
    const history = this.conversationHistory.get(dto.conversationId);
    const projectContext = history?.projectContext || '';

    const prompt = buildSmartObjectivePrompt({ projectContext, answers: dto.answers });

    let response: string;
    try {
      response = await this.geminiService.generateContent(prompt);
    } catch (error) {
      this.logger.error('Erro ao gerar objetivo SMART:', error instanceof Error ? error.stack : error);
      throw new Error('Não foi possível gerar o objetivo SMART');
    }

    // Parsing errors should keep their more specific message.
    const smartObjective = this.parseSmartObjectiveFromResponse(response);

    // Limpa histórico após uso
    this.conversationHistory.delete(dto.conversationId);

    return smartObjective;
  }

  private generateConversationId(): string {
    return `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private tryParseJson<T>(response: string): T | null {
    try {
      let cleanResponse = String(response || '').trim();
      if (!cleanResponse) return null;

      // Remove ```json ... ``` or ``` ... ```
      if (cleanResponse.startsWith('```')) {
        cleanResponse = cleanResponse
          .replace(/^```(?:json)?\s*/i, '')
          .replace(/```\s*$/i, '')
          .trim();
      }

      // Quick guard: avoid throwing on plain text responses.
      const first = cleanResponse[0];
      if (first !== '{' && first !== '[') return null;

      const parsed: T = JSON.parse(cleanResponse) as T;
      return parsed;
    } catch {
      return null;
    }
  }

  /**
   * Extrai um JSON da resposta da IA: aceita blocos ```json e texto solto em volta
   * (do primeiro `[` ou `{` ao último `]` ou `}`).
   */
  private extractJson(response: string): unknown {
    const direct = this.tryParseJson<unknown>(response);
    if (direct !== null) return direct;

    const text = String(response || '');
    for (const [open, close] of [
      ['[', ']'],
      ['{', '}'],
    ] as const) {
      const start = text.indexOf(open);
      const end = text.lastIndexOf(close);
      if (start !== -1 && end > start) {
        try {
          return JSON.parse(text.slice(start, end + 1)) as unknown;
        } catch {
          // tenta o próximo formato
        }
      }
    }
    return null;
  }

  /** Remove aspas, formatação e blocos de código que a IA às vezes coloca em volta da sugestão. */
  private cleanSuggestion(text: string): string {
    return String(text || '')
      .trim()
      .replace(/^```(?:\w+)?\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim()
      .replace(/^["“](.*)["”]$/s, '$1')
      .trim();
  }

  private parseQuestionsFromResponse(response: string): string[] {
    try {
      const parsed = this.extractJson(response);
      const rawQuestions: unknown = Array.isArray(parsed)
        ? parsed
        : (parsed as { questions?: unknown } | null)?.questions;

      if (
        !Array.isArray(rawQuestions) ||
        !rawQuestions.every((question): question is string => typeof question === 'string')
      ) {
        throw new Error('Resposta não é um array de perguntas');
      }

      // Remove vazias e repetidas; limita o total para não cansar o usuário
      const questions = Array.from(
        new Set(rawQuestions.map((question) => question.trim()).filter(Boolean)),
      ).slice(0, MAX_QUESTIONS);

      if (questions.length === 0) {
        throw new Error('Nenhuma pergunta válida na resposta');
      }

      return questions;
    } catch (error) {
      this.logger.error(
        'Erro ao fazer parse das perguntas:',
        error instanceof Error ? error.stack : error,
      );
      this.logger.warn(`Resposta recebida que falhou no parse: ${response}`);

      // Fallback: uma pergunta por dimensão do SMART, sem jargão de nenhum tipo de projeto
      return [...FALLBACK_QUESTIONS];
    }
  }

  private parseSmartObjectiveFromResponse(response: string): SmartObjectiveDto {
    try {
      let cleanResponse = response.trim();

      if (cleanResponse.startsWith('```')) {
        cleanResponse = cleanResponse.replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '');
      }

      cleanResponse = cleanResponse.trim();

      const smartObj = JSON.parse(cleanResponse) as Record<string, unknown>;
      const weeklyHours = Number(smartObj.weeklyHours);

      return {
        specific: typeof smartObj.specific === 'string' ? smartObj.specific : '',
        measurable: typeof smartObj.measurable === 'string' ? smartObj.measurable : '',
        achievable: typeof smartObj.achievable === 'string' ? smartObj.achievable : '',
        relevant: typeof smartObj.relevant === 'string' ? smartObj.relevant : '',
        temporal: typeof smartObj.temporal === 'string' ? smartObj.temporal : '',
        ...(Number.isFinite(weeklyHours) && weeklyHours > 0 ? { weeklyHours } : {}),
        summary: typeof smartObj.summary === 'string' ? smartObj.summary : '',
        risks: Array.isArray(smartObj.risks)
          ? smartObj.risks.filter((r): r is string => typeof r === 'string')
          : [],
      };
    } catch (error) {
      this.logger.error(
        'Erro ao fazer parse do objetivo SMART:',
        error instanceof Error ? error.stack : error,
      );
      this.logger.warn(`Resposta recebida que falhou no parse do SMART: ${response}`);
      throw new Error('Não foi possível processar o objetivo SMART');
    }
  }
}
