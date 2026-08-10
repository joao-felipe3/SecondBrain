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

  return {
    ...resource,
    concludeTask,
    incrementPomodoro,
    updatePertEstimate,
    createBulkTasks,
    fetchAiSuggestions,
  };
};
