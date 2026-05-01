import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { GeminiService } from './gemini.service';

@Injectable()
export class FeedbackService {
  constructor(
    private readonly geminiService: GeminiService,
    @InjectModel('TaskCompletionFeedback') private readonly feedbackModel: Model<any>,
  ) {}

  private safeParseJson(raw: string): any {
    if (!raw || typeof raw !== 'string') return null;
    let cleaned = raw.trim();
    if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
    if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
    if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
    const arrMatch = cleaned.match(/\{[\s\S]*\}/);
    if (arrMatch) cleaned = arrMatch[0];
    try {
      return JSON.parse(cleaned);
    } catch {
      try {
        // remove trailing commas
        const safer = cleaned.replace(/,\s*([}\]])/g, '$1').replace(/[\x00-\x1F\x7F]/g, ' ');
        return JSON.parse(safer);
      } catch {
        return null;
      }
    }
  }

  /**
   * Gera feedback estruturado ao concluir uma task.
   * Retorna objeto: { celebration, validation, question, suggestion }
   */
  async generateFeedbackOnCompletion(
    task: any,
    checklist?: any[],
    timeSpentMinutes?: number,
  ): Promise<{ celebration: string; validation: string; question: string; suggestion: string }>
  {
    if (!task || !task._id) throw new BadRequestException('Task inválida');

    const checklistSummary = Array.isArray(checklist)
      ? checklist.map((it) => ({ item: typeof it === 'string' ? it : it.item, completed: !!(it as any).completed }))
      : [];

    const percent = checklistSummary.length > 0
      ? Math.round((checklistSummary.filter((c) => c.completed).length / checklistSummary.length) * 100)
      : 100;

    const prompt = [
      'Você é um receptor de bola (catchball) que fornece feedback curto e acionável quando uma tarefa é concluída.',
      `Tarefa: ${String(task.name || '')}`,
      task.description ? `Descrição: ${String(task.description)}` : '',
      `Checklist completion: ${percent}% (${checklistSummary.length} items)`,
      timeSpentMinutes ? `Tempo gasto (minutos): ${timeSpentMinutes}` : '',
      '',
      'Gere um JSON válido com exatamente essas chaves (strings):',
      '- celebration: uma frase curta parabenizando e reconhecendo o esforço',
      '- validation: resumo objetivo sobre o checklist e se a entrega atende critérios de aceitação (1 frase)',
      '- question: uma pergunta aberta sobre impedimentos ou riscos (1 frase)',
      '- suggestion: uma sugestão PDCA/next step (1 frase)',
      'Responda APENAS com o JSON, sem texto adicional, sem markdown.',
    ].filter(Boolean).join('\n');

    try {
      const raw = await this.geminiService.generateContent(prompt, {
        responseMimeType: this.geminiService.supportsJsonMode() ? 'application/json' : undefined,
        temperature: 0.3,
        maxOutputTokens: 400,
      });

      const parsed = this.safeParseJson(raw) || {};

      const celebration = String(parsed?.celebration ?? parsed?.praise ?? parsed?.recognition ?? '').trim();
      const validation = String(parsed?.validation ?? parsed?.learning ?? '').trim();
      const question = String(parsed?.question ?? parsed?.inquiry ?? parsed?.nextStep ?? '').trim();
      const suggestion = String(parsed?.suggestion ?? parsed?.suggest ?? parsed?.nextStep ?? '').trim();

      const feedbackObj = {
        celebration: celebration || `Parabéns por concluir "${String(task.name || '')}".`,
        validation: validation || `Checklist: ${percent}% completo.`,
        question: question || 'Houve algum impedimento durante a execução? (resuma em 1 frase)',
        suggestion: suggestion || 'Sugestão: revisar os pontos não concluídos e planejar próximo passo (PDCA).',
      };

      // Persist raw JSON string for audit
      await this.feedbackModel.create({
        task: new Types.ObjectId(String(task._id)),
        project: task.project ? new Types.ObjectId(String(task.project)) : undefined,
        modelName: this.geminiService.getModelName(),
        promptVersion: 'catchball-v1',
        inputSnapshot: { name: task.name, checklist: checklistSummary, timeSpentMinutes },
        feedback: JSON.stringify(feedbackObj),
      });

      return feedbackObj;
    } catch (err: any) {
      // On error, persist error record
      try {
        await this.feedbackModel.create({
          task: new Types.ObjectId(String(task._id)),
          project: task.project ? new Types.ObjectId(String(task.project)) : undefined,
          modelName: this.geminiService.getModelName(),
          promptVersion: 'catchball-v1',
          inputSnapshot: { name: task.name, checklist: checklistSummary, timeSpentMinutes },
          error: String(err?.message ?? err),
        });
      } catch {}
      throw err;
    }
  }

  /**
   * Sugere próximos passos acionáveis com base no feedback existente.
   */
  async suggestNextSteps(task: any, feedback: any): Promise<Array<{ title: string; description: string }>> {
    if (!task || !task._id) throw new BadRequestException('Task inválida');

    const prompt = [
      'Baseado no feedback abaixo, gere 3 próximos passos acionáveis e curtos (título + descrição).',
      `Tarefa: ${String(task.name || '')}`,
      feedback ? `Feedback: ${typeof feedback === 'string' ? feedback : JSON.stringify(feedback)}` : '',
      '',
      'Retorne APENAS um array JSON de objetos com chaves: title (string), description (string).',
      'Exemplo: [{"title":"Revisar checklist","description":"Corrigir item X e atualizar definição de pronto"}]',
    ].filter(Boolean).join('\n');

    try {
      const raw = await this.geminiService.generateContent(prompt, {
        responseMimeType: this.geminiService.supportsJsonMode() ? 'application/json' : undefined,
        temperature: 0.4,
        maxOutputTokens: 600,
      });

      const parsed = this.safeParseJson(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.slice(0, 5).map((p: any) => ({
          title: String(p.title || p.name || '').trim(),
          description: String(p.description || p.desc || '').trim(),
        }));
      }

      // Fallback: simple mapping
      const fallback = [] as Array<{ title: string; description: string }>;
      fallback.push({ title: 'Revisar checklist', description: 'Verificar itens não concluídos e atualizar definição de pronto.' });
      fallback.push({ title: 'Planejar próximo passo', description: 'Criar uma micro-tarefa com o próximo passo sugerido.' });
      return fallback;
    } catch (err) {
      return [
        { title: 'Revisar checklist', description: 'Verificar itens não concluídos e atualizar definição de pronto.' },
      ];
    }
  }
}
