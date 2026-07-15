import { ProjectProgress } from '../../../schemas/project-progress.schema';
import { ProjectWave } from '../../../schemas/project-wave.schema';
import type { EVMCurve, BuildEVMCurvePointsParamsDto } from '../../../dto/evm.dto';
import { getScheduleRatioByDates, toFiniteNumber } from './evm-calculations.util';

export function buildEVMCurvePoints(dto: BuildEVMCurvePointsParamsDto): EVMCurve {
  const { scopedEntries, plannedHours, startDate, endDate } = dto;
  const totalPV = scopedEntries.reduce((sum, entry) => sum + (entry.plannedValue || 0), 0);
  const safePlannedHours = Math.max(1, plannedHours);
  const bac = Math.max(1, totalPV, safePlannedHours);

  let cumulativeHours = 0;
  const plannedValue: number[] = [];
  const actualValue: number[] = [];
  const dates: string[] = [];

  for (const entry of scopedEntries) {
    cumulativeHours += entry.completedHours || 0;

    const progressRatio = Math.max(0, Math.min(1, cumulativeHours / safePlannedHours));
    const cumulativeEV = bac * progressRatio;
    const scheduleRatio = getScheduleRatioByDates(startDate, endDate, new Date(entry.date));
    const cumulativePV =
      scheduleRatio !== null
        ? bac * scheduleRatio
        : plannedValue.length > 0
          ? plannedValue[plannedValue.length - 1] + (entry.plannedValue || 0)
          : entry.plannedValue || 0;

    plannedValue.push(Number(cumulativePV.toFixed(2)));
    actualValue.push(Number(cumulativeEV.toFixed(2)));
    dates.push(new Date(entry.date).toISOString().slice(0, 10));
  }

  return {
    plannedValue,
    actualValue,
    dates,
  };
}

export function calculateActiveWavePlannedHours(
  fallbackPlannedHours: number,
  waves: ProjectWave[],
  activeWave: ProjectWave,
): number {
  const totalWaveDurationMs = waves.reduce((sum, wave) => {
    const duration = new Date(wave.endDate).getTime() - new Date(wave.startDate).getTime();
    return sum + Math.max(0, toFiniteNumber(duration, 0));
  }, 0);

  const activeDurationRaw =
    new Date(activeWave.endDate).getTime() - new Date(activeWave.startDate).getTime();
  const activeWaveDurationMs = Math.max(0, toFiniteNumber(activeDurationRaw, 0));

  const plannedHours =
    totalWaveDurationMs > 0
      ? fallbackPlannedHours * (activeWaveDurationMs / totalWaveDurationMs)
      : fallbackPlannedHours / Math.max(1, waves.length);

  return Math.max(1, plannedHours);
}
