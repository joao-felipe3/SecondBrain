import { GenerateAlertsDto } from '../../../dto/dependencies/cpm.dto';

export function generateAlerts({ tasks, criticalTasks, diagnostics }: GenerateAlertsDto): string[] {
  const alerts: string[] = [];

  if (diagnostics.cycleDetected) {
    alerts.push('Ciclo detectado nas dependências do projeto.');
  }
  if (diagnostics.missingDependencyRefs > 0) {
    alerts.push(`Há ${diagnostics.missingDependencyRefs} referências de dependência ausentes.`);
  }
  if (criticalTasks.length === tasks.length && tasks.length > 0) {
    alerts.push('Todas as tarefas estão críticas; o cronograma está sem folga.');
  } else if (criticalTasks.length > 0 && criticalTasks.length < tasks.length) {
    alerts.push('O cronograma possui tarefas com folga; revise o paralelismo e o caminho crítico.');
  }

  return alerts;
}
