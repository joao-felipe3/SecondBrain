import { defineStore } from 'pinia'

export type GuildRoom = 'hall' | 'tasks' | 'projects' | 'calendar'
export type MobileTaskTab = 'todo' | 'doing' | 'done'

export const useUiGuildStore = defineStore('uiGuild', {
  state: () => ({
    activeRoom: 'hall' as GuildRoom,
    mobileTaskTab: 'todo' as MobileTaskTab,
    isReceptionOpen: false,
    selectedCalendarDate: new Date(),
    cameraPosition: { x: 0, y: 0 },
    activeHotspotTooltip: null as string | null,
  }),

  getters: {
    isHallActive: (state) => state.activeRoom === 'hall',
    isTasksActive: (state) => state.activeRoom === 'tasks',
    isProjectsActive: (state) => state.activeRoom === 'projects',
    isCalendarActive: (state) => state.activeRoom === 'calendar',
  },

  actions: {
    setActiveRoom(room: GuildRoom) {
      this.activeRoom = room
    },

    setMobileTaskTab(tab: MobileTaskTab) {
      this.mobileTaskTab = tab
    },

    toggleReceptionModal(state?: boolean) {
      this.isReceptionOpen = typeof state === 'boolean' ? state : !this.isReceptionOpen
    },

    openReceptionModal() {
      this.isReceptionOpen = true
    },

    closeReceptionModal() {
      this.isReceptionOpen = false
    },

    setCameraPosition(x: number, y: number) {
      this.cameraPosition = { x, y }
    },

    setTooltip(tooltip: string | null) {
      this.activeHotspotTooltip = tooltip
    }
  }
})
