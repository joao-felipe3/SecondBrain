import { computed, ref } from "vue";
import { useVisualizationApi } from "~/composables/api";

export interface PertDiagramNode {
  id: string;
  name: string;
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
  x: number;
  y: number;
}

export interface PertDiagramEdge {
  id: string;
  source: string;
  target: string;
  relationship: "finish-to-start" | "start-to-start" | "finish-to-finish";
  reason?: string;
  isAutoIdentified: boolean;
  isCriticalEdge: boolean;
}

export interface PertDiagramStatistics {
  totalTasks: number;
  criticalTasks: number;
  criticalPercent: number;
  totalEdges: number;
  maxParallelism: number;
}

export interface PertDiagramDataResponse {
  projectId: string;
  projectName: string;
  projectDurationHours: number;
  nodes: PertDiagramNode[];
  edges: PertDiagramEdge[];
  criticalPath: string[];
  alerts: string[];
  statistics: PertDiagramStatistics;
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

export function usePertDiagramData(getProjectId: () => string) {
  const data = ref<PertDiagramDataResponse | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const includeCompleted = ref(true);

  const nodes = computed(() => data.value?.nodes || []);
  const edges = computed(() => data.value?.edges || []);
  const criticalPath = computed(() => data.value?.criticalPath || []);
  const alerts = computed(() => data.value?.alerts || []);
  const statistics = computed(() => data.value?.statistics || null);

  const { fetchPertDiagramData } = useVisualizationApi();

  const load = async () => {
    const projectId = String(getProjectId() || "");
    if (!projectId) return;

    loading.value = true;
    error.value = null;

    try {
      const result = await fetchPertDiagramData(
        projectId,
        includeCompleted.value,
      );

      if (result.error) {
        throw result.error;
      }

      data.value = result.data as PertDiagramDataResponse;
    } catch (err: any) {
      error.value = err?.message || "Falha ao carregar dados do diagrama PERT.";
    } finally {
      loading.value = false;
    }
  };

  return {
    data,
    loading,
    error,
    includeCompleted,
    nodes,
    edges,
    criticalPath,
    alerts,
    statistics,
    load,
  };
}
