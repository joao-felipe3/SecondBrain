import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { GeminiService } from '../../../ai/gemini.service';
import { SmartObjectiveDto } from '../../dto/smart-objective.dto';
import {
  buildCatchballQuestionsPrompt,
  buildSuggestAnswerPrompt,
  buildSmartObjectivePrompt,
} from '../../../ai/prompts/planning.prompts';

@Injectable()
export class PlanningService {
  private conversationHistory = new Map<string, string[]>();

  constructor(
    @Inject(forwardRef(() => GeminiService))
    private readonly geminiService: GeminiService,
  ) {}

  async startCatchball(projectData: {
    projectName: string;
    projectDescription: string;
    shortTermGoal?: string;
    midTermGoal?: string;
    longTermGoal?: string;
  }): Promise<{ questions: string[]; conversationId: string }> {
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
      const contextData = `Nome: ${projectData.projectName}\nDescrição: ${projectData.projectDescription}\n${goalsContext.join('\n')}`;
      this.conversationHistory.set(conversationId, [contextData]);

      return { questions, conversationId };
    } catch (error) {
      console.error('Erro ao gerar perguntas de Catchball:', error);
      throw new Error('Não foi possível iniciar o planejamento com IA');
    }
  }

  async suggestAnswer(
    conversationId: string,
    questionIndex: number,
    question: string,
    previousAnswers: string[],
  ): Promise<string> {
    const history = this.conversationHistory.get(conversationId) || [];
    const projectContext = history[0] || '';

    const prompt = buildSuggestAnswerPrompt({
      questionIndex,
      question,
      projectContext,
      previousAnswers,
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
      console.error('Erro ao gerar sugestão de resposta:', error);
      throw new Error('Não foi possível gerar sugestão de resposta');
    }
  }

  async generateSmartObjective(conversationId: string, answers: string[]): Promise<SmartObjectiveDto> {
    const history = this.conversationHistory.get(conversationId) || [];
    const projectContext = history[0] || '';

    const prompt = buildSmartObjectivePrompt({ projectContext, answers });

    let response: string;
    try {
      response = await this.geminiService.generateContent(prompt);
    } catch (error) {
      console.error('Erro ao gerar objetivo SMART:', error);
      throw new Error('Não foi possível gerar o objetivo SMART');
    }

    // Parsing errors should keep their more specific message.
    const smartObjective = this.parseSmartObjectiveFromResponse(response);

    // Limpa histórico após uso
    this.conversationHistory.delete(conversationId);

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

      return JSON.parse(cleanResponse) as T;
    } catch {
      return null;
    }
  }

  private parseQuestionsFromResponse(response: string): string[] {
    try {
      // Remove markdown code blocks de várias formas
      let cleanResponse = response.trim();

      // Remove ```json ... ``` ou ``` ... ```
      if (cleanResponse.startsWith('```')) {
        cleanResponse = cleanResponse.replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '');
      }

      // Remove espaços e quebras de linha extras
      cleanResponse = cleanResponse.trim();

      const questions = JSON.parse(cleanResponse);

      if (!Array.isArray(questions)) {
        throw new Error('Resposta não é um array');
      }

      return questions;
    } catch (error) {
      console.error('Erro ao fazer parse das perguntas:', error);
      console.error('Resposta recebida:', response);
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
      // Remove markdown code blocks de várias formas
      let cleanResponse = response.trim();

      // Remove ```json ... ``` ou ``` ... ```
      if (cleanResponse.startsWith('```')) {
        cleanResponse = cleanResponse.replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '');
      }

      // Remove espaços e quebras de linha extras
      cleanResponse = cleanResponse.trim();

      const smartObj = JSON.parse(cleanResponse);
      const weeklyHours = Number(smartObj.weeklyHours);

      return {
        specific: smartObj.specific || '',
        measurable: smartObj.measurable || '',
        achievable: smartObj.achievable || '',
        relevant: smartObj.relevant || '',
        temporal: smartObj.temporal || '',
        ...(Number.isFinite(weeklyHours) && weeklyHours > 0 ? { weeklyHours } : {}),
        summary: smartObj.summary || '',
        risks: Array.isArray(smartObj.risks) ? smartObj.risks : [],
      };
    } catch (error) {
      console.error('Erro ao fazer parse do objetivo SMART:', error);
      console.error('Resposta recebida:', response);
      throw new Error('Não foi possível processar o objetivo SMART');
    }
  }
}
