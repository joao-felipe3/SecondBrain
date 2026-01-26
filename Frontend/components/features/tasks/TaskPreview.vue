<template>
  <div key="view-content" class="pt-3 px-5 card-content">
    <div class="title">
      <strong>{{ task.name }}</strong>
    </div>
    <em>{{ task.description }}</em><br />
    - {{ task.experience }} EXP & {{ task.prize }} Coins<br />
    <span :style="{ color: getDeadlineColor(task.deadline) }">
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
    <div class="d-flex flex-row align-center" style="gap: 8px; width: fit-content; margin-top: -3.5%;">
      <SvgEffortButton class="mt-" @click="handleEffort"/>
      <SvgButton 
        label="Complete"
        :width="72"
        :height="50"
        @click="handleComplete"
        :labelSize="12"
        labelMarginTop="-55%"
        labelMarginLeft="7.5%"
      />
    </div>
  </div>
</template>

<script setup>
import SvgEffortButton from '../../ui/svg/EffortButton.vue'
import SvgButton from '../../ui/svg/Button.vue'
import useDateFormat from '~/composables/utils/useDateFormat'
import { useTaskStore } from '~/stores/task'

const { task } = defineProps(['task']);
const emit = defineEmits(['fall-complete']);

const taskStore = useTaskStore()

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
  margin-bottom: 4px;
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
</style>