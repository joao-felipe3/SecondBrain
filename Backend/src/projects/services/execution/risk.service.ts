import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Risk, RiskDocument } from '../../schemas/risk.schema';
import { GoogleGenerativeAI } from '@google/generative-ai';

import { GeneratedRisk, RiskIntervention } from '../../interfaces/risk.interface';

@Injectable()
export class RiskService {
  private readonly logger = new Logger(RiskService.name);
  private genAI: GoogleGenerativeAI;

  constructor(@InjectModel(Risk.name) private riskModel: Model<RiskDocument>) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || '';
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  async assessRisks(projectId: string, projectDescription: string): Promise<Risk[]> {
    try {
      const modelName = process.env.GEMINI_STRONG_MODEL || 'gemini-2.5-flash-lite';
      const model = this.genAI.getGenerativeModel({ model: modelName });

      const prompt = `
Você é um especialista em gerenciamento de projetos. 
Analise a descrição do projeto e identifique os principais riscos.

Descrição do Projeto:
${projectDescription}

Retorne um JSON com um array de riscos. Cada risco deve ter:
- description (string): descrição clara do risco
- probability (number): probabilidade de 0-100 (%)
- impact (number): impacto de 1-5
- severity (string): 'baixa', 'média' ou 'alta' (baseado em probability * impact / 5)
- mitigationPlan (string): plano inicial de mitigação

Exemplo de resposta:
{
  "risks": [
    {
      "description": "Falta de recursos técnicos especializados",
      "probability": 40,
      "impact": 4,
      "severity": "média",
      "mitigationPlan": "Contratar consultoria externa ou treinar equipe com antecedência"
    }
  ]
}

Retorne APENAS o JSON, sem markdown ou formatação extra.
      `;

      const result = await model.generateContent(prompt);
      let responseText = result.response.text();

      // Clean up markdown formatting (remove triple backticks)
      responseText = responseText
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();

      // Parse JSON response
      let parsedResponse;
      try {
        parsedResponse = JSON.parse(responseText);
      } catch (parseError) {
        this.logger.warn(`Erro ao parsear resposta do LLM: ${responseText}`);
        return [];
      }

      const generatedRisks = parsedResponse.risks || [];

      // Salvar riscos no banco
      const savedRisks: Risk[] = [];
      for (const risk of generatedRisks) {
        const savedRisk = await this.riskModel.create({
          projectId: new Types.ObjectId(projectId),
          description: risk.description,
          probability: Math.min(100, Math.max(0, risk.probability)),
          impact: Math.min(5, Math.max(1, risk.impact)),
          severity: risk.severity || this.calculateSeverity(risk.probability, risk.impact),
          mitigationPlan: risk.mitigationPlan,
          status: 'identificado',
        });
        savedRisks.push(savedRisk);
      }

      this.logger.debug(`${savedRisks.length} riscos identificados para projeto ${projectId}`);
      return savedRisks;
    } catch (error) {
      console.error('[RiskService.assessRisks] Error:', error);
      const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
      this.logger.error(
        `Erro ao avaliar riscos: ${errorMessage}`,
        error instanceof Error ? error.stack : '',
      );
      return [];
    }
  }

  private calculateSeverity(probability: number, impact: number): 'baixa' | 'média' | 'alta' {
    const score = (probability / 100) * impact;
    if (score <= 1.5) return 'baixa';
    if (score <= 3) return 'média';
    return 'alta';
  }

  async getRisksByProject(projectId: string): Promise<Risk[]> {
    return this.riskModel
      .find({ projectId: new Types.ObjectId(projectId) })
      .sort({ createdAt: -1 })
      .exec();
  }

  async getRisksBySeverity(projectId: string, severity: string): Promise<Risk[]> {
    return this.riskModel
      .find({
        projectId: new Types.ObjectId(projectId),
        severity,
      })
      .exec();
  }

  async updateMitigationPlan(riskId: string, mitigationPlan: string): Promise<Risk | null> {
    return this.riskModel.findByIdAndUpdate(riskId, { mitigationPlan }, { new: true }).exec();
  }

  async updateRiskStatus(
    riskId: string,
    status: 'identificado' | 'mitigando' | 'resolvido' | 'aceito',
  ): Promise<Risk | null> {
    return this.riskModel.findByIdAndUpdate(riskId, { status }, { new: true }).exec();
  }

  async deleteRisk(riskId: string): Promise<Risk | null> {
    return this.riskModel.findByIdAndDelete(riskId).exec();
  }

  async getRiskStatistics(projectId: string): Promise<{
    total: number;
    byStatus: Record<string, number>;
    bySeverity: Record<string, number>;
  }> {
    const risks = await this.getRisksByProject(projectId);

    const byStatus = {
      identificado: 0,
      mitigando: 0,
      resolvido: 0,
      aceito: 0,
    };

    const bySeverity = {
      baixa: 0,
      média: 0,
      alta: 0,
    };

    for (const risk of risks) {
      byStatus[risk.status]++;
      bySeverity[risk.severity]++;
    }

    return {
      total: risks.length,
      byStatus,
      bySeverity,
    };
  }

  async getRiskInterventions(projectId: string): Promise<{
    summary: {
      total: number;
      criticos: number;
      recomendacoesPrioritarias: number;
    };
    interventions: RiskIntervention[];
  }> {
    const risks = await this.getRisksByProject(projectId);

    const interventions: RiskIntervention[] = risks
      .map((risk) => {
        const score = (Number(risk.probability || 0) / 100) * Number(risk.impact || 0);

        let recommendedAction: RiskIntervention['recommendedAction'] = 'monitorar';
        let rationale = 'Risco controlado; manter monitoramento ativo.';
        let confidence = 0.55;

        if (risk.severity === 'alta' && risk.status === 'identificado') {
          recommendedAction = 'reduzir-escopo';
          rationale = 'Severidade alta e sem mitigacao ativa: reduzir escopo evita atraso em cascata.';
          confidence = 0.9;
        } else if (risk.severity === 'alta' && risk.status === 'mitigando') {
          recommendedAction = 'trocar-estrategia';
          rationale = 'Risco alto em mitigacao: revisar abordagem pode aumentar chance de sucesso.';
          confidence = 0.82;
        } else if (score >= 2 && risk.status !== 'resolvido') {
          recommendedAction = 'pausa-planejada';
          rationale = 'Impacto relevante: uma pausa curta para replanejar reduz retrabalho.';
          confidence = 0.72;
        }

        return {
          riskId: String((risk as any)._id),
          description: risk.description,
          severity: risk.severity,
          status: risk.status,
          recommendedAction,
          rationale,
          confidence: Number(confidence.toFixed(2)),
        };
      })
      .sort((a, b) => b.confidence - a.confidence);

    const criticos = interventions.filter((item) => item.severity === 'alta').length;
    const recomendacoesPrioritarias = interventions.filter(
      (item) => item.recommendedAction !== 'monitorar',
    ).length;

    return {
      summary: {
        total: interventions.length,
        criticos,
        recomendacoesPrioritarias,
      },
      interventions,
    };
  }
}
