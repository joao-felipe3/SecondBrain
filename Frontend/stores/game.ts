import { defineStore } from 'pinia'

export const useGameStore = defineStore('game', {
  state: () => ({
    currentScene: 'GuildScene',
    isTransitioning: false,
    hoveredHotspot: null as string | null,
    inventoryOpen: false,
    activePanel: null as 'tasks' | 'projects' | 'calendar' | null,
  }),
  actions: {
    setScene(sceneName: string) {
      this.currentScene = sceneName
    },
    setHovered(name: string | null) {
      this.hoveredHotspot = name
    },
    openPanel(panel: 'tasks' | 'projects' | 'calendar' | null) {
      this.activePanel = panel
    },
    toggleInventory() {
      this.inventoryOpen = !this.inventoryOpen
    }
  }
})
