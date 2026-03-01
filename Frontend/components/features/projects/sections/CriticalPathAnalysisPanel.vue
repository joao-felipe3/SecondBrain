<template>
  <v-sheet class="mb-6" elevation="0" color="transparent" @click.stop>
    <div v-if="!projectDuration || projectDuration === 0" class="empty-state">
      <v-icon size="64" color="grey-lighten-1">mdi-chart-timeline</v-icon>
      <h3 class="mt-2 mb-2 text-medium-emphasis">Caminho Crítico — Análise CPM</h3>
      <p class="text-body-2 text-medium-emphasis">
        Adicione dependências (manual ou via "Auto-inferir (IA)") e o sistema calculará automaticamente o caminho crítico,
        mostrando quais tarefas têm menor margem (folga).
      </p>
    </div>

    <div v-else class="cpm-content-wrapper">
      <!-- Header -->
      <div class="d-flex align-center mb-4">
        <h3 class="page-title">📈 Caminho Crítico — Análise CPM</h3>
      </div>

      <!-- Quick insights (derived from graph + slack + total work) -->
      <v-expansion-panels class="mb-4">
        <v-expansion-panel title="🔎 Insights rápidos">
          <template #text>
            <div v-if="slackSummary" class="text-caption text-medium-emphasis mb-3">
              {{ slackSummary }}
            </div>

            <v-expansion-panels density="compact" class="nested-panels">
              <!-- Tarefas que mais destravam -->
              <v-expansion-panel title="🔓 Tarefas que mais destravam">
                <template #text>
                  <div v-if="topUnlockersList.length" class="d-flex flex-column" style="gap: 4px;">
                    <div v-for="t in topUnlockersList" :key="t.taskId" class="d-flex align-center justify-space-between">
                      <v-tooltip :text="t.taskName" location="top">
                        <template #activator="{ props }">
                          <span v-bind="props" class="text-caption" style="max-width: 78%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{{ t.taskName }}</span>
                        </template>
                      </v-tooltip>
                      <span class="text-caption font-mono" style="min-width: 70px; text-align: right;">{{ t.outDegree }} deps</span>
                    </div>
                  </div>
                  <div v-else class="text-caption text-medium-emphasis">Ainda não há dependências suficientes para medir desbloqueio.</div>
                </template>
              </v-expansion-panel>

              <!-- Mais "bloqueadas" -->
              <v-expansion-panel title="🧩 Mais 'bloqueadas' (muitas deps)">
                <template #text>
                  <div v-if="topBottlenecksList.length" class="d-flex flex-column" style="gap: 4px;">
                    <div v-for="t in topBottlenecksList" :key="t.taskId" class="d-flex align-center justify-space-between">
                      <v-tooltip :text="t.taskName" location="top">
                        <template #activator="{ props }">
                          <span v-bind="props" class="text-caption" style="max-width: 78%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{{ t.taskName }}</span>
                        </template>
                      </v-tooltip>
                      <span class="text-caption font-mono" style="min-width: 70px; text-align: right;">{{ t.inDegree }} deps</span>
                    </div>
                  </div>
                  <div v-else class="text-caption text-medium-emphasis">Poucas dependências; gargalos ainda não aparecem.</div>
                </template>
              </v-expansion-panel>

              <!-- Esforço → prazo -->
              <v-expansion-panel title="🗓️ Esforço → prazo (cenários)">
                <template #text>
                  <div v-if="capacityScenarios.length" class="d-flex flex-column" style="gap: 4px;">
                    <div v-for="(s, idx) in capacityScenarios" :key="idx" class="text-caption">{{ s }}</div>
                  </div>
                  <div v-else class="text-caption text-medium-emphasis">Sem esforço total para estimar prazo.</div>
                </template>
              </v-expansion-panel>
            </v-expansion-panels>

            <div v-if="graphHint" class="text-caption text-medium-emphasis mt-3">
              {{ graphHint }}
            </div>
          </template>
        </v-expansion-panel>
      </v-expansion-panels>

      <!-- Personal projects (1 pessoa): Focus & capacity interpretation -->
      <v-expansion-panels>
        <v-expansion-panel title="🎯 Foco agora (1 pessoa)">
          <template #text>
            <div class="text-caption text-medium-emphasis mb-3" v-if="capacitySummary">
              {{ capacitySummary }}
            </div>
            <div class="text-caption text-medium-emphasis mb-3" v-else>
              Dica: em projetos pessoais, CPM é mais útil como "foco por risco" (menor folga) e "ordem de desbloqueio" do que como prazo real — prazo real depende da sua capacidade.
            </div>

            <v-expansion-panels density="compact" class="nested-panels">
              <!-- Top 15 por menor folga -->
              <v-expansion-panel title="⏳ Top 15 por menor folga">
                <template #text>
                  <div v-if="lowestSlackTasks.length" class="d-flex flex-column" style="gap: 4px;">
                    <div v-for="t in lowestSlackTasks" :key="t.taskId" class="d-flex align-center justify-space-between">
                      <v-tooltip :text="t.taskName" location="top">
                        <template #activator="{ props }">
                          <span v-bind="props" class="text-caption" style="max-width: 78%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{{ t.taskName }}</span>
                        </template>
                      </v-tooltip>
                      <span class="text-caption font-mono" style="min-width: 70px; text-align: right;">{{ t.slack.toFixed(1) }}h</span>
                    </div>
                  </div>
                  <div v-else class="text-caption text-medium-emphasis">Sem dados suficientes.</div>
                </template>
              </v-expansion-panel>

              <!-- Iniciáveis agora -->
              <v-expansion-panel title="🚀 Iniciáveis agora (ES ≈ 0)">
                <template #text>
                  <div v-if="startableTasks.length" class="d-flex flex-column" style="gap: 4px;">
                    <div v-for="t in startableTasks" :key="t.taskId" class="d-flex align-center justify-space-between">
                      <v-tooltip :text="t.taskName" location="top">
                        <template #activator="{ props }">
                          <span v-bind="props" class="text-caption" style="max-width: 78%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{{ t.taskName }}</span>
                        </template>
                      </v-tooltip>
                      <span class="text-caption font-mono" style="min-width: 70px; text-align: right;">{{ t.slack.toFixed(1) }}h</span>
                    </div>
                  </div>
                  <div v-else class="text-caption text-medium-emphasis">Nenhuma tarefa com ES≈0.</div>
                </template>
              </v-expansion-panel>

              <!-- Próximos 10 do fio guia -->
              <v-expansion-panel title="🧵 Próximos 10 do fio guia">
                <template #text>
                  <div v-if="criticalNextTasks.length" class="d-flex flex-column" style="gap: 4px;">
                    <div v-for="t in criticalNextTasks" :key="t.taskId" class="d-flex align-center justify-space-between">
                      <v-tooltip :text="t.taskName" location="top">
                        <template #activator="{ props }">
                          <span v-bind="props" class="text-caption" style="max-width: 78%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{{ t.taskName }}</span>
                        </template>
                      </v-tooltip>
                      <span class="text-caption font-mono" style="min-width: 70px; text-align: right;">{{ t.slack.toFixed(1) }}h</span>
                    </div>
                  </div>
                  <div v-else class="text-caption text-medium-emphasis">Sem fio guia.</div>
                </template>
              </v-expansion-panel>
            </v-expansion-panels>

            <div v-if="bufferSummary" class="text-caption text-medium-emphasis mt-3">
              {{ bufferSummary }}
            </div>
          </template>
        </v-expansion-panel>
      </v-expansion-panels>
    </div>
  </v-sheet>
</template>

<script setup lang="ts">
import { computed } from 'vue';

interface TaskMetrics {
  taskId: string;
  taskName: string;
  earlyStart: number;
  earlyFinish: number;
  lateStart: number;
  lateFinish: number;
  slack: number;
  isCritical: boolean;
}

interface Task {
  id: string;
  title: string;
}

interface CpmDiagnostics {
  taskCount: number;
  criticalCount: number;
  criticalPercent: number;
  criticalChainTaskCount?: number;
  criticalChainDuration?: number;
  nearCriticalCount?: number;
  totalWork?: number;
  impliedParallelism?: number;
  hasCycle: boolean;
  unprocessedForward: number;
  unprocessedBackward: number;
  edgeCount?: number;
  startNodeCount?: number;
  endNodeCount?: number;
  avgDependenciesPerTask?: number;
  slackBuckets?: {
    negative: number;
    critical: number;
    nearCritical: number;
    lowSlack: number;
    comfortable: number;
  };
  topUnlockers?: Array<{ taskId: string; taskName?: string; outDegree: number }>;
  topBottlenecks?: Array<{ taskId: string; taskName?: string; inDegree: number }>;
}

const props = defineProps<{
  projectDuration: number;
  criticalPath: string[];
  taskMetrics: TaskMetrics[];
  alerts: string[];
  diagnostics?: CpmDiagnostics | null;
  calculating: boolean;
  autoInferring?: boolean;
  cycleClearing?: boolean;
  availableTasks?: Task[];
  projectStartDate?: string;
  projectDeadline?: string;
  temporalObjective?: string;
}>();

const emit = defineEmits<{
  'calculate': [];
  'open-auto-infer': [];
  'clear-cycles': [];
}>();

const cycleAlert = computed(() => {
  const list = Array.isArray(props.alerts) ? props.alerts : [];
  return list.find((a) => String(a || '').toLowerCase().includes('ciclo')) || null;
});

const diagnosticsWarning = computed(() => {
  const d = props.diagnostics as any;
  if (!d) return null;
  const uf = Number(d.unprocessedForward ?? 0);
  const ub = Number(d.unprocessedBackward ?? 0);
  const hasCycle = Boolean(d.hasCycle);

  const edgeCount = Number(d.edgeCount ?? NaN);
  const startNodeCount = Number(d.startNodeCount ?? NaN);
  const endNodeCount = Number(d.endNodeCount ?? NaN);
  const avgDeps = Number(d.avgDependenciesPerTask ?? NaN);

  const graphBits: string[] = [];
  if (Number.isFinite(edgeCount)) graphBits.push(`edges=${edgeCount}`);
  if (Number.isFinite(startNodeCount)) graphBits.push(`starts=${startNodeCount}`);
  if (Number.isFinite(endNodeCount)) graphBits.push(`ends=${endNodeCount}`);
  if (Number.isFinite(avgDeps)) graphBits.push(`avgDeps=${avgDeps.toFixed(2)}`);

  if (!hasCycle && uf === 0 && ub === 0) return null;
  const base = `Não processadas: forward=${uf}, backward=${ub}.`;
  return graphBits.length ? `${base} Grafo: ${graphBits.join(', ')}.` : base;
});

const getTaskName = (taskId: string): string => {
  // Try to find in taskMetrics first
  const taskMetric = props.taskMetrics.find(t => t.taskId === taskId);
  if (taskMetric?.taskName) return taskMetric.taskName;
  
  // Fallback to availableTasks
  if (props.availableTasks) {
    const availableTask = props.availableTasks.find(t => t.id === taskId);
    if (availableTask?.title) return availableTask.title;
  }
  
  // Last resort: return taskId
  return taskId;
};

const diagnostics = computed(() => props.diagnostics || null);

const slackSummary = computed(() => {
  const b = (diagnostics.value as any)?.slackBuckets;
  if (!b) return null;
  const parts: string[] = [];
  const neg = Number(b.negative ?? 0);
  const critical = Number(b.critical ?? 0);
  const near = Number(b.nearCritical ?? 0);
  const low = Number(b.lowSlack ?? 0);
  const ok = Number(b.comfortable ?? 0);
  if (neg > 0) parts.push(`⚠️ folga negativa: ${neg}`);
  parts.push(`críticas: ${critical}`);
  parts.push(`quase-críticas (<2h): ${near}`);
  parts.push(`baixa folga (2–8h): ${low}`);
  parts.push(`confortáveis (≥8h): ${ok}`);
  return `Distribuição de folga — ${parts.join(' • ')}.`;
});

const topUnlockersList = computed(() => {
  const list = (diagnostics.value as any)?.topUnlockers;
  if (!Array.isArray(list)) return [];
  return list.map((t: any) => ({
    taskId: String(t.taskId ?? ''),
    taskName: getTaskName(String(t.taskId ?? '')) || String(t.taskName ?? ''),
    outDegree: Number(t.outDegree ?? 0),
  })).filter((t: any) => t.taskId && t.outDegree > 0).slice(0, 8);
});

const topBottlenecksList = computed(() => {
  const list = (diagnostics.value as any)?.topBottlenecks;
  if (!Array.isArray(list)) return [];
  return list.map((t: any) => ({
    taskId: String(t.taskId ?? ''),
    taskName: getTaskName(String(t.taskId ?? '')) || String(t.taskName ?? ''),
    inDegree: Number(t.inDegree ?? 0),
  })).filter((t: any) => t.taskId && t.inDegree > 0).slice(0, 8);
});

const capacityScenarios = computed(() => {
  const d: any = diagnostics.value as any;
  const totalWork = Number(d?.totalWork ?? NaN);
  if (!Number.isFinite(totalWork) || totalWork <= 0) return [];

  const weeksPerMonth = 4.345;
  const hoursPerWeekOptions = [10, 20, 40];
  return hoursPerWeekOptions.map((hpw) => {
    const weeks = totalWork / hpw;
    const months = weeks / weeksPerMonth;
    const weeksLabel = weeks >= 100 ? weeks.toFixed(0) : weeks.toFixed(1);
    const monthsLabel = months >= 24 ? months.toFixed(0) : months.toFixed(1);
    return `${hpw}h/semana → ~${weeksLabel} semanas (~${monthsLabel} meses)`;
  });
});

const graphHint = computed(() => {
  const d: any = diagnostics.value as any;
  if (!d) return null;
  const taskCount = Number(d.taskCount ?? NaN);
  const starts = Number(d.startNodeCount ?? NaN);
  const ends = Number(d.endNodeCount ?? NaN);
  const avgDeps = Number(d.avgDependenciesPerTask ?? NaN);

  const bits: string[] = [];
  if (Number.isFinite(avgDeps)) bits.push(`avg deps/tarefa=${avgDeps.toFixed(2)}`);
  if (Number.isFinite(starts) && Number.isFinite(taskCount) && taskCount > 0) bits.push(`inícios=${starts}`);
  if (Number.isFinite(ends) && Number.isFinite(taskCount) && taskCount > 0) bits.push(`finais=${ends}`);
  if (bits.length === 0) return null;

  // Heuristic: many start nodes suggests many "ilhas" (parallel chains) → makespan looks unrealistically small.
  const islands = Number.isFinite(starts) && Number.isFinite(taskCount) && taskCount > 0 ? starts / taskCount : NaN;
  const islandHint = Number.isFinite(islands) && islands > 0.25
    ? ' Muitos inícios sugere "ilhas" (cadeias independentes), então o makespan tende a ficar curto demais.'
    : '';

  return `Grafo: ${bits.join(' • ')}.${islandHint}`;
});

const lowestSlackTasks = computed(() => {
  const list = Array.isArray(props.taskMetrics) ? props.taskMetrics.slice() : [];
  list.sort((a, b) => (a.slack ?? 0) - (b.slack ?? 0));
  return list.slice(0, 15);
});

const startableTasks = computed(() => {
  const list = Array.isArray(props.taskMetrics) ? props.taskMetrics.slice() : [];
  const startable = list.filter((t) => Number(t.earlyStart ?? 0) < 0.1);
  startable.sort((a, b) => (a.slack ?? 0) - (b.slack ?? 0));
  return startable.slice(0, 10);
});

const criticalNextTasks = computed(() => {
  const ids = Array.isArray(props.criticalPath) ? props.criticalPath.slice(0, 10) : [];
  const byId = new Map((props.taskMetrics || []).map((t) => [t.taskId, t] as const));
  return ids.map((taskId) => {
    const metric = byId.get(taskId);
    return {
      taskId,
      taskName: getTaskName(taskId),
      slack: metric?.slack ?? 0,
    };
  });
});

function safeParseDate(input?: string | null): Date | null {
  if (!input) return null;
  const s = String(input).trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function extractMonthYearDate(params: { text: string; kind: 'start' | 'end' }): Date | null {
  const raw = (params.text || '').toLowerCase();
  if (!raw.trim()) return null;

  const months: Record<string, number> = {
    janeiro: 0,
    jan: 0,
    fevereiro: 1,
    fev: 1,
    março: 2,
    marco: 2,
    mar: 2,
    abril: 3,
    abr: 3,
    maio: 4,
    jun: 5,
    junho: 5,
    jul: 6,
    julho: 6,
    agosto: 7,
    ago: 7,
    setembro: 8,
    set: 8,
    october: 9,
    outubro: 9,
    out: 9,
    november: 10,
    novembro: 10,
    nov: 10,
    december: 11,
    dezembro: 11,
    dez: 11,
  };

  const monthNames = Object.keys(months)
    .sort((a, b) => b.length - a.length)
    .join('|');
  const monthYearRe = new RegExp(`\\b(${monthNames})\\s*(?:de\\s*)?(20\\d{2})\\b`, 'i');

  const pickFrom = (sub: string): { month: number; year: number } | null => {
    const m = sub.match(monthYearRe);
    if (!m) return null;
    const month = months[m[1].toLowerCase()];
    const year = Number(m[2]);
    if (!Number.isFinite(month) || !Number.isFinite(year)) return null;
    return { month, year };
  };

  const hints = params.kind === 'end'
    ? ['até', 'ate', 'until', 'by', 'deadline', 'prazo']
    : ['início', 'inicio', 'start', 'começo', 'comeco'];

  for (const h of hints) {
    const idx = raw.indexOf(h);
    if (idx >= 0) {
      const picked = pickFrom(raw.slice(idx));
      if (picked) {
        if (params.kind === 'end') return new Date(picked.year, picked.month + 1, 0);
        return new Date(picked.year, picked.month, 1);
      }
    }
  }

  const picked = pickFrom(raw);
  if (!picked) return null;
  if (params.kind === 'end') return new Date(picked.year, picked.month + 1, 0);
  return new Date(picked.year, picked.month, 1);
}

const inferredWindow = computed(() => {
  const start = safeParseDate(props.projectStartDate) || extractMonthYearDate({ text: props.temporalObjective || '', kind: 'start' });
  const end = safeParseDate(props.projectDeadline) || extractMonthYearDate({ text: props.temporalObjective || '', kind: 'end' });
  if (!start || !end) return null;
  const startMs = start.getTime();
  const endMs = end.getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null;
  const days = Math.ceil((endMs - startMs) / (1000 * 60 * 60 * 24));
  return { start, end, days };
});

const capacitySummary = computed(() => {
  const d: any = diagnostics.value as any;
  const totalWork = Number(d?.totalWork ?? NaN);
  if (!Number.isFinite(totalWork) || totalWork <= 0) return null;

  const win = inferredWindow.value;
  if (!win) return null;

  const hoursPerDayNeeded = totalWork / win.days;
  const hoursPerWeekNeeded = hoursPerDayNeeded * 7;
  const endIsPast = win.end.getTime() < Date.now();

  const endLabel = win.end.toLocaleDateString('pt-BR');
  const startLabel = win.start.toLocaleDateString('pt-BR');
  const tail = endIsPast ? ' (prazo no passado)' : '';

  return `Para concluir ~${totalWork.toFixed(0)}h entre ${startLabel} e ${endLabel}${tail}, você precisaria de ~${hoursPerDayNeeded.toFixed(2)}h/dia (~${hoursPerWeekNeeded.toFixed(1)}h/semana) em média.`;
});

const bufferSummary = computed(() => {
  const d: any = diagnostics.value as any;
  const chain = Number(d?.criticalChainDuration ?? NaN);
  if (!Number.isFinite(chain) || chain <= 0) return null;
  const buffer = chain * 0.5;
  const total = chain + buffer;
  return `🧱 Buffer (CCPM light, 50% do fio guia): +${buffer.toFixed(1)}h ⇒ ${total.toFixed(1)}h (risco/variância; não substitui capacidade).`;
});
</script>

<style scoped>
.analysis-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.page-title {
  font-size: 1rem;
  font-weight: 600;
  margin: 0;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  padding: 0 2rem;
  text-align: center;
}

.empty-state h3 {
  margin: 0.5rem 0;
}

.summary-card {
  background: #f5f5f5;
  border-radius: 6px;
  padding: 0.5rem 0.25rem;
  text-align: center;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 calc((100% - 1rem) / 3);
  box-sizing: border-box;
  font-size: 0.7rem;
}

.summary-cards {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  justify-content: space-between;
  flex-wrap: nowrap;
  overflow-x: auto;
}

.cpm-content-wrapper {
  display: flex;
  flex-direction: column;
  height: 100%;
  max-width: 290px;
}

.nested-panels {
  width: 100%;
}
</style>
