export const useApiFetch = () => {
  const config = useRuntimeConfig();
  const apiBase = config.public.apiBase || "http://localhost:3000";

  const apiFetch = async <T = unknown>(endpoint: string, options: any = {}) => {
    const url = `${apiBase}${endpoint.startsWith("/") ? endpoint : "/" + endpoint}`;
    return $fetch<T>(url, options);
  };

  const get = async <T = unknown>(endpoint: string) =>
    apiFetch<T>(endpoint, { method: "GET" });
  const post = async <T = unknown>(endpoint: string, body?: any) =>
    apiFetch<T>(endpoint, { method: "POST", body });
  const patch = async <T = unknown>(endpoint: string, body?: any) =>
    apiFetch<T>(endpoint, { method: "PATCH", body });
  const remove = async <T = unknown>(endpoint: string) =>
    apiFetch<T>(endpoint, { method: "DELETE" });

  return {
    apiBase,
    fetch: apiFetch,
    get,
    post,
    patch,
    remove,
  };
};
