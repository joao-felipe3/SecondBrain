export interface GeneratedRisk {
  description: string;
  probability: number;
  impact: number;
  severity: 'baixa' | 'média' | 'alta';
  mitigationPlan?: string;
}

export interface RiskIntervention {
  riskId: string;
  description: string;
  severity: 'baixa' | 'média' | 'alta';
  status: 'identificado' | 'mitigando' | 'resolvido' | 'aceito';
  recommendedAction: 'reduzir-escopo' | 'trocar-estrategia' | 'pausa-planejada' | 'monitorar';
  rationale: string;
  confidence: number;
}
