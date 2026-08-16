import { computed, ref, type Ref } from "vue";
import { useVisualizationApi } from "~/composables/api";

export interface GanttTaskItem {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  durationHours: number;
  earlyStart: number;
  earlyFinish: number;
  lateStart: number;
  lateFinish: number;
  slack: number;
  isCritical: boolean;
  progress: number;
  isConcluded: boolean;
  priority: number;
  parentWbsNodeId?: string;
  wbsPath?: string;
}

export interface GanttDependencyItem {
  id: string;
  fromTaskId: string;
  toTaskId: string;
  relationship: "finish-to-start" | "start-to-start" | "finish-to-finish";
  reason?: string;
  isAutoIdentified: boolean;
}

export interface GanttDataResponse {
  projectId: string;
  projectName: string;
  projectStartDate: string;
  projectDeadline: string | null;
  projectDurationHours: number;
  tasks: GanttTaskItem[];
  dependencies: GanttDependencyItem[];
  criticalPath: string[];
  alerts: string[];
  diagnostics?: Record<string, any>;
  packageCriticality?: Array<{
    packageId: string;
    packagePath?: string;
    taskCount: number;
    criticalTaskCount: number;
    criticalRatio: number;
    minSlack: number;
    criticalDuration: number;
    criticalPathTaskCount: number;
    score: number;
  }>;
}

export interface UseGanttDataOptions {
  includeCompleted?: boolean;
}

export function useGanttData(
  projectIdRef?: Ref<string> | string,
  options?: UseGanttDataOptions,
) {
  const route = useRoute();
  const loading = ref(false);
  const error = ref<string | null>(null);
  const data = ref<GanttDataResponse | null>(null);
  const includeCompleted = ref(options?.includeCompleted ?? true);
  const { fetchGanttData } = useVisualizationApi();

  const getProjectId = () => {
    if (typeof projectIdRef === "string") return projectIdRef;
    if (projectIdRef?.value) return projectIdRef.value;
    return route.params.id as string;
  };

  const ganttTasks = computed(() => data.value?.tasks || []);
  const dependencies = computed(() => data.value?.dependencies || []);
  const criticalPath = computed(() => data.value?.criticalPath || []);
  const alerts = computed(() => data.value?.alerts || []);

  const load = async () => {
    const projectId = String(getProjectId() || "");
    if (!projectId) return;

    loading.value = true;
    error.value = null;

    try {
      const result = await fetchGanttData(projectId, includeCompleted.value);

      if (result.error) {
        throw result.error;
      }

      data.value = result.data as GanttDataResponse;
    } catch (err: any) {
      error.value = err?.message || "Falha ao carregar dados de Gantt.";
    } finally {
      loading.value = false;
    }
  };

  return {
    data,
    loading,
    error,
    includeCompleted,
    ganttTasks,
    dependencies,
    criticalPath,
    alerts,
    load,
  };
}
