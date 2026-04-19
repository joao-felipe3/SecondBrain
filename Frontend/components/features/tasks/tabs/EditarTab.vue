<template>
  <div class="editar-tab">
    <TaskForm
      v-if="props.task"
      :task="props.task"
      :projects="props.projects"
      create-or-edit="Edit"
      class="editar-form"
    />
    <div v-else class="empty-state">
      <p>Nenhuma tarefa selecionada</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import TaskForm from '../forms/TaskForm.vue'

interface Props {
  task?: any
  projects?: any[]
}

const props = withDefaults(defineProps<Props>(), {
  task: () => null,
  projects: () => [],
})
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
