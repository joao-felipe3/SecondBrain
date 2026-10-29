<template>
  <div class="field-journal-mobile">
    <!-- Abas Superiores do Diário -->
    <nav class="diegetic-mobile-tabs" aria-label="Abas do Mural de Contratos">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        class="diegetic-mobile-tab-btn"
        :class="{ 'is-active': activeTab === tab.id }"
        @click="selectTab(tab.id)"
      >
        <span class="tab-icon">{{ tab.icon }}</span>
        <span class="tab-label">{{ tab.label }}</span>
        <span class="tab-badge">{{ tab.count }}</span>
      </button>
    </nav>

    <!-- Conteúdo da Aba Ativa -->
    <div class="journal-tab-content">
      <slot :active-tab="activeTab" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

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
}>();

const tabs = computed<TabConfig[]>(() => [
  { id: 'todo', label: 'Contratos', icon: '📜', count: props.todoCount },
  { id: 'doing', label: 'Em Combate', icon: '⚔️', count: props.doingCount },
  { id: 'done', label: 'Vitórias', icon: '🏆', count: props.doneCount },
]);

function selectTab(tabId: JournalTabId) {
  emit('update:activeTab', tabId);
}
</script>

<style scoped>
.field-journal-mobile {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background: var(--guild-wood-dark, #1f140e);
  border-radius: 6px;
  overflow: hidden;
}

.journal-tab-content {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 0.75rem;
  background: radial-gradient(circle at 50% 10%, hsl(35, 30%, 15%) 0%, hsl(20, 45%, 10%) 100%);
}

.tab-icon {
  font-size: 0.95rem;
}

.tab-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.15rem;
  height: 1.15rem;
  padding: 0 0.2rem;
  border-radius: 9999px;
  background: rgba(0, 0, 0, 0.4);
  font-size: 0.7rem;
  border: 1px solid rgba(255, 255, 255, 0.2);
}
</style>
