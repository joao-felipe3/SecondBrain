// composables/api/useTasksApi.ts
import { useApi, useApiResource } from "./useApi";

export const useTasksApi = () => {
  const resource = useApiResource("/tasks");

  const concludeTask = async (taskId: string) => {
    const { patch } = useApi(`/tasks/${taskId}/conclude`);
    return patch({});
  };

  const incrementPomodoro = async (taskId: string) => {
    const { patch } = useApi(`/tasks/${taskId}/increment-pomodoro`);
    return patch({});
  };

  const updatePertEstimate = async (
    taskId: string,
    estimate: { optimistic: number; mostLikely: number; pessimistic: number },
  ) => {
    const { post } = useApi(`/tasks/${taskId}/pert-estimate`);
    return post(estimate);
  };

  const createBulkTasks = async (tasks: any[]) => {
    const { post } = useApi("/tasks/bulk");
    return post({ tasks });
  };

  const fetchAiSuggestions = async (context?: string) => {
    const { post } = useApi("/tasks/ai-suggestions");
    return post({ context });
  };

  const createMicroTask = async (payload: any) => {
    const { post } = useApi("/tasks/micro");
    return post(payload);
  };

  const moveTaskStatus = async (
    taskId: string,
    payload: { targetStatus: string; newOrder?: number },
  ) => {
    const { patch } = useApi(`/tasks/${taskId}/move`);
    return patch(payload);
  };

  const fetchHabitsDashboard = async (projectId?: string) => {
    const endpoint = projectId
      ? `/habits/dashboard?projectId=${encodeURIComponent(projectId)}`
      : "/habits/dashboard";
    const { get } = useApi(endpoint);
    return get();
  };

  return {
    ...resource,
    concludeTask,
    incrementPomodoro,
    updatePertEstimate,
    createBulkTasks,
    fetchAiSuggestions,
    createMicroTask,
    moveTaskStatus,
    fetchHabitsDashboard,
  };
};
