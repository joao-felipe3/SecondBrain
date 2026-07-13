import type {
  EVMPersonalMetrics,
  EVMForecast,
  EVMMetricRelevance,
  EVMDashboardManualVisibility,
  EVMDashboardPreferences,
} from '../../../dto/evm.dto';

export function resolveMetricRelevance(input: {
  entriesCount: number;
  spi: number;
  forecast: EVMForecast;
  personalMetrics: EVMPersonalMetrics;
  dashboardPreferences: EVMDashboardPreferences;
}): EVMMetricRelevance {
  const useManual = input.dashboardPreferences?.mode === 'manual';
  const manual = input.dashboardPreferences?.manualVisibility;

  const resolve = (
    key: keyof EVMDashboardManualVisibility,
    autoResolution: { visible: boolean; reason: string },
  ) => {
    if (useManual && manual) {
      return {
        visible: Boolean(manual[key]),
        reason: 'Visibilidade definida manualmente pelo usuario.',
      };
    }
    return autoResolution;
  };

  const { entriesCount, spi, forecast, personalMetrics } = input;

  return {
    spi: resolve('spi', getAutoSpiVisibility()),
    plannedVsEarned: resolve(
      'plannedVsEarned',
      getAutoPlannedVsEarnedVisibility(entriesCount, spi, personalMetrics.planAdherence),
    ),
    completedHours: resolve('completedHours', getAutoCompletedHoursVisibility(entriesCount)),
    consistency: resolve('consistency', getAutoConsistencyVisibility(entriesCount)),
    planAdherence: resolve('planAdherence', getAutoPlanAdherenceVisibility(entriesCount)),
    trend: resolve('trend', getAutoTrendVisibility(entriesCount)),
    perceivedProgress: resolve('perceivedProgress', getAutoPerceivedProgressVisibility(entriesCount)),
    remainingHours: resolve('remainingHours', getAutoRemainingHoursVisibility(forecast.remainingHours)),
  };
}

function getAutoSpiVisibility(): { visible: boolean; reason: string } {
  return {
    visible: true,
    reason: 'SPI e a metrica principal de ritmo da entrega.',
  };
}

function getAutoPlannedVsEarnedVisibility(
  entriesCount: number,
  spi: number,
  planAdherence: number,
): { visible: boolean; reason: string } {
  const needsScheduleAttention = spi < 1 || planAdherence < 95;
  return {
    visible: entriesCount > 0 && needsScheduleAttention,
    reason: needsScheduleAttention
      ? 'PV x EV ajuda a decidir ajuste de plano na semana atual.'
      : 'Projeto em ritmo saudavel; PV x EV tem baixa prioridade agora.',
  };
}

function getAutoCompletedHoursVisibility(entriesCount: number): { visible: boolean; reason: string } {
  return {
    visible: entriesCount > 0,
    reason:
      entriesCount > 0
        ? 'Horas concluidas mostram esforco real aplicado.'
        : 'Sem registros de progresso suficientes para horas concluidas.',
  };
}

function getAutoConsistencyVisibility(entriesCount: number): { visible: boolean; reason: string } {
  return {
    visible: entriesCount >= 2,
    reason:
      entriesCount >= 2
        ? 'Consistencia semanal ajuda a prever estabilidade de execucao.'
        : 'Consistencia requer pelo menos 2 registros de progresso.',
  };
}

function getAutoPlanAdherenceVisibility(entriesCount: number): { visible: boolean; reason: string } {
  return {
    visible: entriesCount > 0,
    reason:
      entriesCount > 0
        ? 'Aderencia mostra alinhamento com o plano atual.'
        : 'Aderencia requer registros com PV/EV.',
  };
}

function getAutoTrendVisibility(entriesCount: number): { visible: boolean; reason: string } {
  return {
    visible: entriesCount >= 4,
    reason:
      entriesCount >= 4
        ? 'Tendencia de evolucao orienta decisao de manter ou ajustar escopo.'
        : 'Tendencia precisa de ao menos 4 registros para comparacao confiavel.',
  };
}

function getAutoPerceivedProgressVisibility(entriesCount: number): { visible: boolean; reason: string } {
  return {
    visible: entriesCount >= 2,
    reason:
      entriesCount >= 2
        ? 'Progresso percebido combina cadencia, aderencia e esforco efetivo.'
        : 'Progresso percebido fica mais util apos multiplos registros.',
  };
}

function getAutoRemainingHoursVisibility(remainingHours: number): { visible: boolean; reason: string } {
  return {
    visible: remainingHours > 0,
    reason:
      remainingHours > 0
        ? 'Horas restantes mostram carga de trabalho pendente.'
        : 'Nao ha carga pendente estimada para este ciclo.',
  };
}
