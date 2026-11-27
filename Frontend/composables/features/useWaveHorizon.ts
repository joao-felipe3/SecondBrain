// Regras de horizonte do Rolling Wave no Frontend (mesmas do backend em WaveDetailingService).

export interface HorizonSlice {
  status: 'planned' | 'detailed';
  hours: number;
}

export interface HorizonWave {
  _id: string;
  status: 'planned' | 'active' | 'completed';
  taskIds: string[];
  slices?: HorizonSlice[];
}

export interface HorizonTask {
  _id: string;
  isConcluded?: boolean;
  pertExpectedMinutes?: number;
  pomodorosPlanned?: number;
}

/** A partir de quanto da onda atual concluída sugerimos detalhar a próxima. */
export const DETAIL_NEXT_WAVE_THRESHOLD = 0.7;

export function estimateTaskHours(task: HorizonTask): number {
  if (typeof task.pertExpectedMinutes === 'number' && task.pertExpectedMinutes > 0) {
    return task.pertExpectedMinutes / 60;
  }
  if (typeof task.pomodorosPlanned === 'number' && task.pomodorosPlanned > 0) {
    return task.pomodorosPlanned * 0.5;
  }
  return 1;
}

/** Onda atual (ativa, ou a primeira não concluída) e a seguinte. */
export function horizonWaveIds(waves: HorizonWave[]): string[] {
  let current = waves.findIndex((w) => w.status === 'active');
  if (current < 0) current = waves.findIndex((w) => w.status !== 'completed');
  if (current < 0) return [];
  return waves.slice(current, current + 2).map((w) => w._id);
}

export function pendingSlicesCount(wave: HorizonWave): number {
  return (wave.slices || []).filter((s) => s.status === 'planned').length;
}

export function canDetailWave(wave: HorizonWave | null | undefined, waves: HorizonWave[]): boolean {
  return !!wave && horizonWaveIds(waves).includes(wave._id) && pendingSlicesCount(wave) > 0;
}

/** Fração concluída da onda (horas das tarefas concluídas / horas das tarefas da onda). */
export function waveProgress(wave: HorizonWave | undefined, tasks: HorizonTask[]): number {
  if (!wave) return 0;
  const ids = new Set((wave.taskIds || []).map(String));
  const waveTasks = tasks.filter((t) => ids.has(String(t._id)));
  const total = waveTasks.reduce((sum, t) => sum + estimateTaskHours(t), 0);
  if (total <= 0) return 0;
  const done = waveTasks.filter((t) => t.isConcluded).reduce((sum, t) => sum + estimateTaskHours(t), 0);
  return done / total;
}

/** Próxima onda a detalhar, quando a atual já passou do limiar e a próxima tem fatias pendentes. */
export function nextWaveToDetail<W extends HorizonWave>(waves: W[], tasks: HorizonTask[]): W | null {
  const [currentId, nextId] = horizonWaveIds(waves);
  const current = waves.find((w) => w._id === currentId);
  if (waveProgress(current, tasks) < DETAIL_NEXT_WAVE_THRESHOLD) return null;
  const next = waves.find((w) => w._id === nextId);
  return next && pendingSlicesCount(next) > 0 ? next : null;
}

/** Re-baselines feitos na revisão → payload do commit (só os que vieram de fatias). */
export function buildSliceHoursPayload(
  updates: Array<{ sliceId?: string; newEstimatedHours: number }>,
): Array<{ sliceId: string; hours: number }> {
  const bySlice = new Map<string, number>();
  for (const u of updates) {
    if (u.sliceId && Number.isFinite(u.newEstimatedHours)) bySlice.set(u.sliceId, u.newEstimatedHours);
  }
  return Array.from(bySlice, ([sliceId, hours]) => ({ sliceId, hours }));
}
