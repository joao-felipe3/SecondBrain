<template>
  <v-sheet class="page-container" elevation="0" color="transparent" @click.stop>
    <!-- LEFT PAGE: Automação e Controles -->
    <v-sheet class="page left-page" elevation="0" color="transparent" @click.stop>
      <h3 class="page-title mb-4">🔗 Dependências & Automação</h3>

      <!-- Auto-infer Controls -->
      <v-card class="mb-4" elevation="1">
        <v-card-title class="text-subtitle-1">Auto-inferir Dependências (IA)</v-card-title>
        <v-card-text class="py-0">
          <v-alert
            v-if="autoInferError"
            type="error"
            variant="tonal"
            closable
            @click:close="autoInferError = null"
          >
            {{ autoInferError }}
          </v-alert>

          <div class="d-flex flex-column" >
            <v-select
              v-model="autoInferStrategy"
              :items="autoInferStrategyItems"
              item-title="title"
              item-value="value"
              label="Estratégia"
              density="compact"
              :disabled="autoInferLoading"
            />

            <v-text-field
              v-model.number="autoInferMaxEdgesPerLeaf"
              type="number"
              label="Max deps por leaf"
              density="compact"
              :disabled="autoInferLoading"
              hint="Ex.: 40-80"
              persistent-hint
            />
          </div>

          <div class="text-caption text-medium-emphasis mt-1">
            Preview mostra quantas dependências seriam sugeridas. Aplicar grava no banco como auto-identificadas.
          </div>

          <div v-if="autoInferPreview" class="mt-3">
            <v-divider class="mb-3" />
            <div class="text-caption font-weight-bold mb-2">Resumo do Preview:</div>
            <div class="d-flex flex-wrap" style="gap: 8px;">
              <v-chip size="small" color="primary" variant="tonal">
                Leafs: {{ autoInferPreview.leafGroups }}
              </v-chip>
              <v-chip size="small" color="primary" variant="tonal">
                Deps: {{ autoInferPreview.dependenciesSuggested }}
              </v-chip>
              <v-chip
                v-if="autoInferPreview.applySummary"
                size="small"
                color="success"
                variant="tonal"
              >
                Aceitas: {{ autoInferPreview.applySummary.accepted }}
              </v-chip>
              <v-chip
                v-if="autoInferPreview.applySummary"
                size="small"
                color="info"
                variant="tonal"
              >
                Inter-leaf: {{ autoInferPreview.applySummary.interLeafEdges ?? 0 }}
              </v-chip>
              <v-chip
                v-if="autoInferPreview.applySummary"
                size="small"
                color="warning"
                variant="tonal"
              >
                Rejeitadas: {{ autoInferPreview.applySummary.rejectedCycle }}
              </v-chip>
            </div>

            <div class="text-caption text-medium-emphasis mt-2 mb-1">
              Amostra (até 3 leafs):
            </div>
            <div style="max-height: 180px; overflow: auto; border: 1px solid #e0e0e0; border-radius: 6px; padding: 8px;">
              <div v-for="leaf in autoInferPreviewSample" :key="leaf.leafId" class="mb-2">
                <div class="text-caption font-weight-bold">{{ leaf.leafId }} — {{ leaf.tasks }} tasks, {{ leaf.dependencies.length }} deps</div>
                <div v-for="(d, idx) in leaf.dependencies.slice(0, 3)" :key="idx" class="text-caption text-medium-emphasis">
                  • {{ d.taskId.slice(0, 8) }}... ⟵ {{ d.dependsOnTaskId.slice(0, 8) }}...
                </div>
              </div>
              <div v-if="autoInferPreviewSample.length === 0" class="text-caption text-medium-emphasis">
                Sem preview. Clique em "Preview" abaixo.
              </div>
            </div>
          </div>
        </v-card-text>

        <v-card-actions class="justify-end">
          <v-btn
            color="primary"
            variant="tonal"
            :loading="autoInferLoading"
            prepend-icon="mdi-eye"
            size="small"
            @click="runAutoInfer(false)"
          >
            Preview
          </v-btn>
          <v-btn
            color="primary"
            :loading="autoInferLoading"
            prepend-icon="mdi-check"
            size="small"
            @click="runAutoInfer(true)"
          >
            Aplicar
          </v-btn>
        </v-card-actions>
      </v-card>

      <!-- Quick Actions -->
      <v-card elevation="1" class="mb-6">
        <v-card-title class="text-subtitle-1">Ações Rápidas</v-card-title>
        <v-card-text>
          <div class="d-flex flex-column" style="gap: 8px;">
            <v-btn
              color="primary"
              variant="outlined"
              prepend-icon="mdi-refresh"
              :loading="calculating"
              @click="calculateCriticalPath"
              block
            >
              Recalcular CPM
            </v-btn>

            <v-btn
              color="warning"
              variant="outlined"
              prepend-icon="mdi-broom"
              :loading="cycleClearing"
              :disabled="!hasCycleDetected"
              @click="clearCycles"
              block
            >
              Limpar Ciclos
            </v-btn>
          </div>

          <div v-if="hasCycleDetected" class="text-caption text-warning mt-2">
            ⚠️ Ciclo detectado nas dependências
          </div>
        </v-card-text>
      </v-card>
    </v-sheet>

    <!-- RIGHT PAGE: Análise CPM -->
    <v-sheet class="page right-page" elevation="0" color="transparent" @click.stop>
      <CriticalPathAnalysisPanel
        :project-duration="projectDuration"
        :critical-path="criticalPath"
        :task-metrics="taskMetrics"
        :alerts="alerts"
        :diagnostics="diagnostics"
        :calculating="calculating"
        :auto-inferring="autoInferLoading"
        :cycle-clearing="cycleClearing"
        :available-tasks="availableTasks"
        :project-start-date="(props.project as any)?.startDate"
        :project-deadline="(props.project as any)?.deadline"
        :temporal-objective="(props.project as any)?.smartObjective?.temporal"
        @calculate="calculateCriticalPath"
        @open-auto-infer="() => {}"
        @clear-cycles="clearCycles"
      />
    </v-sheet>

    <!-- Error Alert -->
    <v-alert
      v-if="error"
      type="error"
      variant="tonal"
      closable
      @click:close="error = null"
      style="position: fixed; bottom: 20px; right: 20px; max-width: 400px; z-index: 1000"
    >
      {{ error }}
    </v-alert>
  </v-sheet>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useTaskStore } from '~/stores/task';
import { useApi } from '~/composables/api';
import CriticalPathAnalysisPanel from '../sections/CriticalPathAnalysisPanel.vue';
import type { Project } from '~/models/Project';

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

const props = defineProps<{
  project: Project | Record<string, any> | null;
  editing?: boolean;
}>();

// State
const calculating = ref(false);
const error = ref<string | null>(null);
const taskMetrics = ref<TaskMetrics[]>([]);
const criticalPath = ref<string[]>([]);
const projectDuration = ref(0);
const alerts = ref<string[]>([]);
const diagnostics = ref<any | null>(null);

// Auto-infer state
const autoInferLoading = ref(false);
const autoInferError = ref<string | null>(null);
const autoInferStrategy = ref<'ai-per-leaf' | 'heuristic-phases'>('ai-per-leaf');
const autoInferMaxEdgesPerLeaf = ref(60);
const autoInferPreview = ref<any | null>(null);

// Cycle clear state
const cycleClearing = ref(false);

const autoInferStrategyItems = [
  { title: 'IA por leaf (mais granular)', value: 'ai-per-leaf' },
  { title: 'Heurística por fases (rápido e realista)', value: 'heuristic-phases' },
];

const hasCycleDetected = computed(() => {
  return Boolean((diagnostics.value as any)?.hasCycle);
});

const autoInferPreviewSample = computed(() => {
  const preview = autoInferPreview.value;
  const byLeaf = preview?.previewByLeaf;
  if (!byLeaf || typeof byLeaf !== 'object') return [];
  const entries = Object.entries(byLeaf).map(([leafId, v]: any) => ({
    leafId,
    tasks: Number(v?.tasks ?? 0),
    dependencies: Array.isArray(v?.dependencies) ? v.dependencies : [],
  }));
  // Skip the special "no-leaf" bucket in the sample unless it's the only one.
  const filtered = entries.filter((e) => e.leafId !== 'no-leaf');
  const list = filtered.length > 0 ? filtered : entries;
  return list.slice(0, 3);
});

// Stores
const tasksStore = useTaskStore();

// Get projectId from project
const projectId = computed(() => {
  const id = (props.project as any)?._id || (props.project as any)?.id || '';
  return id;
});

// Computed
const availableTasks = computed(() => {
  const filtered = tasksStore.tasks.filter((task: any) => {
    // Check all possible project field names
    const taskProjectId = task.project?.toString?.() || task.projectId?.toString?.() || task.projectID || '';
    const match = taskProjectId === projectId.value;
    return match;
  });
    
  return filtered.map((task: any) => ({
    id: task._id || task.id,
    title: task.name || task.title,
  }));
});

// Methods

// Enrich taskMetrics with task names from store or backend
async function enrichTaskMetricsWithNames(metrics: TaskMetrics[]): Promise<TaskMetrics[]> {  
  let taskMap: Record<string, string> = {};
  
  try {
    const { get } = useApi('/tasks');
    const { data: allTasks, error } = await get();
    
    if (!error && allTasks && Array.isArray(allTasks)) {
      (allTasks as any[]).forEach((task: any) => {
        const taskId = task._id || task.id;
        taskMap[taskId] = task.name || task.title;
      });
    }
  } catch (err) {
    console.warn('❌ Backend fetch failed:', err);
  }

  // Fallback to store if backend didn't work
  if (Object.keys(taskMap).length === 0 && availableTasks.value.length > 0) {
    availableTasks.value.forEach(t => {
      taskMap[t.id] = t.title;
    });
  }

  // Map metrics with names
  return metrics.map((metric: TaskMetrics) => {
    const anyMetric = metric as any;
    const name = taskMap[metric.taskId] || anyMetric?.name || anyMetric?.taskName || metric.taskId;
    return {
      ...metric,
      taskName: name,
    };
  });
}

const calculateCriticalPath = async () => {
  calculating.value = true;
  error.value = null;
  try {    
    const { get } = useApi(`/tasks/projects/${projectId.value}/critical-path`);
    const { data, error } = await get();
    
    if (error) throw error;
    const response = data as any;
    projectDuration.value = response?.analysis?.projectDuration || 0;
    criticalPath.value = response?.analysis?.criticalPath || [];
    diagnostics.value = response?.analysis?.diagnostics || null;
    
    // Enrich taskMetrics with names
    let metrics = response?.analysis?.tasksByImpact || [];    
    taskMetrics.value = await enrichTaskMetricsWithNames(metrics);
    
    alerts.value = response?.analysis?.alerts || [];
  } catch (err: any) {
    error.value = err.message || 'Erro ao calcular caminho crítico';
    projectDuration.value = 0;
    criticalPath.value = [];
    taskMetrics.value = [];
    alerts.value = [];
    diagnostics.value = null;
  } finally {
    calculating.value = false;
  }
};

const runAutoInfer = async (apply: boolean) => {
  if (!projectId.value?.trim()) {
    autoInferError.value = 'Projeto inválido';
    return;
  }
  autoInferLoading.value = true;
  autoInferError.value = null;
  try {
    const { post } = useApi(`/tasks/projects/${projectId.value}/dependencies/auto-infer`);
    const { data, error: apiError } = await post({
      strategy: autoInferStrategy.value,
      apply,
      maxEdgesPerLeaf: autoInferMaxEdgesPerLeaf.value,
    });
    if (apiError) throw apiError;
    autoInferPreview.value = data;
    if (apply) {
      await calculateCriticalPath();
    }
  } catch (err: any) {
    autoInferError.value = err?.response?.data?.message || err.message || 'Erro ao inferir dependências';
  } finally {
    autoInferLoading.value = false;
  }
};

const clearCycles = async () => {
  if (!projectId.value?.trim()) {
    error.value = 'Projeto inválido';
    return;
  }
  cycleClearing.value = true;
  error.value = null;
  try {
    const { post } = useApi(`/tasks/projects/${projectId.value}/dependencies/cycle/clear`);
    const { data, error: apiError } = await post({ mode: 'auto-only', maxRemovals: 25 });
    if (apiError) throw apiError;

    const resp = data as any;
    if (resp?.hasCycleAfter) {
      const reason = resp?.reason || 'Ainda existe ciclo nas dependências (não auto-identificadas).';
      if (String(reason).includes('mode="all"') && confirm(`${reason}\n\nDeseja FORÇAR a limpeza? (isso pode remover dependências manuais)`)) {
        const { data: forcedData, error: forcedErr } = await post({ mode: 'all', maxRemovals: 80 });
        if (forcedErr) throw forcedErr;
        const forcedResp = forcedData as any;
        if (forcedResp?.hasCycleAfter) {
          error.value = forcedResp?.reason || 'Ainda existe ciclo nas dependências mesmo após forçar a limpeza.';
        }
      } else {
        error.value = reason;
      }
    }

    await calculateCriticalPath();
  } catch (err: any) {
    error.value = err?.response?.data?.message || err.message || 'Erro ao limpar ciclos';
  } finally {
    cycleClearing.value = false;
  }
};

// Lifecycle
onMounted(async () => {
  // Load tasks from store
  await tasksStore.loadTasks();
  
  if (projectId.value?.trim()) {
    calculateCriticalPath();
  }
});

// Watch for project changes
watch(() => projectId.value, (newId) => {
  if (newId?.trim()) {
    calculateCriticalPath();
  }
});
</script>

<style scoped>
.page-container {
  display: flex;
  gap: 1rem;
  padding: 0.5rem;
  height: 100%;
  align-items: flex-start;
}

.page {
  flex: 1;
  min-width: 0;
  padding: 1rem;
  background: rgba(255, 255, 255, 0.9);
  border-radius: 8px;
  overflow-y: auto;
  overflow-x: hidden;
  box-sizing: border-box;
}

.left-page {
  border-right: 1px solid #e2e8f0
}

.right-page {
  border-left: 1px solid #e2e8f0;
}

.page-title {
  font-size: 1rem;
  font-weight: 600;
  margin: 0;
}
</style>
