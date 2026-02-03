<template>
  <v-row class="d-flex align-center justify-start pa-0" no-gutters>
    <div class="stats-container">
      <TaskCard
        title="Left to Do"
        :count="String(pendingStats.count)"
        countLabel="Pending tasks"
        :time="pendingStats.time"
        timeLabel="Estimated Time"
        paperTop="31%"
        paperLeft="30%"
        countTop="41%"
        countLeft="0%"
        countLabelTop="80%"
        timeTop="50%"
        timeLeft="45%"
        timeLabelTop="80%"
      />

      <TaskCard
        title="Already Done"
        :count="String(completedStats.count)"
        countLabel="Completed tasks"
        :time="completedStats.time"
        timeLabel="Estimated Time"
        paperTop="31%"
        paperLeft="30%"
        countTop="41%"
        countLeft="0%"
        countLabelTop="80%"
        timeTop="50%"
        timeLeft="45%"
        timeLabelTop="80%"
      />
    </div>
  </v-row>
</template>

<script setup>
import { computed } from 'vue'
import TaskCard from './Card.vue'

const props = defineProps({
  tasks: {
    type: Array,
    default: () => []
  }
})

// Calculate statistics for pending tasks
const pendingStats = computed(() => {
  const pending = props.tasks.filter(t => !t.isConcluded)
  const count = pending.length
  const totalMinutes = pending.reduce((sum, task) => {
    return sum + (task.pomodorosPlanned || 0) * 25
  }, 0)
  return {
    count,
    time: formatTime(totalMinutes)
  }
})

// Calculate statistics for completed tasks
const completedStats = computed(() => {
  const completed = props.tasks.filter(t => t.isConcluded)
  const count = completed.length
  const totalMinutes = completed.reduce((sum, task) => {
    return sum + (task.pomodorosPlanned || 0) * 25
  }, 0)
  return {
    count,
    time: formatTime(totalMinutes)
  }
})

// Format minutes to "Xh Ymin" or "Xmin"
function formatTime(minutes) {
  if (minutes === 0) return '0min'
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  if (hours === 0) return `${mins}min`
  if (mins === 0) return `${hours}h`
  return `${hours}h ${mins}min`
}
</script>

<style scoped>
.stats-container {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  width: 100%;
  margin-top: 0.5rem;
  position: relative;
  justify-content: flex-start;
}

@media (min-width: 768px) {
  .stats-container {
    flex-wrap: nowrap;
    gap: 0;
  }
  
  .stats-container > :nth-child(2) {
    margin-left: -30px;
  }
}

@media (max-width: 767px) {
  .stats-container {
    justify-content: center;
  }
}
</style>