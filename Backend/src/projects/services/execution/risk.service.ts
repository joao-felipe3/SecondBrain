import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Risk, RiskDocument } from '../../schemas/risk.schema';
import { GeminiService } from '../../../ai/gemini.service';
import { buildRiskAssessmentPrompt } from '../../../ai/prompts/risk.prompts';
import { CreateRiskDto, UpdateRiskDto } from '../../dto/risk.dto';
import {
  RiskSeverity,
  LLMRiskAssessmentResponse,
  RiskStatus,
  RiskRecommendedAction,
  RiskIntervention,
  RiskStatistics,
  RiskInterventionsResponse,
} from '../../interfaces/risk.interface';

@Injectable()
export class RiskService {
  private readonly logger = new Logger(RiskService.name);

  constructor(
    @InjectModel(Risk.name) private riskModel: Model<RiskDocument>,
    private readonly geminiService: GeminiService,
  ) {}

  async assessRisks(projectId: string, projectDescription: string): Promise<Risk[]> {
    try {
      const modelName = process.env.GEMINI_STRONG_MODEL || 'gemini-2.5-flash-lite';
      const prompt = buildRiskAssessmentPrompt(projectDescription);

      const responseText = await this.geminiService.generateContent(prompt, {
        model: modelName,
      });

      // Parse JSON response
      let parsedResponse: LLMRiskAssessmentResponse;
      try {
        parsedResponse = JSON.parse(responseText) as LLMRiskAssessmentResponse;
      } catch (parseError) {
        this.logger.warn(`Erro ao parsear resposta do LLM: ${responseText}`);
        return [];
      }

      const generatedRisks = parsedResponse.risks || [];

      // Salvar riscos no banco
      const savedRisks: Risk[] = [];
      for (const risk of generatedRisks) {
        const savedRisk = await this.createRisk(projectId, {
          description: risk.description,
          probability: risk.probability,
          impact: risk.impact,
          severity: risk.severity,
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

  private calculateSeverity(probability: number, impact: number): RiskSeverity {
    const score = (probability / 100) * impact;
    if (score <= 1.5) return 'baixa';
    if (score <= 3) return 'média';
    return 'alta';
  }

  async createRisk(projectId: string, createRiskDto: CreateRiskDto): Promise<Risk> {
    const probability = Math.min(100, Math.max(0, createRiskDto.probability));
    const impact = Math.min(5, Math.max(1, createRiskDto.impact));
    const severity = createRiskDto.severity || this.calculateSeverity(probability, impact);

    const { targetResolutionDate, ...rest } = createRiskDto;
    const dateParsed = targetResolutionDate ? new Date(targetResolutionDate) : undefined;

    return this.riskModel.create({
      ...rest,
      projectId: new Types.ObjectId(projectId),
      probability,
      impact,
      severity,
      targetResolutionDate: dateParsed,
      status: createRiskDto.status || 'identificado',
    });
  }

  async updateRisk(riskId: string, updateRiskDto: UpdateRiskDto): Promise<Risk | null> {
    const existing = await this.riskModel.findById(riskId).exec();
    if (!existing) {
      return null;
    }

    const { targetResolutionDate, ...rest } = updateRiskDto;
    const updates: Partial<Risk> = { ...rest } as any;

    if (targetResolutionDate !== undefined) {
      updates.targetResolutionDate = targetResolutionDate ? new Date(targetResolutionDate) : undefined;
    }

    // Se probabilidade ou impacto mudarem e a severidade não for fornecida explicitamente, recalculamos
    const probability =
      updateRiskDto.probability !== undefined ? updateRiskDto.probability : existing.probability;
    const impact = updateRiskDto.impact !== undefined ? updateRiskDto.impact : existing.impact;

    if (updateRiskDto.probability !== undefined || updateRiskDto.impact !== undefined) {
      updates.probability = Math.min(100, Math.max(0, probability));
      updates.impact = Math.min(5, Math.max(1, impact));

      if (!updateRiskDto.severity) {
        updates.severity = this.calculateSeverity(updates.probability, updates.impact);
      }
    }

    return this.riskModel.findByIdAndUpdate(riskId, updates, { new: true }).exec();
  }

  async getRisksByProject(projectId: string): Promise<Risk[]> {
    return this.riskModel
      .find({ projectId: new Types.ObjectId(projectId) })
      .sort({ createdAt: -1 })
      .exec();
  }

  async getRisksBySeverity(projectId: string, severity: RiskSeverity): Promise<Risk[]> {
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

  async updateRiskStatus(riskId: string, status: RiskStatus): Promise<Risk | null> {
    return this.riskModel.findByIdAndUpdate(riskId, { status }, { new: true }).exec();
  }

  async deleteRisk(riskId: string): Promise<Risk | null> {
    return this.riskModel.findByIdAndDelete(riskId).exec();
  }

  async getRiskStatistics(projectId: string): Promise<RiskStatistics> {
    const risks = await this.getRisksByProject(projectId);

    const byStatus: Record<RiskStatus, number> = {
      identificado: 0,
      mitigando: 0,
      resolvido: 0,
      aceito: 0,
    };

    const bySeverity: Record<RiskSeverity, number> = {
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

  async getRiskInterventions(projectId: string): Promise<RiskInterventionsResponse> {
    const risks = await this.getRisksByProject(projectId);

    const interventions: RiskIntervention[] = risks
      .map((risk) => {
        const score = (Number(risk.probability || 0) / 100) * Number(risk.impact || 0);

        let recommendedAction: RiskRecommendedAction = 'monitorar';
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
