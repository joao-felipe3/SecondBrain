import { defineStore } from 'pinia'
import { useApi } from '~/composables/api/useApi'
import type { AlertItem } from '~/models/Alert'

export const useAlertsStore = defineStore('alerts', {
  state: () => ({
    alerts: [] as AlertItem[],
    isLoading: false,
  }),

  getters: {
    unreadCount: (state) => state.alerts.filter((a) => !a.isRead).length,
  },

  actions: {
    async loadAlerts(options?: { unreadOnly?: boolean }) {
      this.isLoading = true
      try {
        const unread = options?.unreadOnly ? 'true' : 'false'
        const { get } = useApi(`/alerts?unread=${encodeURIComponent(unread)}`)
        const { data, error } = await get()
        if (!error && data) {
          this.alerts = data
        }
      } finally {
        this.isLoading = false
      }
    },

    async markRead(id: string) {
      const { patch } = useApi(`/alerts/${id}/read`)
      const { data, error } = await patch()
      if (!error && data) {
        const index = this.alerts.findIndex((a) => a._id === id)
        if (index !== -1) {
          this.alerts[index] = data
        }
      }
    },
  },
})
