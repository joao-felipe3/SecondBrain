// composables/api/useWbsApi.ts
import { useApi } from "./useApi";

export const useWbsApi = () => {
  const generateWbs = async (projectId: string, prompt?: string) => {
    const { post } = useApi(`/projects/${projectId}/generate-wbs`);
    return post({ prompt });
  };

  const saveWbs = async (projectId: string, nodes: any[]) => {
    const { post } = useApi(`/projects/${projectId}/save-wbs`);
    return post({ nodes });
  };

  const getWbs = async (projectId: string) => {
    const { get } = useApi(`/projects/${projectId}/wbs`);
    return get();
  };

  const validateWbs = async (projectId: string) => {
    const { post } = useApi(`/projects/${projectId}/wbs/validate`);
    return post({});
  };

  const resolveBudget = async (projectId: string, totalBudget?: number) => {
    const { post } = useApi(`/projects/${projectId}/wbs/resolve-budget`);
    return post({ totalBudget });
  };

  const suggestDecomposition = async (projectId: string, nodeId: string) => {
    const { post } = useApi(`/projects/${projectId}/wbs/suggest-decomposition`);
    return post({ nodeId });
  };

  const convertWbsToTasks = async (projectId: string, options?: any) => {
    const { post } = useApi(`/projects/${projectId}/wbs/convert-to-tasks`);
    return post(options || {});
  };

  const fetchLeafNodes = async (projectId: string) => {
    const { post } = useApi(`/projects/${projectId}/wbs/leaf-nodes`);
    return post({});
  };

  const generateTasksForLeaf = async (
    projectId: string,
    leafNodeId: string,
  ) => {
    const { post } = useApi(
      `/projects/${projectId}/wbs/generate-tasks-for-leaf`,
    );
    return post({ leafNodeId });
  };

  return {
    generateWbs,
    saveWbs,
    getWbs,
    validateWbs,
    resolveBudget,
    suggestDecomposition,
    convertWbsToTasks,
    fetchLeafNodes,
    generateTasksForLeaf,
  };
};
