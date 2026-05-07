import { ref, computed } from 'vue'
import { useApi } from './useApi'

export const useSettings = () => {
  const { get, patch, post } = useApi()
  const settings = ref(null)
  const loading = ref(false)

  const silenceNotifications = computed({
    get: () => settings.value?.silenceNotifications ?? false,
    set: async (value) => {
      if (settings.value) {
        settings.value.silenceNotifications = value
      }
    },
  })

  const fetchSettings = async (userId) => {
    loading.value = true
    try {
      const response = await get(`/settings/${userId}`)
      settings.value = response
    } catch (error) {
      console.error('Failed to fetch settings:', error)
    } finally {
      loading.value = false
    }
  }

  const updateSettings = async (userId, updateDto) => {
    try {
      const response = await patch(`/settings/${userId}`, updateDto)
      settings.value = response
      return response
    } catch (error) {
      console.error('Failed to update settings:', error)
      throw error
    }
  }

  const toggleSilenceNotifications = async (userId) => {
    try {
      const response = await post(`/settings/${userId}/toggle-silence-notifications`)
      settings.value = response
      return response
    } catch (error) {
      console.error('Failed to toggle silence notifications:', error)
      throw error
    }
  }

  return {
    settings,
    loading,
    silenceNotifications,
    fetchSettings,
    updateSettings,
    toggleSilenceNotifications,
  }
}
