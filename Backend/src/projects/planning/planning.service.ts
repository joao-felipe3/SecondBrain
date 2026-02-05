import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { GeminiService } from '../../tasks/gemini.service';
import { SmartObjectiveDto } from '../dto/smart-objective.dto';

@Injectable()
export class PlanningService {
  private conversationHistory = new Map<string, string[]>();

  constructor(@Inject(forwardRef(() => GeminiService)) private readonly geminiService: GeminiService) {}

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
    
    const prompt = `Você é um consultor de gestão de projetos especializado em metodologias PMBOK e PRINCE2.

Um usuário tem um projeto com as seguintes informações:

Nome do Projeto: "${projectData.projectName}"
Descrição: "${projectData.projectDescription}"
${goalsContext.length > 0 ? `\nObjetivos existentes:\n${goalsContext.join('\n')}` : ''}

Sua tarefa é fazer perguntas estratégicas para refinar esse objetivo em um objetivo SMART, usando a técnica Catchball (Hoshin Kanri).
Faça 4-5 perguntas que ajudem a esclarecer:
1. Público-alvo e usuários específicos
2. Escopo e funcionalidades principais
3. Restrições de tempo e recursos
4. Integrações e dependências técnicas
5. Critérios de sucesso mensuráveis

Retorne APENAS um array JSON com as perguntas, sem texto adicional:
["pergunta 1", "pergunta 2", "pergunta 3", "pergunta 4", "pergunta 5"]`;

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

  async suggestAnswer(conversationId: string, questionIndex: number, question: string, previousAnswers: string[]): Promise<string> {
    const history = this.conversationHistory.get(conversationId) || [];
    const projectContext = history[0] || '';
    
    const previousContext = previousAnswers.length > 0 
      ? `\n\nRespostas anteriores:\n${previousAnswers.map((ans, i) => `Pergunta ${i + 1}: ${ans}`).join('\n')}`
      : '';
    
    const prompt = `Você é um consultor de gestão de projetos especializado em metodologias PMBOK e PRINCE2.

Contexto do projeto:
${projectContext}${previousContext}

Pergunta atual (${questionIndex + 1}):
"${question}"

Com base nas informações do projeto e nas respostas anteriores (se houver), sugira uma resposta objetiva e concreta para esta pergunta. A resposta deve ser prática e específica para este projeto.

Retorne APENAS a resposta sugerida, sem explicações adicionais ou formatação JSON.`;

    try {
      const response = await this.geminiService.generateContent(prompt);
      return response.trim();
    } catch (error) {
      console.error('Erro ao gerar sugestão de resposta:', error);
      throw new Error('Não foi possível gerar sugestão de resposta');
    }
  }

  async generateSmartObjective(conversationId: string, answers: string[]): Promise<SmartObjectiveDto> {
    const history = this.conversationHistory.get(conversationId) || [];
    const projectContext = history[0] || '';
    
    const prompt = `Você é um consultor de gestão de projetos especializado em metodologias PMBOK e PRINCE2.

Contexto do projeto:
${projectContext}

Respostas do usuário às perguntas estratégicas:
${answers.map((answer, i) => `${i + 1}. ${answer}`).join('\n')}

Agora, crie um objetivo SMART (Specific, Measurable, Achievable, Relevant, Temporal) para este projeto.

Retorne APENAS um objeto JSON no seguinte formato, sem texto adicional:
{
  "specific": "Descrição clara e específica do que será feito",
  "measurable": "Métricas quantificáveis (ex: 500 produtos, 100k visitantes/mês)",
  "achievable": "Análise de viabilidade com recursos disponíveis",
  "relevant": "Por que este projeto é importante para o negócio",
  "temporal": "Prazo específico com data de conclusão",
  "summary": "Resumo executivo em 1-2 frases",
  "risks": ["risco 1", "risco 2", "risco 3"]
}`;

    try {
      const response = await this.geminiService.generateContent(prompt);
      const smartObjective = this.parseSmartObjectiveFromResponse(response);
      
      // Limpa histórico após uso
      this.conversationHistory.delete(conversationId);
      
      return smartObjective;
    } catch (error) {
      console.error('Erro ao gerar objetivo SMART:', error);
      throw new Error('Não foi possível gerar o objetivo SMART');
    }
  }

  private generateConversationId(): string {
    return `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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
        'Quais são os critérios de sucesso mensuráveis?'
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
      
      return {
        specific: smartObj.specific || '',
        measurable: smartObj.measurable || '',
        achievable: smartObj.achievable || '',
        relevant: smartObj.relevant || '',
        temporal: smartObj.temporal || '',
        summary: smartObj.summary || '',
        risks: Array.isArray(smartObj.risks) ? smartObj.risks : []
      };
    } catch (error) {
      console.error('Erro ao fazer parse do objetivo SMART:', error);
      console.error('Resposta recebida:', response);
      throw new Error('Não foi possível processar o objetivo SMART');
    }
  }
}
