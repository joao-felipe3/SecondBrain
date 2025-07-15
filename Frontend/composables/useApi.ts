// composables/useApi.ts
export const useApi = (endpoint: string) => {
  const api = useNuxtApp().$api; // usa a instância do plugin
  const url = `${endpoint}`; // endpoint já será adicionado à baseURL

  const get = async () => {
    try {
      const { data } = await api.get(url);
      return { data, error: null };
    } catch (error: any) {
      return { data: null, error };
    }
  };

  const post = async (body: any) => {
    try {
      const { data } = await api.post(url, body);
      return { data, error: null };
    } catch (error: any) {
      return { data: null, error };
    }
  };

  const patch = async (body: any = {}) => {
    try {
      const { data } = await api.patch(url, body);
      return { data, error: null };
    } catch (error: any) {
      return { data: null, error };
    }
  };

  const remove = async () => {
    try {
      const { data } = await api.delete(url);
      return { data, error: null };
    } catch (error: any) {
      return { data: null, error };
    }
  };

  return { get, post, patch, remove };
};
