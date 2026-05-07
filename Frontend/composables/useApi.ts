export const useApiFetch = () => {
  const config = useRuntimeConfig()
  const apiBase = config.public.apiBase || 'http://localhost:3000'

  return {
    apiBase,
    /**
     * Wrapper para $fetch que adiciona o apiBase automaticamente
     */
    async fetch<T = unknown>(endpoint: string, options: any = {}) {
      const url = `${apiBase}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`
      return $fetch<T>(url, options)
    },
  }
}

// Backwards-compatible named export used by other composables/tests that
// import `useApi` from the top-level composables path. This provides
// simple `get`, `post`, `patch`, `remove` helpers that accept a full path
// (e.g. `/settings/123`) and delegate to `$fetch` via `useApiFetch`.
export const useApi = () => {
  const { fetch: apiFetch } = useApiFetch()

  const get = async (endpoint: string) => {
    return apiFetch(endpoint, { method: 'GET' })
  }

  const post = async (endpoint: string, body?: any) => {
    return apiFetch(endpoint, { method: 'POST', body })
  }

  const patch = async (endpoint: string, body?: any) => {
    return apiFetch(endpoint, { method: 'PATCH', body })
  }

  const remove = async (endpoint: string) => {
    return apiFetch(endpoint, { method: 'DELETE' })
  }

  return { get, post, patch, remove }
}
