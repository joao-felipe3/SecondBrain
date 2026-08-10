// composables/api/useProjectsApi.ts
import { useApi, useApiResource } from "./useApi";

export const useProjectsApi = () => {
  const resource = useApiResource("/projects");

  const fetchProjectTasks = async (projectId: string) => {
    const { get } = useApi(`/projects/${projectId}/tasks`);
    return get();
  };

  const fetchMicroTasks = async (projectId: string) => {
    const { get } = useApi(`/projects/${projectId}/micro-tasks`);
    return get();
  };

  const incrementHours = async (projectId: string, hours: number) => {
    const { patch } = useApi(`/projects/${projectId}/increment-hours`);
    return patch({ hours });
  };

  const recalculateProjectStats = async (projectId: string) => {
    const { post } = useApi(`/projects/${projectId}/recalculate-stats`);
    return post({});
  };

  const planWithAi = async (projectId: string, prompt?: string) => {
    const { post } = useApi(`/projects/${projectId}/plan-with-ai`);
    return post({ prompt });
  };

  const suggestAnswer = async (projectId: string, question: string) => {
    const { post } = useApi(`/projects/${projectId}/suggest-answer`);
    return post({ question });
  };

  const refineObjective = async (projectId: string, prompt: string) => {
    const { post } = useApi(`/projects/${projectId}/refine-objective`);
    return post({ prompt });
  };

  return {
    ...resource,
    fetchProjectTasks,
    fetchMicroTasks,
    incrementHours,
    recalculateProjectStats,
    planWithAi,
    suggestAnswer,
    refineObjective,
  };
};
