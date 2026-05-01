<template>
  <div 
    :class="['task-paper', { 'hover-enabled': !zoomed2 }]"
    :style="[props.positionStyle, { cursor: zoomed2 ? 'default' : 'pointer' }]" 
    @click="handleZoomClick" 
  >
    <v-img 
      src="/svg/old-paper-4.svg" 
      alt="Old Paper" 
      :width="props.zoomed ? 520 : 160" 
      :height="props.zoomed ? 650 : 200" 
      :style="zoomed2 ? { opacity: 0, pointerEvents: 'none', zIndex: 3 } : { zIndex: 3 }"
    />
    <SvgProjectStamp :zoomed="props.zoomed" :colors="props.colors" style="z-index: 400;"/>

    <Transition name="fade-slide" mode="out-in">
      <template v-if="zoomed2">
        <ZoomedContent
          ref="zoomedContentRef"
          :task="props.task"
          :tasks="props.tasks"
          :projects="props.projects"
          :deadline="deadline"
          :notification="notification"
          :createOrEdit="createOrEdit"
          @edit="editAndClose"
          @delete="deleteAndClose"
          @close="emit('close-zoom')"
          @navigate-task="emit('navigate-task', $event)"
          @navigate-context="emit('navigate-context', $event)"
        />
      </template>
      <template v-else>
        <TaskPreview :task="props.task" @fall-complete="handleCompleteFall"/>
      </template>
    </Transition>

    <!-- Hint minimalista: peeks (abas) ficam à direita no zoom -->
    <button
      v-if="zoomed2"
      type="button"
      class="peek-chevron-hint left"
      aria-label="Aba anterior"
      title="Aba anterior"
      @click.stop="goPrevTab"
    >
      <span class="chevron-glyph">‹</span>
    </button>

    <button
      v-if="zoomed2"
      type="button"
      class="peek-chevron-hint right"
      aria-label="Próxima aba"
      title="Próxima aba"
      @click.stop="goNextTab"
    >
      <span class="chevron-glyph">›</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import SvgProjectStamp from '../../../ui/svg/ProjectStamp.vue'
import ZoomedContent from './ZoomedContent.vue'
import TaskPreview from './TaskPreview.vue'

interface Props {
  task: any
  tasks?: any[]
  positionStyle: any
  colors: any
  zoomed: boolean
  create: boolean
  projects: any[]
}

const props = defineProps<Props>()
const emit = defineEmits(['edit-task', 'delete-task', 'close-zoom', 'fall-complete', 'zoom', 'navigate-task', 'navigate-context'])

const zoomedContentRef = ref<InstanceType<typeof ZoomedContent> | null>(null)

const goPrevTab = () => {
  zoomedContentRef.value?.prevTab?.()
}

const goNextTab = () => {
  zoomedContentRef.value?.nextTab?.()
}


const editAndClose = () => {
  emit('edit-task', props.task)
};

const deleteAndClose = () => {
  emit('delete-task', props.task?._id)
};

const handleCompleteFall = () => {
  emit('fall-complete', props.task?._id)
};

const zoomed2 = ref(false)
const createOrEdit = ref('')

watch(
  () => props.zoomed,
  (val) => {
    zoomed2.value = !!val
  },
  { immediate: true }
)

function handleZoomClick() {
  if (zoomed2.value) return
  emit('zoom', props.task)
}

const deadline = ref(null)
const notification = ref(null)

onMounted(() => {
  if (props.task?.deadline) deadline.value = props.task.deadline
  if (props.task?.notification) notification.value = props.task.notification
})

watch(
  () => props.create,
  (val) => {
    createOrEdit.value = val ? 'Create' : 'Edit'
  },
  { immediate: true }
)

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
  position: relative;
  transition: transform 0.2s ease;
  overflow: visible;
}

.task-paper.hover-enabled:hover {
  transform: scale(1.05);
  z-index: 5;
}

.peek-chevron-hint {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: 450;
  font-family: 'Irish Grover', cursive;
  font-size: 44px;
  line-height: 1;
  opacity: 0.98;
  filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.65));
  cursor: pointer;
  background: rgba(255, 255, 255, 0.65);
  border: 1px solid rgba(255, 255, 255, 0.25);
  width: 40px;
  height: 40px;
  border-radius: 999px;
  padding: 0;
  display: grid;
  place-items: center;
}

.chevron-glyph {
  display: block;
  transform: translateY(-1px);
}

.peek-chevron-hint:hover {
  background: rgba(255, 255, 255, 0.88);
}

.peek-chevron-hint.left {
  left: -5rem;
}

.peek-chevron-hint.left .chevron-glyph {
  transform: translateY(-10px) translateX(-1px);
}

.peek-chevron-hint.right {
  right: -5rem;
}

.peek-chevron-hint.right .chevron-glyph {
  transform: translateY(-10px) translateX(1px);
}

</style>
