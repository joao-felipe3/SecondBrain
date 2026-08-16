// composables/api/useVisualizationApi.ts
import { useApi } from "./useApi";

export const useVisualizationApi = () => {
  const fetchGanttData = async (
    projectId: string,
    includeCompleted: boolean = true,
  ) => {
    const query = includeCompleted ? "true" : "false";
    const { get } = useApi(
      `/projects/${projectId}/gantt-data?includeCompleted=${query}`,
    );
    return get();
  };

  const fetchPertDiagramData = async (
    projectId: string,
    includeCompleted: boolean = true,
  ) => {
    const query = includeCompleted ? "true" : "false";
    const { get } = useApi(
      `/projects/${projectId}/pert-diagram-data?includeCompleted=${query}`,
    );
    return get();
  };

  const createXMatrix = async (projectId: string, dto?: any) => {
    const { post } = useApi(`/projects/${projectId}/create-x-matrix`);
    return post(dto || {});
  };

  const fetchXMatrix = async (projectId: string) => {
    const { get } = useApi(`/projects/${projectId}/x-matrix`);
    return get();
  };

  return {
    fetchGanttData,
    fetchPertDiagramData,
    createXMatrix,
    fetchXMatrix,
  };
};
