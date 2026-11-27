/**
 * Rolling Wave a partir dos pacotes WBS (funções puras, sem IA).
 *
 * 1. `computeWaveStructure`: quantas ondas, datas e capacidade (h) de cada uma.
 * 2. `splitPackageIntoSlices`: pacotes grandes viram fatias de até SLICE_MAX_HOURS.
 * 3. `assignSlicesToWaves`: distribui as fatias pelas ondas. Cada ramo de nível 1 da WBS é
 *    uma frente de trabalho paralela; dentro do ramo a ordem da WBS é mantida e as horas
 *    são espalhadas ao longo das ondas na proporção da capacidade de cada onda.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Teto de horas de uma fatia: o que uma geração de micro-tarefas detalha bem de uma vez. */
export const SLICE_MAX_HOURS = 20;

export interface SlicingPackage {
  wbsNodeId: string;
  wbsPath: string;
  packageName: string;
  description?: string;
  /** Frente de trabalho (ramo de nível 1 da WBS). */
  branchKey: string;
  /** Horas ainda não detalhadas/planejadas deste pacote. */
  remainingHours: number;
}

export interface PlannedSlice {
  wbsNodeId: string;
  wbsPath: string;
  packageName: string;
  branchKey: string;
  sliceIndex: number;
  sliceCount: number;
  hours: number;
  goal: string;
}

export interface WaveSlot {
  startDate: Date;
  endDate: Date;
  days: number;
  capacityHours: number;
}

export interface WaveStructure {
  waves: WaveSlot[];
  /** Preenchido quando a capacidade diária exige mais dias que o prazo do projeto. */
  adjustedDeadline: Date | null;
}

export function roundToHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function computeWaveStructure(params: {
  startDate: Date;
  deadline?: Date | string | null;
  totalHours: number;
  dailyCapacityHours: number;
  waveLengthDays: number;
}): WaveStructure {
  const start = startOfDay(params.startDate);
  const dailyCapacity = params.dailyCapacityHours > 0 ? params.dailyCapacityHours : 6;
  const waveLength = Math.max(7, Math.round(params.waveLengthDays || 28));

  const deadline = params.deadline ? new Date(params.deadline) : null;
  const plannedDays =
    deadline && !Number.isNaN(deadline.getTime())
      ? Math.max(0, Math.ceil((deadline.getTime() - start.getTime()) / DAY_MS))
      : 0;
  const requiredDays = Math.ceil(Math.max(0, params.totalHours) / dailyCapacity);
  const totalDays = Math.max(1, plannedDays, requiredDays);

  const waveCount = Math.max(1, Math.round(totalDays / waveLength));
  const baseDays = Math.floor(totalDays / waveCount);
  const extraDays = totalDays % waveCount;

  const waves: WaveSlot[] = [];
  let cursor = start;
  for (let i = 0; i < waveCount; i++) {
    const days = baseDays + (i < extraDays ? 1 : 0);
    const endDate = new Date(cursor.getTime() + days * DAY_MS);
    waves.push({ startDate: cursor, endDate, days, capacityHours: days * dailyCapacity });
    cursor = endDate;
  }

  const adjustedDeadline =
    deadline && requiredDays > plannedDays ? new Date(start.getTime() + totalDays * DAY_MS) : null;

  return { waves, adjustedDeadline };
}

/** Divide as horas restantes do pacote em fatias iguais (múltiplos de 0,5h) de até SLICE_MAX_HOURS. */
export function splitPackageIntoSlices(pkg: SlicingPackage): PlannedSlice[] {
  const hours = roundToHalf(pkg.remainingHours);
  if (hours <= 0) return [];

  const count = hours <= SLICE_MAX_HOURS ? 1 : Math.ceil(hours / SLICE_MAX_HOURS);
  const units = Math.round(hours * 2);
  const baseUnits = Math.floor(units / count);
  const extraUnits = units % count;

  return Array.from({ length: count }, (_, i) => ({
    wbsNodeId: pkg.wbsNodeId,
    wbsPath: pkg.wbsPath,
    packageName: pkg.packageName,
    branchKey: pkg.branchKey,
    sliceIndex: i + 1,
    sliceCount: count,
    hours: (baseUnits + (i < extraUnits ? 1 : 0)) / 2,
    goal: count > 1 ? `Parte ${i + 1}/${count}` : defaultSingleSliceGoal(pkg),
  }));
}

function defaultSingleSliceGoal(pkg: SlicingPackage): string {
  const desc = String(pkg.description || '').trim();
  if (!desc) return 'Pacote completo';
  const firstSentence = desc.split(/(?<=[.!?])\s/)[0];
  return firstSentence.length > 160 ? `${firstSentence.slice(0, 157)}...` : firstSentence;
}

/**
 * Índice da onda de cada fatia (mesma ordem de `slices`).
 * Por frente: as horas da frente são distribuídas pelas ondas na proporção da capacidade;
 * cada fatia vai para a onda em que cai o ponto médio do seu intervalo acumulado.
 */
export function assignSlicesToWaves(slices: PlannedSlice[], capacities: number[]): number[] {
  const waveCount = capacities.length;
  const result = new Array<number>(slices.length).fill(0);
  if (waveCount <= 1) return result;

  const totalCapacity = capacities.reduce((a, b) => a + Math.max(0, b), 0);
  const cumulativeShare: number[] = [];
  let acc = 0;
  for (const cap of capacities) {
    acc += totalCapacity > 0 ? Math.max(0, cap) / totalCapacity : 1 / waveCount;
    cumulativeShare.push(acc);
  }

  const byBranch = new Map<string, number[]>();
  slices.forEach((slice, idx) => {
    const list = byBranch.get(slice.branchKey) ?? [];
    list.push(idx);
    byBranch.set(slice.branchKey, list);
  });

  for (const indices of byBranch.values()) {
    const branchTotal = indices.reduce((sum, idx) => sum + slices[idx].hours, 0);
    if (branchTotal <= 0) continue;
    let cursor = 0;
    for (const idx of indices) {
      const mid = (cursor + slices[idx].hours / 2) / branchTotal;
      let wave = cumulativeShare.findIndex((bound) => mid <= bound + 1e-9);
      if (wave < 0) wave = waveCount - 1;
      result[idx] = wave;
      cursor += slices[idx].hours;
    }
  }
  return result;
}

/** Fatia todos os pacotes (em ordem da WBS) e agrupa as fatias por onda. */
export function sliceWbsPackagesIntoWaves(
  packages: SlicingPackage[],
  capacities: number[],
): PlannedSlice[][] {
  const slices = packages.flatMap((pkg) => splitPackageIntoSlices(pkg));
  const assignment = assignSlicesToWaves(slices, capacities);
  const byWave: PlannedSlice[][] = capacities.map(() => []);
  slices.forEach((slice, idx) => byWave[Math.min(assignment[idx], byWave.length - 1)].push(slice));
  return byWave;
}

/** Descrição curta da onda a partir dos pacotes que ela contém. */
export function describeWaveFromSlices(slices: PlannedSlice[]): string {
  const names = Array.from(new Set(slices.map((s) => s.packageName)));
  const hours = slices.reduce((sum, s) => sum + s.hours, 0);
  if (names.length === 0) return 'Onda sem pacotes planejados';
  const shown = names.slice(0, 4).join(', ');
  const more = names.length > 4 ? ` (+${names.length - 4})` : '';
  return `${roundToHalf(hours)}h · ${shown}${more}`;
}
