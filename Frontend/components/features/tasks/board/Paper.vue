<template>
  <div 
    :class="['task-paper', { 'hover-enabled': !zoomed2 }]"
    :style="[positionStyle, { cursor: zoomed2 ? 'default' : 'pointer' }]" 
    @click="handleZoomClick" 
  >
    <v-img 
      src="/svg/old-paper-4.svg" 
      alt="Old Paper" 
      :width="zoomed ? 520 : 160" 
      :height="zoomed ? 650 : 200" 
      style="z-index: 3;" 
    />
    <SvgProjectStamp :zoomed="zoomed" :colors="colors" />

    <Transition name="fade-slide" mode="out-in">
      <template v-if="zoomed2">
        <ZoomedContent 
          :task="task"
          :projects="projects"
          :deadline="deadline"
          :notification="notification"
          :createOrEdit="createOrEdit"
          @edit="editAndClose"
          @delete="deleteAndClose"
          @close="$emit('close-zoom')"
        />
      </template>
      <template v-else>
        <TaskPreview :task="task" @fall-complete="handleCompleteFall"/>
      </template>
    </Transition>
  </div>
</template>

<script setup>
import { ref, watchEffect, onMounted } from 'vue'
import SvgProjectStamp from '../../../ui/svg/ProjectStamp.vue'
import ZoomedContent from './ZoomedContent.vue'
import TaskPreview from './TaskPreview.vue'

const { task, positionStyle, colors, zoomed, create, projects } = defineProps(['task', 'positionStyle', 'colors', 'zoomed', 'create', 'projects'])
const emit = defineEmits(['edit-task', 'delete-task', 'close-zoom', 'fall-complete']);


const editAndClose = () => {
  emit('edit-task', task);
};

const deleteAndClose = () => {
  emit('delete-task', task._id);
};

const handleCompleteFall = () => {
  emit('fall-complete', task._id);
};

const zoomed2 = ref(false)
const createOrEdit = ref('')

watchEffect(() => {
  setTimeout(() => {
      zoomed2.value = zoomed;
    }, 10)
})

function handleZoomClick(event) {
  if (zoomed2) return;

  // Garante que o clique foi na div principal, não em um filho
  if (event.target === event.currentTarget) {
    $emit('zoom', task);
  }
}

const deadline = ref(null)
const notification = ref(null)

onMounted(() => {
  if (task.deadline) deadline.value = task.deadline;
  if (task.notification) notification.value = task.notification;
})

watchEffect(() => {
  if (create) createOrEdit.value = 'Create';
  else createOrEdit.value = 'Edit'
})

</script>

<style scoped>

.card-content {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 4;
  color: #3e2723;
  font-family: 'Irish Grover', cursive;
  overflow: hidden;
  font-size: 12px;
  line-height: 1.5;
}

.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.5s ease;
}

.fade-slide-enter-from {
  opacity: 0;
  transform: scale(0.75);
}

.fade-slide-leave-to {
  opacity: 0;
  transform: scale(1.25);
}

.task-paper {
  transition: transform 0.2s ease;
}

.task-paper.hover-enabled:hover {
  transform: scale(1.05);
  z-index: 5;
}

</style>
