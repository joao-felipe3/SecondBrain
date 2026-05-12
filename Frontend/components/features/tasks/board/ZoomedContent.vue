<template>
  <div key="pergaminhos-content" class="layout-container">
    <!-- Alertas ao lado direito -->
    <div class="alerts-container">
      <DeviationWarningAlert :task-id="props.task?._id" />
      <ValidationErrorBanner :task-id="props.task?._id" />
    </div>

    <!-- Stack de folhas (pergaminhos empilhados) -->
    <div class="zoomed-content-wrapper">
    <div class="pergaminho-stack">
      <div
        v-for="tab in tabs"
        :key="tab.id"
        class="pergaminho-folha"
        :class="{ active: activeTab === tab.id }"
        :style="getSheetVars(tab.id)"
        @click="onSheetClick(tab.id)"
        :title="activeTab === tab.id ? '' : `Abrir ${tab.label}`"
      >
        <div v-if="activeTab !== tab.id" class="peek-hint" aria-hidden="true">
          <span class="peek-label">{{ tab.label }}</span>
        </div>
        <div class="sheet-content">
          <component
            :is="tab.component"
            :task="props.task"
            :tasks="props.tasks"
            :projects="props.projects"
            :key="`${tab.id}-${props.task?._id ?? props.task?.id ?? ''}`"
            @navigate-task="$emit('navigate-task', $event)"
            @navigate-context="$emit('navigate-context', $event)"
            @form-valid="onFormValid"
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
          <Button :label="props.createOrEdit" @click="$emit('edit')" :disabled="!isFormValid" />
        </v-col>
      </v-row>
    </div>

    <!-- Close button no topo direito -->
    <SvgCloseButton @close="$emit('close')" class="close-button-top" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, computed, watch, ref } from 'vue'
import { useTabNavigation } from '~/composables/ui/useTabNavigation'
import type { TabConfig } from '~/composables/ui/useTabNavigation'
import SvgCloseButton from '../../../ui/svg/CloseButton.vue'
import EditarTab from '../tabs/EditarTab.vue'
import ChecklistTab from '../tabs/ChecklistTab.vue'
import PertTab from '../tabs/PertTab.vue'
import HistoryTab from '../tabs/HistoryTab.vue'
import FeedbackTab from '../tabs/FeedbackTab.vue'
import LineageTab from '../tabs/LineageTab.vue'
import ValueTab from '../tabs/ValueTab.vue'
import Button from '../../../ui/svg/Button.vue'
import HabitTimelineTab from '../tabs/HabitTimelineTab.vue'
import HabitStatsTab from '../tabs/HabitStatsTab.vue'
import ValidationErrorBanner from '../ui/ValidationErrorBanner.vue'
import DeviationWarningAlert from '../ui/DeviationWarningAlert.vue'


interface Props {
  task?: any
  tasks?: any[]
  projects?: any[]
  createOrEdit?: string
}

const props = withDefaults(defineProps<Props>(), {
  task: () => ({}),
  tasks: () => [],
  projects: () => [],
})

const emit = defineEmits(['delete', 'close', 'edit', 'navigate-task', 'navigate-context'])

const isFormValid = ref(true)

const onFormValid = (valid: boolean) => {
  isFormValid.value = valid
}

// Detectar se é um hábito
const isHabit = computed(() => {
  const t = props.task
  return t?.microTaskType === 'habit' || t?.parentRecurringId || t?.recurringRule
})

// Configuração das abas para tasks
const taskTabs: TabConfig[] = [
  { id: 'editar', label: 'Editar', icon: '✏️', component: EditarTab },
  { id: 'checklist', label: 'Checklist', icon: '✓', component: ChecklistTab },
  { id: 'pert', label: 'PERT', icon: '⏱️', component: PertTab },
  { id: 'valor', label: 'Valor', icon: '🎯', component: ValueTab },
  { id: 'lineage', label: 'Lineage', icon: '🧭', component: LineageTab },
  { id: 'historico', label: 'Histórico', icon: '🕐', component: HistoryTab },
  { id: 'feedback', label: 'Feedback', icon: '💬', component: FeedbackTab },
]

// Configuração das abas para habits
const habitTabs: TabConfig[] = [
  { id: 'editar', label: 'Editar', icon: '✏️', component: EditarTab },
  { id: 'timeline', label: 'Timeline', icon: '📅', component: HabitTimelineTab },
  { id: 'stats', label: 'Estatísticas', icon: '📊', component: HabitStatsTab },
  { id: 'historico', label: 'Histórico', icon: '🕐', component: HistoryTab },
  { id: 'feedback', label: 'Feedback', icon: '💬', component: FeedbackTab },
]

// Tabs dinâmicas baseado no tipo
const tabs = computed(() => isHabit.value ? habitTabs : taskTabs)

const getCurrentTabs = () => isHabit.value ? habitTabs : taskTabs

// Composable para navegação - inicializa com a lista atual (array)
const nav = useTabNavigation(getCurrentTabs())
const { activeTab, setActiveTab, nextTab, prevTab, initializeFromStorage, tabs: navTabs } = nav

// Watch para resetar tab se tipo mudar
watch(() => isHabit.value, (newIsHabit) => {
  const newTabs = newIsHabit ? habitTabs : taskTabs
  // Se a aba atual não existe nas novas tabs, vai para a primeira
  if (!newTabs.find(t => t.id === activeTab.value)) {
    setActiveTab(newTabs[0].id)
  }
  // Atualiza a lista de tabs exposta pelo composable para manter UI em sincronia
  navTabs.value = newTabs
})

defineExpose({
  nextTab,
  prevTab,
  setActiveTab,
})

const PEEK_PX = 32
const SHEET_GAP_Y = 6
const SHEET_ROTATE_DEG = 0.4



const activeIndex = computed(() => {
  const currentTabs = getCurrentTabs()
  return currentTabs.findIndex(t => t.id === activeTab.value)
})

const getPos = (tabId: string) => {
  const currentTabs = getCurrentTabs()
  const tabIndex = currentTabs.findIndex(t => t.id === tabId)
  if (tabIndex < 0) return 0
  const n = currentTabs.length
  const ai = activeIndex.value < 0 ? 0 : activeIndex.value
  return (tabIndex - ai + n) % n
}

const getSheetVars = (tabId: string) => {
  const pos = getPos(tabId)
  const y = pos * SHEET_GAP_Y
  const r = pos * SHEET_ROTATE_DEG
  const x = pos === 0 ? 0 : PEEK_PX

  return {
    zIndex: String(200 - pos),
    left: '0px',
    top: '0px',
    '--sheet-x': `${x}px`,
    '--sheet-y': `${y}px`,
    '--sheet-r': `${r}deg`,
  } as Record<string, string>
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
.alerts-container {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 1000;
  pointer-events: none;
  padding: 2rem;
  width: 32%;

}

.alerts-container > * {
  pointer-events: auto;
}

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
  --sheet-x: 0px;
  --sheet-y: 0px;
  --sheet-r: 0deg;
  --sheet-hover-x: -15px;
  --sheet-hover-y: -15px;
  --sheet-hover-r: 0deg;
  transform: translateX(calc(var(--sheet-x) + var(--sheet-hover-x)))
    translateY(calc(var(--sheet-y) + var(--sheet-hover-y)))
    rotate(calc(var(--sheet-r) + var(--sheet-hover-r)));
  transition:
    transform 0.5s cubic-bezier(0.25, 0.1, 0.25, 1),
    filter 0.2s ease,
    opacity 0.2s ease;
}

.pergaminho-folha:not(.active):hover {
  --sheet-hover-x: 0px;
  --sheet-hover-y: -1px;
  --sheet-hover-r: 0deg;
  filter: brightness(1.04) saturate(1.08);
}

.pergaminho-folha.active {
  filter: none;
}

.peek-hint {
  position: absolute;
  right: 0.85rem;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  pointer-events: none;
  z-index: 5;
}

.peek-label {
  font-size: 16px;
  line-height: 1.2;
  opacity: 0;
  transition: opacity 0.15s ease;
  text-shadow: 0 1px 0 rgba(0, 0, 0, 0.25);
  color: black;
  background-color: #b8934a;
  padding: 0.1rem 0.5rem;
  border-radius: 4px;
}

.pergaminho-folha:not(.active):hover .peek-label {
  opacity: 0.95;
}

@media (hover: none) {
  .peek-label {
    opacity: 0.95;
  }
}

.sheet-content {
  height: 100%;
  box-sizing: border-box;
  padding: 1.25rem clamp(0.1rem, 4vw, 2.5rem) 5rem;
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

/* Mobile Responsiveness */
@media (max-width: 768px) {
  .alerts-container {
    padding: 0.5rem;
  }

  .zoomed-content-wrapper {
    padding: 0.5rem;
  }

  .pergaminho-stack {
    inset: 0.5rem 0.5rem 0.2rem 0.5rem;
  }

  .pergaminho-folha {
    background-size: 100% 100%;
  }

  .sheet-content {
    padding: 1rem clamp(0.5rem, 3vw, 1.5rem) 3rem;
    font-size: 14px;
  }

  .peek-label {
    font-size: 12px;
    padding: 0.05rem 0.3rem;
  }

  .sticky-actions {
    width: min(100%, calc(100% - 1rem));
    bottom: 0.6rem;
    left: 50%;
    transform: translateX(-50%);
  }

  .close-button-top {
    top: 0.6rem;
    right: 0.6rem;
  }
}

@media (max-width: 480px) {
  .alerts-container {
    padding: 0.3rem;
  }

  .zoomed-content-wrapper {
    padding: 0.3rem;
    inset: 0;
  }

  .pergaminho-stack {
    inset: 0.3rem 0.3rem 0.15rem 0.3rem;
  }

  .sheet-content {
    padding: 0.75rem 1rem 2.5rem 1rem;
    font-size: 13px;
  }

  .peek-label {
    display: none;
  }

  .sticky-actions {
    width: calc(100% - 0.6rem);
    bottom: 0.3rem;
  }

  .close-button-top {
    top: 0.3rem;
    right: 0.3rem;
    width: 24px;
    height: 24px;
  }
}
</style>