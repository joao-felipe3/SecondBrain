export type RiskSeverity = 'baixa' | 'média' | 'alta';
export type RiskStatus = 'identificado' | 'mitigando' | 'resolvido' | 'aceito';
export type RiskRecommendedAction =
  | 'reduzir-escopo'
  | 'trocar-estrategia'
  | 'pausa-planejada'
  | 'monitorar';

export interface GeneratedRisk {
  description: string;
  probability: number;
  impact: number;
  severity: RiskSeverity;
  mitigationPlan?: string;
}

export interface LLMRiskAssessmentResponse {
  risks: Array<{
    description: string;
    probability: number;
    impact: number;
    severity?: RiskSeverity;
    mitigationPlan?: string;
  }>;
}

export interface RiskIntervention {
  riskId: string;
  description: string;
  severity: RiskSeverity;
  status: RiskStatus;
  recommendedAction: RiskRecommendedAction;
  rationale: string;
  confidence: number;
}

export interface RiskStatistics {
  total: number;
  byStatus: Record<RiskStatus, number>;
  bySeverity: Record<RiskSeverity, number>;
}

export interface RiskInterventionsResponse {
  summary: {
    total: number;
    criticos: number;
    recomendacoesPrioritarias: number;
  };
  interventions: RiskIntervention[];
}
