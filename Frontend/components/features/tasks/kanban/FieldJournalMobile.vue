<template>
  <div class="field-journal-mobile">
    <!-- Prancha com as abas de madeira do diário de campo -->
    <nav class="journal-tabs-plank" role="tablist" aria-label="Abas do Mural de Contratos">
      <span class="plank-rivet rivet-l" aria-hidden="true"></span>
      <span class="plank-rivet rivet-r" aria-hidden="true"></span>
      <button
        v-for="tab in tabs"
        :key="tab.id"
        type="button"
        role="tab"
        class="journal-tab"
        :class="[
          `tab-${tab.id}`,
          { 'is-active': activeTab === tab.id, 'is-drop-target': dropTarget === tab.id },
        ]"
        :aria-selected="activeTab === tab.id"
        :title="`${tab.label} (${tab.count})`"
        @click="selectTab(tab.id)"
        @dragenter.prevent="dropTarget = tab.id"
        @dragover.prevent="dropTarget = tab.id"
        @dragleave="dropTarget = dropTarget === tab.id ? null : dropTarget"
        @drop.prevent="onDrop($event, tab.id)"
      >
        <span class="tab-seal" aria-hidden="true"
          >{{ tab.icon }}<span class="tab-badge">{{ tab.count }}</span></span
        >
        <span class="tab-label">{{ tab.label }}</span>
      </button>
    </nav>

    <!-- Conteúdo opcional da aba ativa (o KanbanBoard renderiza a coluna fora do slot) -->
    <div v-if="$slots.default" class="journal-tab-content">
      <slot :active-tab="activeTab" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';

export type JournalTabId = 'todo' | 'doing' | 'done';

interface TabConfig {
  id: JournalTabId;
  label: string;
  icon: string;
  count: number;
}

const props = withDefaults(
  defineProps<{
    activeTab?: JournalTabId;
    todoCount?: number;
    doingCount?: number;
    doneCount?: number;
  }>(),
  {
    activeTab: 'todo',
    todoCount: 0,
    doingCount: 0,
    doneCount: 0,
  },
);

const emit = defineEmits<{
  (e: 'update:activeTab', tab: JournalTabId): void;
  /** folha solta sobre uma aba: o board move a tarefa para a coluna da aba */
  (e: 'drop-on-tab', payload: { event: DragEvent; tab: JournalTabId }): void;
}>();

const tabs = computed<TabConfig[]>(() => [
  { id: 'todo', label: 'Contratos', icon: '📜', count: props.todoCount },
  { id: 'doing', label: 'Em Combate', icon: '⚔️', count: props.doingCount },
  { id: 'done', label: 'Vitórias', icon: '🏆', count: props.doneCount },
]);

const dropTarget = ref<JournalTabId | null>(null);

function selectTab(tabId: JournalTabId) {
  emit('update:activeTab', tabId);
}

function onDrop(event: DragEvent, tab: JournalTabId) {
  dropTarget.value = null;
  emit('drop-on-tab', { event, tab });
}
</script>

<style scoped>
.field-journal-mobile {
  display: flex;
  flex-direction: column;
  width: 100%;
}

/* prancha escura onde as abas ficam penduradas */
.journal-tabs-plank {
  position: relative;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  padding: 6px 14px 0;
  border-radius: 10px 10px 4px 4px;
  background:
    linear-gradient(180deg, rgba(255, 220, 170, 0.1) 0%, transparent 40%, rgba(0, 0, 0, 0.3) 100%),
    repeating-linear-gradient(
      90deg,
      hsl(22, 40%, 20%) 0 9px,
      hsl(20, 44%, 15%) 9px 13px,
      hsl(23, 36%, 23%) 13px 21px
    );
  border: 1px solid rgba(12, 7, 3, 0.9);
  box-shadow:
    inset 0 1px 0 rgba(255, 210, 150, 0.18),
    0 6px 14px rgba(0, 0, 0, 0.6);
}

.plank-rivet {
  position: absolute;
  top: 50%;
  width: 6px;
  height: 6px;
  transform: translateY(-50%);
  border-radius: 50%;
  background: radial-gradient(circle at 35% 35%, #d1d5db 0%, #4b5563 65%, #111827 100%);
  box-shadow: 0 1px 1px rgba(0, 0, 0, 0.7);
}

.rivet-l {
  left: 4px;
}

.rivet-r {
  right: 4px;
}

/* aba de madeira entalhada: a ativa é mais clara, sobe e ganha friso dourado */
.journal-tab {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  min-width: 0;
  min-height: 54px;
  padding: 6px 4px 7px;
  border: 1px solid rgba(15, 9, 4, 0.9);
  border-bottom: none;
  border-radius: 8px 8px 0 0;
  background: linear-gradient(180deg, hsl(25, 34%, 30%) 0%, hsl(22, 38%, 21%) 100%);
  color: hsl(36, 45%, 78%);
  font-family: var(--font-guild-title, 'Irish Grover', cursive);
  font-size: 0.78rem;
  letter-spacing: 0.3px;
  cursor: pointer;
  box-shadow: inset 0 1px 0 rgba(255, 215, 160, 0.18);
  transform: translateY(3px);
  transition:
    transform 0.15s ease,
    background 0.15s ease,
    color 0.15s ease;
  -webkit-tap-highlight-color: transparent;
}

.journal-tab.is-active {
  transform: translateY(0);
  background: linear-gradient(180deg, hsl(32, 45%, 46%) 0%, hsl(27, 42%, 32%) 100%);
  color: hsl(42, 90%, 92%);
  box-shadow:
    inset 0 0 0 1.5px hsl(42, 70%, 55%),
    inset 0 2px 0 rgba(255, 230, 180, 0.35),
    0 -2px 8px rgba(255, 190, 90, 0.25);
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.6);
}

.journal-tab.is-drop-target {
  box-shadow: inset 0 0 0 2px hsl(45, 90%, 62%);
}

.journal-tab:focus-visible {
  outline: 2px solid hsl(45, 90%, 62%);
  outline-offset: 1px;
}

/* ícone num pequeno selo de cera da cor da coluna */
.tab-seal {
  position: relative;
  display: inline-grid;
  place-items: center;
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  font-size: 0.72rem;
  box-shadow:
    inset 0 -2px 3px rgba(0, 0, 0, 0.35),
    0 1px 2px rgba(0, 0, 0, 0.5);
}

.tab-todo .tab-seal {
  background: radial-gradient(circle at 35% 30%, hsl(0, 70%, 48%) 0%, hsl(0, 75%, 28%) 100%);
}

.tab-doing .tab-seal {
  background: radial-gradient(circle at 35% 30%, hsl(205, 70%, 50%) 0%, hsl(210, 75%, 28%) 100%);
}

.tab-done .tab-seal {
  background: radial-gradient(circle at 35% 30%, hsl(145, 50%, 42%) 0%, hsl(150, 60%, 22%) 100%);
}

.tab-label {
  font-size: 0.74rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

/* contagem presa no canto do selo */
.tab-badge {
  position: absolute;
  top: -5px;
  right: -14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  min-width: 1.2rem;
  height: 1.2rem;
  padding: 0 0.25rem;
  border-radius: 9999px;
  background: rgba(0, 0, 0, 0.45);
  border: 1px solid rgba(255, 220, 170, 0.3);
  font-family: var(--font-guild-body, 'Poppins', sans-serif);
  font-size: 0.68rem;
  color: hsl(40, 80%, 88%);
}

.tab-label {
  max-width: 100%;
  line-height: 1.05;
}

.journal-tab-content {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 0.75rem;
}
</style>
