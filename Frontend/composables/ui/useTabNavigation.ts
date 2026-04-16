import { ref, computed, watch } from 'vue'

/**
 * Sprint 2.5: Tab Navigation System for ZoomedContent
 * 
 * Gerencia navegação entre 4 abas (pergaminhos empilhados)
 * com suporte a teclado (Arrow Left/Right) e persistência em sessionStorage.
 */

export interface TabConfig {
  id: string           // "detalhes", "checklist", "pert", "historico"
  label: string        // "Detalhes", "Checklist", "PERT", "Histórico"
  icon: string         // "📋", "✓", "⏱️", "🕐"
  component: any       // Vue component a renderizar
}

export function useTabNavigation(tabs: TabConfig[]) {
  // Estado reativo
  const activeTab = ref<string>(tabs[0]?.id || 'detalhes')
  const tabsList = ref<TabConfig[]>(tabs)

  // Chave para sessionStorage
  const STORAGE_KEY = 'zoomed-active-tab'

  /**
   * Recupera aba ativa do sessionStorage (ou usa padrão)
   */
  const initializeFromStorage = () => {
    if (typeof window !== 'undefined') {
      const stored = sessionStorage.getItem(STORAGE_KEY)
      if (stored && tabs.some(t => t.id === stored)) {
        activeTab.value = stored
      }
    }
  }

  /**
   * Atualiza sessionStorage quando aba ativa muda
   */
  watch(activeTab, (newActiveTab) => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(STORAGE_KEY, newActiveTab)
    }
  })

  /**
   * Muda aba ativa para um ID específico
   */
  const setActiveTab = (tabId: string) => {
    if (tabs.some(t => t.id === tabId)) {
      activeTab.value = tabId
    }
  }

  /**
   * Navega para a próxima aba (cíclica)
   */
  const nextTab = () => {
    const currentIndex = tabs.findIndex(t => t.id === activeTab.value)
    const nextIndex = (currentIndex + 1) % tabs.length
    activeTab.value = tabs[nextIndex].id
  }

  /**
   * Navega para a aba anterior (cíclica)
   */
  const prevTab = () => {
    const currentIndex = tabs.findIndex(t => t.id === activeTab.value)
    const prevIndex = (currentIndex - 1 + tabs.length) % tabs.length
    activeTab.value = tabs[prevIndex].id
  }

  /**
   * Retorna o label da próxima aba (para navigation hint footer)
   */
  const getNextTabLabel = computed(() => {
    const currentIndex = tabs.findIndex(t => t.id === activeTab.value)
    const nextIndex = (currentIndex + 1) % tabs.length
    return tabs[nextIndex]?.label || ''
  })

  /**
   * Retorna o índice da aba ativa
   */
  const getActiveTabIndex = computed(() => {
    return tabs.findIndex(t => t.id === activeTab.value)
  })

  /**
   * Verifica se uma aba é a ativa (método helper)
   */
  const isTabActive = (tabId: string): boolean => {
    return activeTab.value === tabId
  }

  return {
    activeTab,
    tabs: tabsList,
    setActiveTab,
    nextTab,
    prevTab,
    getNextTabLabel,
    getActiveTabIndex,
    isTabActive,
    initializeFromStorage,
  }
}
