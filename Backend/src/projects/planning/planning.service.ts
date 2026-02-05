import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { GeminiService } from '../../tasks/gemini.service';
import { SmartObjectiveDto } from '../dto/smart-objective.dto';

@Injectable()
export class PlanningService {
  private conversationHistory = new Map<string, string[]>();

  constructor(@Inject(forwardRef(() => GeminiService)) private readonly geminiService: GeminiService) {}

  async startCatchball(initialDescription: string): Promise<{ questions: string[]; conversationId: string }> {
    const conversationId = this.generateConversationId();
    
    const prompt = `Você é um consultor de gestão de projetos especializado em metodologias PMBOK e PRINCE2.

Um usuário quer criar um projeto com a seguinte descrição inicial:
"${initialDescription}"

Sua tarefa é fazer perguntas estratégicas para refinar esse objetivo, usando a técnica Catchball (Hoshin Kanri).
Faça 4-5 perguntas que ajudem a esclarecer:
1. Público-alvo e usuários
2. Escopo e funcionalidades principais
3. Restrições de tempo e recursos
4. Integrações e dependências técnicas
5. Critérios de sucesso

Retorne APENAS um array JSON com as perguntas, sem texto adicional:
["pergunta 1", "pergunta 2", "pergunta 3", "pergunta 4", "pergunta 5"]`;

    try {
      const response = await this.geminiService.generateContent(prompt);
      const questions = this.parseQuestionsFromResponse(response);
      
      // Armazena histórico
      this.conversationHistory.set(conversationId, [initialDescription]);
      
      return { questions, conversationId };
    } catch (error) {
      console.error('Erro ao gerar perguntas de Catchball:', error);
      throw new Error('Não foi possível iniciar o planejamento com IA');
    }
  }

  async generateSmartObjective(conversationId: string, answers: string[]): Promise<SmartObjectiveDto> {
    const history = this.conversationHistory.get(conversationId) || [];
    const initialDescription = history[0] || '';
    
    const prompt = `Você é um consultor de gestão de projetos especializado em metodologias PMBOK e PRINCE2.

Descrição inicial do projeto:
"${initialDescription}"

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
      // Remove markdown code blocks se existirem
      const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) || 
                       response.match(/```\s*([\s\S]*?)\s*```/);
      const jsonString = jsonMatch ? jsonMatch[1] : response;
      
      const questions = JSON.parse(jsonString.trim());
      
      if (!Array.isArray(questions)) {
        throw new Error('Resposta não é um array');
      }
      
      return questions;
    } catch (error) {
      console.error('Erro ao fazer parse das perguntas:', error);
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
      // Remove markdown code blocks se existirem
      const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) || 
                       response.match(/```\s*([\s\S]*?)\s*```/);
      const jsonString = jsonMatch ? jsonMatch[1] : response;
      
      const smartObj = JSON.parse(jsonString.trim());
      
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
      throw new Error('Não foi possível processar o objetivo SMART');
    }
  }
}
