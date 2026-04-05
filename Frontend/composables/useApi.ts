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
