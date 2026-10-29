import { vi } from 'vitest';

export const useNuxtApp = () => ({
  $api: {
    get: vi.fn().mockResolvedValue({ data: null }),
    post: vi.fn().mockResolvedValue({ data: null }),
    patch: vi.fn().mockResolvedValue({ data: null }),
    delete: vi.fn().mockResolvedValue({ data: null }),
  },
});

export const useRuntimeConfig = () => ({
  public: {
    apiBase: 'http://localhost:3000',
  },
});

export const defineNuxtPlugin = (fn: any) => fn;
export const defineNuxtComponent = (fn: any) => fn;
