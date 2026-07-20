import { Injectable, Inject, forwardRef, Logger } from '@nestjs/common';
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

@Injectable()
export class PlanningService {
  private readonly logger = new Logger(PlanningService.name);
  private conversationHistory = new Map<string, ConversationContext>();

  constructor(
    @Inject(forwardRef(() => GeminiService))
    private readonly geminiService: GeminiService,
  ) {}

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
    const projectContext = history?.projectContext || '';

    const prompt = buildSuggestAnswerPrompt({
      questionIndex: dto.questionIndex,
      question: dto.question,
      projectContext,
      previousAnswers: dto.previousAnswers,
    });

    try {
      const response = await this.geminiService.generateContent(prompt);
      // Some models/providers may still wrap the answer in JSON.
      const parsed = this.tryParseJson<{ suggestedAnswer?: string }>(response);
      if (parsed && typeof parsed.suggestedAnswer === 'string' && parsed.suggestedAnswer.trim()) {
        return parsed.suggestedAnswer.trim();
      }
      return String(response || '').trim();
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

      return JSON.parse(cleanResponse) as unknown as T;
    } catch {
      return null;
    }
  }

  private parseQuestionsFromResponse(response: string): string[] {
    try {
      let cleanResponse = response.trim();

      if (cleanResponse.startsWith('```')) {
        cleanResponse = cleanResponse.replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '');
      }

      cleanResponse = cleanResponse.trim();

      const questions = JSON.parse(cleanResponse) as unknown;

      if (!Array.isArray(questions) || !questions.every((question) => typeof question === 'string')) {
        throw new Error('Resposta não é um array');
      }

      return questions;
    } catch (error) {
      this.logger.error(
        'Erro ao fazer parse das perguntas:',
        error instanceof Error ? error.stack : error,
      );
      this.logger.warn(`Resposta recebida que falhou no parse: ${response}`);

      // Fallback: perguntas genéricas
      return [
        'Qual é o público-alvo principal deste projeto?',
        'Quais são as principais funcionalidades que devem ser implementadas?',
        'Qual é o prazo ideal para conclusão?',
        'Existem integrações com sistemas existentes?',
        'Quais são os critérios de sucesso mensuráveis?',
      ];
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
