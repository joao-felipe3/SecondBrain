<template>
  <div key="view-content" class="pt-3 px-5 card-content">
    <div class="title" ref="titleRef" :title="isTruncated ? task.name : ''">
      <strong>{{ task.name }}</strong>
    </div>
    <em class="description" ref="descriptionRef">{{ task.description }}</em><br />
    - {{ task.experience }} EXP & {{ task.prize }} Coins<br />
    
    <div v-if="task.pertExpectedMinutes" class="pert-summary">
      ⏱️ <strong>{{ task.pertExpectedMinutes }}min</strong> | 
      📅 {{ formattedPertDeadline }}
    </div>

    <span :style="{ color: getDeadlineColor(task.deadline), marginTop: isDescriptionTruncated ? '-8px' : '0' }">
      - {{ formatDeadline(task.deadline) }}
    </span>
    <div class="d-flex flex-row align-center" style="gap: 2px; width: fit-content;">
      <template v-for="i in task.pomodorosPlanned" :key="i">
        <v-img 
          :src="i <= task.pomodorosDid ? 'svg/star-full.svg' : 'svg/star.svg'" 
          alt="Star" 
          width="20" 
          style="flex-shrink: 0;" 
        />
      </template>
    </div>
    <div class="d-flex flex-row align-center" style="gap: 8px; width: fit-content; margin-top: -0.55rem;">
      <SvgEffortButton class="mt-2" @click="handleEffort"/>
      <div class="checklist">✅ Checklist: <strong>{{ checklistCompleted }}/{{ checklistTotal }}</strong></div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick, watch, onBeforeUnmount, computed } from 'vue'
import SvgEffortButton from '../../../ui/svg/EffortButton.vue'

import { useTaskStore } from '~/stores/task'

const { task } = defineProps(['task']);
const emit = defineEmits(['fall-complete']);

const taskStore = useTaskStore()

// Tooltip when the title text is truncated
const titleRef = ref(null)
const descriptionRef = ref(null)
const isTruncated = ref(false)
const isDescriptionTruncated = ref(false)
let resizeObserver = null

const formattedPertDeadline = computed(() => {
  if (!task.deadline) return 'N/A'
  try {
    const date = new Date(task.deadline)
    return `${date.getDate()}/${String(date.getMonth() + 1).padStart(2, '0')}`
  } catch {
    return 'N/A'
  }
})

const checklistTotal = computed(() => {
  if (!task.checklist || !Array.isArray(task.checklist)) return 0
  return task.checklist.length
})

const checklistCompleted = computed(() => {
  if (!task.checklist || !Array.isArray(task.checklist)) return 0
  return task.checklist.filter((it) => (typeof it === 'object' ? !!it.completed : false)).length
})

const teDisplay = computed(() => (task.pertExpectedMinutes ? `${task.pertExpectedMinutes}min` : '—'))

function checkTruncated() {
  const el = titleRef.value
  if (!el) {
    isTruncated.value = false
    return
  }
  // For multi-line clamp, comparing scrollHeight and clientHeight works
  isTruncated.value = el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth
}

function checkDescriptionTruncated() {
  const el = descriptionRef.value
  if (!el) {
    isDescriptionTruncated.value = false
    return
  }
  isDescriptionTruncated.value = el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth
}

onMounted(() => {
  nextTick(checkTruncated)
  nextTick(checkDescriptionTruncated)
  window.addEventListener('resize', checkTruncated)
  window.addEventListener('resize', checkDescriptionTruncated)
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => {
      checkTruncated()
      checkDescriptionTruncated()
    })
    if (titleRef.value) resizeObserver.observe(titleRef.value)
    if (descriptionRef.value) resizeObserver.observe(descriptionRef.value)
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', checkTruncated)
  window.removeEventListener('resize', checkDescriptionTruncated)
  if (resizeObserver) resizeObserver.disconnect()
})

watch(() => task.name, () => nextTick(checkTruncated))
watch(() => task.description, () => nextTick(checkDescriptionTruncated))

async function handleComplete() {
  const updatedTask = await taskStore.concludeTask(task._id)
  if (updatedTask) {
    Object.assign(task, updatedTask)
    emit('fall-complete', task._id);
  }
}

async function handleEffort() {
  const updatedTask = await taskStore.incrementPomodoro(task._id)
  if (updatedTask) {
    Object.assign(task, updatedTask)
  }
}


function formatDeadline(date) {
  const now = new Date();
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  const diff = d.getTime() - now.getTime();
  if (diff === 0) return "Today";
  if (diff < 0) return "LATE!";
  return d.toLocaleDateString("en-US", { weekday: "short", day: "2-digit", month: "short" }).toLowerCase();
}

function getDeadlineColor(date) {
  const now = new Date();
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  return d.getTime() < now.getTime() ? "red" : "inherit";
}
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

.title {
  text-align: center;
  font-size: 14px;
  margin-top: -3px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  word-break: break-word;
}

.description {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  word-break: break-word;
  margin-bottom: -1rem;
}

/* Sprint 3: PERT Summary Display */
.pert-summary {
  font-size: 11px;
  padding: 4px 6px;
  font-weight: 500;
  color: #5d4037;
  margin-bottom: -4px;
}

.button-container {
  position: relative;
  width: 72px;
}
.button-label {
  position: absolute;
  top: 50%;
  left: 52%;
  transform: translate(-50%, -50%);
  font-size: 12px;
  color: #eaeaea;
  font-weight: 500;
  pointer-events: none;
  text-align: center;
  text-shadow: 1px 1px 1px rgba(0, 0, 0, 1);
}
.checklist {
  font-size: 11px;
  margin-top: 2px;
  margin-left: -6px;
  color: #5d4037;
}
</style>