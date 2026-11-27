/**
 * Rolling Wave a partir dos pacotes WBS (funções puras, sem IA).
 *
 * 1. `splitPackageIntoSlices`: pacotes viram fatias de até metade da meta da onda (máx. 20h).
 * 2. `packSlicesIntoWaves`: ondas pequenas e equilibradas (≈ meta de horas, padrão 30h, máx. 40h).
 *    Cada ramo de nível 1 da WBS é uma frente paralela; as fatias são tiradas das frentes em
 *    rodízio, mantendo a ordem da WBS dentro de cada frente.
 * 3. `scheduleWaves`: datas de cada onda, proporcionais à carga, cabendo no prazo (ou estendendo-o
 *    quando a capacidade diária não comporta as horas).
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Teto de horas de uma fatia: o que uma geração de micro-tarefas detalha bem de uma vez. */
export const SLICE_MAX_HOURS = 20;
/** Meta de horas por onda (padrão) e o teto aceito: uma onda deve ser menor que um pacote de 40h. */
export const DEFAULT_WAVE_TARGET_HOURS = 30;
export const MAX_WAVE_TARGET_HOURS = 40;

/** Meta de horas por onda, limitada a 8–40h. */
export function resolveWaveTargetHours(raw?: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_WAVE_TARGET_HOURS;
  return Math.min(MAX_WAVE_TARGET_HOURS, Math.max(8, n));
}

/** Fatia máxima para uma meta de onda: no máximo metade da onda, para as ondas ficarem equilibradas. */
export function sliceMaxForTarget(targetHours: number): number {
  return Math.min(SLICE_MAX_HOURS, Math.max(4, Math.floor(targetHours / 2)));
}

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
  hours: number;
}

export interface WaveSchedule {
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

/** Divide as horas restantes do pacote em fatias iguais (múltiplos de 0,5h) de até `maxSliceHours`. */
export function splitPackageIntoSlices(
  pkg: SlicingPackage,
  maxSliceHours: number = SLICE_MAX_HOURS,
): PlannedSlice[] {
  const hours = roundToHalf(pkg.remainingHours);
  if (hours <= 0) return [];

  const count = hours <= maxSliceHours ? 1 : Math.ceil(hours / maxSliceHours);
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
 * Agrupa as fatias (em ordem da WBS) em ondas de até `targetHours`.
 * Rodízio entre as frentes: a cada passada, cada frente entrega sua próxima fatia se ela couber;
 * quando nenhuma cabe, a onda fecha. Uma onda vazia sempre aceita a próxima fatia.
 */
export function packSlicesIntoWaves(slices: PlannedSlice[], targetHours: number): PlannedSlice[][] {
  const queues: PlannedSlice[][] = [];
  const queueByBranch = new Map<string, PlannedSlice[]>();
  for (const slice of slices) {
    let queue = queueByBranch.get(slice.branchKey);
    if (!queue) {
      queue = [];
      queueByBranch.set(slice.branchKey, queue);
      queues.push(queue);
    }
    queue.push(slice);
  }

  const waves: PlannedSlice[][] = [];
  let current: PlannedSlice[] = [];
  let load = 0;
  while (queues.some((q) => q.length > 0)) {
    let progressed = false;
    for (const queue of queues) {
      const next = queue[0];
      if (!next) continue;
      if (load === 0 || load + next.hours <= targetHours + 1e-9) {
        current.push(next);
        load += next.hours;
        queue.shift();
        progressed = true;
      }
    }
    if (!progressed) {
      waves.push(current);
      current = [];
      load = 0;
    }
  }
  if (current.length > 0) waves.push(current);
  return waves;
}

/** Fatia os pacotes (em ordem da WBS) e agrupa em ondas de até `targetHours`. */
export function sliceWbsPackagesIntoWaves(
  packages: SlicingPackage[],
  targetHours: number = DEFAULT_WAVE_TARGET_HOURS,
): PlannedSlice[][] {
  const maxSlice = sliceMaxForTarget(targetHours);
  const slices = packages.flatMap((pkg) => splitPackageIntoSlices(pkg, maxSlice));
  return packSlicesIntoWaves(slices, targetHours);
}

/**
 * Datas das ondas: o período total (até o prazo, ou o necessário pela capacidade diária)
 * é dividido na proporção das horas de cada onda; toda onda tem ao menos 1 dia.
 */
export function scheduleWaves(params: {
  waveHours: number[];
  startDate: Date;
  deadline?: Date | string | null;
  dailyCapacityHours: number;
}): WaveSchedule {
  const start = startOfDay(params.startDate);
  const dailyCapacity = params.dailyCapacityHours > 0 ? params.dailyCapacityHours : 6;
  const totalHours = params.waveHours.reduce((a, b) => a + Math.max(0, b), 0);
  const count = params.waveHours.length;

  const deadline = params.deadline ? new Date(params.deadline) : null;
  const plannedDays =
    deadline && !Number.isNaN(deadline.getTime())
      ? Math.max(0, Math.ceil((deadline.getTime() - start.getTime()) / DAY_MS))
      : 0;
  const requiredDays = Math.ceil(totalHours / dailyCapacity);
  const totalDays = Math.max(count, plannedDays, requiredDays, 1);

  // Dias por onda proporcionais às horas (mínimo 1), ajustando a última para fechar o total.
  const days = params.waveHours.map((h) =>
    Math.max(1, Math.round(totalHours > 0 ? (totalDays * h) / totalHours : totalDays / count)),
  );
  const diff = totalDays - days.reduce((a, b) => a + b, 0);
  if (count > 0) days[count - 1] = Math.max(1, days[count - 1] + diff);

  const waves: WaveSlot[] = [];
  let cursor = start;
  params.waveHours.forEach((hours, i) => {
    const endDate = new Date(cursor.getTime() + days[i] * DAY_MS);
    waves.push({ startDate: cursor, endDate, days: days[i], hours });
    cursor = endDate;
  });

  const adjustedDeadline =
    deadline && requiredDays > plannedDays ? new Date(start.getTime() + totalDays * DAY_MS) : null;
  return { waves, adjustedDeadline };
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
