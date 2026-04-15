<template>
  <div 
    key="edit-content" 
    class="pt-10 px-10 card-content zoomed-content-wrapper" 
    style="max-width: 430px; margin-left: 10%;"
  >
    <SvgCloseButton @close="$emit('close')" />
    
    <div class="scrollable-content">
      <TaskForm
        :task="props.task"
        :projects="props.projects"
        create-or-edit="Edit"
        v-model:is-valid="isFormValid"
      />
      
      <!-- Micro-Task Details Section -->
      <MicroTaskDetailSection
        v-if="props.task?.microTaskType"
        :task="props.task"
      />
    </div>
    
    <div class="sticky-actions">
      <v-row class="ml-n6" dense>
        <v-col cols="6" class="py-0 px-2">
          <SvgButton label="Delete" @click="$emit('delete')" :disabled="false"/>
        </v-col>
        <v-col cols="6" class="py-0 px-2">
          <SvgButton :label="props.createOrEdit" @click="$emit('edit')" :disabled="!isFormValid" />
        </v-col>
      </v-row>
    </div>
  </div>
</template>

<script setup>
  import { ref } from 'vue'
  import SvgCloseButton from '../../../ui/svg/CloseButton.vue'
  import TaskForm from '../forms/TaskForm.vue'
  import MicroTaskDetailSection from '../page/MicroTaskDetailSection.vue'
  import SvgButton from '../../../ui/svg/Button.vue'
  
  const props = defineProps({
    task: Object,
    projects: Array,
    createOrEdit: String,
    deadline: String,
    notification: String,
  })

  const isFormValid = ref(false)

  const emit = defineEmits([
    'edit',
    'delete',
    'close',
  ])
</script>

<style scoped>
.zoomed-content-wrapper {
  display: flex;
  flex-direction: column;
  height: 100%;
  max-height: 97.5vh;
  margin-left: 1rem;
}

.scrollable-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
}

.scrollable-content::-webkit-scrollbar {
  width: 6px;
  margin-right: -0.5rem;
}

.scrollable-content::-webkit-scrollbar-track {
  background: transparent;
}

.scrollable-content::-webkit-scrollbar-thumb {
  background-color: rgba(0, 0, 0, 0.2);
  border-radius: 3px;
}

.scrollable-content::-webkit-scrollbar-thumb:hover {
  background-color: rgba(0, 0, 0, 0.35);
}

.sticky-actions {
  flex-shrink: 0;
  padding-top: 1rem;
  padding-bottom: 1rem;
  border-top: 1px solid rgba(0, 0, 0, 0.05);
}
</style>