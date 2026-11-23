<template>
  <div class="editar-tab">
    <TaskForm
      v-if="props.task"
      :task="props.task"
      :projects="props.projects"
      :is-habit="isHabit"
      create-or-edit="Edit"
      class="editar-form"
      @update:is-valid="(v) => emit('form-valid', v)"
    />
    <div v-else class="empty-state">
      <p>Nenhuma tarefa selecionada</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import TaskForm from '../forms/TaskForm.vue';

interface Props {
  task?: any;
  projects?: any[];
}

const props = withDefaults(defineProps<Props>(), {
  task: () => null,
  projects: () => [],
});

const emit = defineEmits(['form-valid']);

const isHabit = computed(() => {
  const t = props.task;
  return !!(t && (t.microTaskType === 'habit' || t.parentRecurringId || t.recurringRule));
});
</script>

<style scoped>
.editar-tab {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  font-family: 'Irish Grover', cursive;
  color: #3e2723;
  overflow-y: auto;
  overflow-x: hidden;
}

.editar-form {
  padding: 0;
  margin: 0;
  /* o formulário ocupa o papel inteiro: a descrição cresce e pega o espaço que sobra */
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 100%;
  box-sizing: border-box;
  /* margem lateral em % para o conteúdo ficar dentro das bordas irregulares do papel */
  padding: 0 4% 8px;
}

.editar-form :deep(.grow-field) {
  flex: 1 0 auto;
  display: flex;
  flex-direction: column;
}

.editar-form :deep(.grow-field .v-field) {
  flex: 1 0 auto;
}

.editar-form :deep(.grow-field textarea) {
  min-height: 140px;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  font-style: italic;
  color: #a6794a;
  font-size: 14px;
}

/* Custom scrollbar */
.editar-tab::-webkit-scrollbar {
  width: 6px;
}

.editar-tab::-webkit-scrollbar-track {
  background: transparent;
}

.editar-tab::-webkit-scrollbar-thumb {
  background-color: #d4a574;
  border-radius: 3px;
}

.editar-tab::-webkit-scrollbar-thumb:hover {
  background-color: #b8934a;
}
</style>
