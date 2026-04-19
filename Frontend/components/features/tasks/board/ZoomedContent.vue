<template>
  <div
    key="pergaminhos-content"
    class="zoomed-content-wrapper"
  >
    <!-- Stack de folhas (pergaminhos empilhados) -->
    <div class="pergaminho-stack">
      <div
        v-for="tab in tabs"
        :key="tab.id"
        class="pergaminho-folha"
        :class="{ active: activeTab === tab.id }"
        :style="getSheetStyle(tab.id)"
        @click="onSheetClick(tab.id)"
      >
        <div class="sheet-content">
          <component
            :is="tab.component"
            :task="props.task"
            :projects="props.projects"
            :key="`${tab.id}-${props.task?._id ?? props.task?.id ?? ''}`"
          />
        </div>
      </div>
    </div>
    
    <div class="sticky-actions">
      <v-row dense>
        <v-col cols="6" class="py-0 px-2">
          <Button label="Delete" @click="$emit('delete')" :disabled="false"/>
        </v-col>
        <v-col cols="6" class="py-0 px-2">
          <Button :label="props.createOrEdit" @click="$emit('edit')" :disabled="false" />
        </v-col>
      </v-row>
    </div>

    <!-- Close button no topo direito -->
    <SvgCloseButton @close="$emit('close')" class="close-button-top" />
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, computed } from 'vue'
import { useTabNavigation } from '~/composables/ui/useTabNavigation'
import type { TabConfig } from '~/composables/ui/useTabNavigation'
import SvgCloseButton from '../../../ui/svg/CloseButton.vue'
import EditarTab from '../tabs/EditarTab.vue'
import ChecklistTab from '../tabs/ChecklistTab.vue'
import PertTab from '../tabs/PertTab.vue'
import HistoryTab from '../tabs/HistoryTab.vue'
import Button from '../../../ui/svg/Button.vue'


interface Props {
  task?: any
  projects?: any[]
  createOrEdit?: string
}

const props = withDefaults(defineProps<Props>(), {
  task: () => ({}),
  projects: () => [],
})

const emit = defineEmits(['delete', 'close', 'edit'])

// Configuração das abas
const tabs: TabConfig[] = [
  { id: 'editar', label: '✏️ Editar', icon: '✏️', component: EditarTab },
  { id: 'checklist', label: '✓ Checklist', icon: '✓', component: ChecklistTab },
  { id: 'pert', label: '⏱️ PERT', icon: '⏱️', component: PertTab },
  { id: 'historico', label: '🕐 Histórico', icon: '🕐', component: HistoryTab },
]

// Composable para navegação
const { activeTab, setActiveTab, nextTab, prevTab, initializeFromStorage } = useTabNavigation(tabs)

const PEEK_PX = 32
const SHEET_GAP_Y = 6
const SHEET_ROTATE_DEG = 0.4

const activeIndex = computed(() => tabs.findIndex(t => t.id === activeTab.value))

const getPos = (tabId: string) => {
  const tabIndex = tabs.findIndex(t => t.id === tabId)
  if (tabIndex < 0) return 0
  const n = tabs.length
  const ai = activeIndex.value < 0 ? 0 : activeIndex.value
  return (tabIndex - ai + n) % n
}

const getSheetStyle = (tabId: string) => {
  const pos = getPos(tabId)
  const y = pos * SHEET_GAP_Y
  const r = pos * SHEET_ROTATE_DEG
  const x = pos === 0 ? 0 : PEEK_PX

  return {
    zIndex: String(200 - pos),
    left: '0px',
    top: '0px',
    transform:
      pos === 0
        ? 'translateX(0px) translateY(0px) rotate(0deg)'
        : `translateX(${x}px) translateY(${y}px) rotate(${r}deg)`,
  }
}

const onSheetClick = (tabId: string) => {
  if (activeTab.value === tabId) return
  setActiveTab(tabId)
}

const isTypingTarget = (target: EventTarget | null) => {
  const el = target as HTMLElement | null
  if (!el) return false
  return !!el.closest('input, textarea, select, [contenteditable="true"]')
}

const handleKeydown = (e: KeyboardEvent) => {
  if (isTypingTarget(e.target)) return
  if (e.key === 'ArrowRight') {
    e.preventDefault()
    nextTab()
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault()
    prevTab()
  }
}

onMounted(() => {
  initializeFromStorage()
  window.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<style scoped>
.zoomed-content-wrapper {
  position: absolute;
  inset: 0;
  overflow: hidden;
  padding: 1rem;
  z-index: 50;
}

/* Stack container */
.pergaminho-stack {
  position: absolute;
  inset: 1rem 1rem 0.25rem 1rem;
  overflow: visible;
  z-index: 10;
  filter: drop-shadow(0 10px 20px rgba(0, 0, 0, 0.2));
}

/* Cada folha (aba) */
.pergaminho-folha {
  position: absolute;
  inset: 0;
  background: url('/svg/old-paper-4.svg') center/100% 100% no-repeat;
  box-sizing: border-box;
  font-family: 'Irish Grover', cursive;
  cursor: pointer;
  user-select: none;
  transform-origin: top left;
  will-change: transform;
  transition:
    transform 0.5s cubic-bezier(0.25, 0.1, 0.25, 1);
}

.sheet-content {
  height: 100%;
  box-sizing: border-box;
  padding: 1.25rem clamp(1rem, 4vw, 2.5rem) 5rem;
  overflow-y: auto;
  overflow-x: hidden;
}

.pergaminho-folha:not(.active) .sheet-content {
  opacity: 0;
  pointer-events: none;
}

.sheet-content::-webkit-scrollbar {
  width: 6px;
}

.sheet-content::-webkit-scrollbar-track {
  background: transparent;
}

.sheet-content::-webkit-scrollbar-thumb {
  background-color: #d4a574;
  border-radius: 3px;
}

.sheet-content::-webkit-scrollbar-thumb:hover {
  background-color: #b8934a;
}

.sticky-actions {
  position: absolute;
  left: 50%;
  bottom: 1.2rem;
  transform: translateX(-50%);
  width: min(520px, calc(100% - 3rem));
  z-index: 300;
}

/* Close button no topo */
.close-button-top {
  position: absolute;
  top: 1.2rem;
  right: 1.2rem;
  z-index: 400;
}
</style>