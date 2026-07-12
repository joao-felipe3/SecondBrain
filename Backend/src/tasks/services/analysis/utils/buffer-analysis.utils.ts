import {
  BufferTaskMetrics,
  BufferStatus,
  BufferAlert,
  BufferCalculationResult,
} from '../../../interfaces';

// Filtra as tarefas críticas baseado na lista do caminho crítico.
export function filterCriticalTasks(
  tasks: BufferTaskMetrics[],
  criticalPath: string[],
): BufferTaskMetrics[] {
  return tasks.filter((t) => criticalPath.includes(t.taskId));
}

// Calcula a duração do caminho crítico, a variância total, o desvio padrão e o tamanho do buffer.
export function calculateMetrics(criticalTasks: BufferTaskMetrics[]): BufferCalculationResult {
  const criticalPathDuration = criticalTasks.reduce((sum, t) => sum + t.estimatedHours, 0);
  const totalVariance = criticalTasks.reduce((sum, t) => sum + (t.variance || 0), 0);
  const standardDeviation = Math.sqrt(totalVariance);
  const projectBuffer = Math.max(criticalPathDuration * 0.5, standardDeviation * 1.645);

  return {
    criticalPathDuration,
    totalVariance,
    standardDeviation,
    projectBuffer,
  };
}

// Mapeia e arredonda as variâncias das tarefas críticas
export function mapTaskVariances(
  criticalTasks: BufferTaskMetrics[],
): { taskId: string; variance: number }[] {
  return criticalTasks
    .filter((t) => typeof t.variance === 'number' && t.variance > 0)
    .map((t) => ({
      taskId: t.taskId,
      variance: Math.round(t.variance! * 100) / 100,
    }));
}

// Retorna o status de buffer padrão (zerado).
export function getDefaultBufferStatus(): BufferStatus {
  return {
    total: 0,
    consumed: 0,
    remaining: 0,
    percentageUsed: 0,
    isAlert: false,
  };
}

// Calcula o status detalhado do buffer baseado nos valores de buffer e consumo.
export function calculateBufferStatus(
  projectBuffer: number,
  consumed: number,
  threshold: number,
): BufferStatus {
  const percentageUsed = projectBuffer > 0 ? (consumed / projectBuffer) * 100 : 0;

  return {
    total: Math.round(projectBuffer * 10) / 10,
    consumed: Math.round(consumed * 10) / 10,
    remaining: Math.max(0, Math.round((projectBuffer - consumed) * 10) / 10),
    percentageUsed: Math.round(percentageUsed * 100) / 100,
    isAlert: percentageUsed >= threshold,
  };
}

// Gera os alertas com base no percentual do buffer consumido.
export function generateBufferAlerts(percentageUsed: number): BufferAlert[] {
  const alerts: BufferAlert[] = [];

  if (percentageUsed >= 50 && percentageUsed < 75) {
    alerts.push({
      severity: 'warning',
      message: `Buffer no ponto médio: ${percentageUsed}% consumido`,
      recommendation:
        'As próximas tarefas devem ser executadas sem atrasos. Considere aumentar os recursos ou priorizar.',
      percentageUsed,
    });
  }

  if (percentageUsed >= 75) {
    alerts.push({
      severity: 'critical',
      message: `⚠️ Buffer crítico: ${percentageUsed}% consumido`,
      recommendation:
        'AÇÃO IMEDIATA REQUERIDA. Tarefas restantes devem ser priorizadas. Reduza o escopo ou aumente os recursos.',
      percentageUsed,
    });
  }

  if (percentageUsed >= 100) {
    alerts.push({
      severity: 'critical',
      message: '🚨 Buffer completamente consumido',
      recommendation: 'O projeto está em risco. É necessária intervenção gerencial imediata.',
      percentageUsed,
    });
  }

  return alerts;
}
