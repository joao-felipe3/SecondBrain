// composables/useApi.ts
import { useNuxtApp } from '#app';
import type { AxiosInstance } from 'axios';
/**
 * Composable para requisições HTTP usando o plugin $api (Axios).
 * @param endpoint Endpoint da API (ex: '/tasks')
 * @returns Métodos get, post, patch, remove para requisições assíncronas.
 * @example
 * const { get, post } = useApi('/tasks');
 * const { data, error } = await get();
 */

export const useApi = (endpoint: string) => {
  const api = useNuxtApp().$api as AxiosInstance; // tipagem explícita
  const url = `${endpoint}`; // endpoint já será adicionado à baseURL

  /**
   * Realiza uma requisição GET no endpoint informado.
   */
  const get = async () => {
    try {
      const { data } = await api.get(url);
      return { data, error: null };
    } catch (error: any) {
      return { data: null, error };
    }
  };

  /**
   * Realiza uma requisição POST no endpoint informado.
   * @param body Corpo da requisição
   */
  const post = async (body: any) => {
    try {
      const { data } = await api.post(url, body);
      return { data, error: null };
    } catch (error: any) {
      return { data: null, error };
    }
  };

  /**
   * Realiza uma requisição PATCH no endpoint informado.
   * @param body Corpo da requisição
   */
  const patch = async (body: any = {}) => {
    try {
      const { data } = await api.patch(url, body);
      return { data, error: null };
    } catch (error: any) {
      return { data: null, error };
    }
  };

  /**
   * Realiza uma requisição DELETE no endpoint informado.
   */
  const remove = async () => {
    try {
      const { data } = await api.delete(url);
      return { data, error: null };
    } catch (error: any) {
      return { data: null, error };
    }
  };

  // ...existing code...

  return { get, post, patch, remove };
};
