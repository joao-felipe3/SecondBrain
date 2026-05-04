<template>
  <div key="habit-view-content" class="pt-3 px-5 card-content">
    <div class="title" ref="titleRef" :title="isTruncated ? habit.name : ''">
      <strong>{{ habit.name }}</strong>
    </div>
    <em class="description" ref="descriptionRef">{{ habit.description }}</em><br />
    - {{ habit.experience }} EXP & {{ habit.prize }} Coins<br />
    
    <!-- Próxima data do hábito -->
    <div v-if="habit.deadline" class="habit-next-date">
      📅 Próximo: {{ formatDeadline(habit.deadline) }}
    </div>

    <!-- Streak visual em destaque -->
    <div class="streak-display">
      <span class="streak-emoji">🔥</span>
      <span class="streak-count">{{ streakData?.currentStreak || 0 }} dias</span>
    </div>

    <!-- PERT summary (se houver) -->
    <div v-if="habit.pertExpectedMinutes" class="pert-summary">
      ⏱️ <strong>{{ habit.pertExpectedMinutes }}min  📍 {{ formatRecurrence(habit.recurringRule) }}</strong>
    </div>



    <!-- Mini-stats: aderência % -->
    <div class="adherence-stats">
      ✓ Aderência: <strong>{{ streakData?.aderencePercent || 0 }}%</strong>
    </div>

    <!-- Ações rápidas: Completar e Pular -->
    <div class="habit-actions">
      <button class="habit-action-btn complete" @click.stop="handleComplete" :disabled="isLoading">
        ✅
      </button>
      <button class="habit-action-btn skip" @click.stop="handleSkip" :disabled="isLoading">
        ⏭️
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick, watch, onBeforeUnmount, computed } from 'vue'
import { useTaskStore } from '~/stores/task'

const { habit } = defineProps(['habit'])
const emit = defineEmits(['complete-habit', 'skip-habit'])

const taskStore = useTaskStore()
const titleRef = ref(null)
const descriptionRef = ref(null)
const isTruncated = ref(false)
const isDescriptionTruncated = ref(false)
const isLoading = ref(false)
let resizeObserver = null

// Streak data (buscar do store ou calcular localmente)
const streakData = computed(() => {
  if (!habit?.parentRecurringId && !habit?._id) return null
  const recurringId = habit?.parentRecurringId || habit?._id
  // TODO: buscar do store via getter `getStreakForHabit(recurringId)`
  // Por enquanto, usar dados do hábito diretamente se disponíveis
  return habit?.streakData || { currentStreak: 0, aderencePercent: 0 }
})

function checkTruncated() {
  const el = titleRef.value
  if (!el) {
    isTruncated.value = false
    return
  }
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

watch(() => habit.name, () => nextTick(checkTruncated))
watch(() => habit.description, () => nextTick(checkDescriptionTruncated))

function formatDeadline(date) {
  const now = new Date()
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  now.setHours(0, 0, 0, 0)
  const diff = d.getTime() - now.getTime()
  if (diff === 0) return 'Today'
  if (diff < 0) return 'OVERDUE!'
  return d.toLocaleDateString('en-US', { weekday: 'short', day: '2-digit', month: 'short' }).toLowerCase()
}

/**
 * Formata a regra de recorrência para exibição compacta
 * Ex: "Daily", "Weekly (Mon, Wed, Fri)", "Biweekly", "Monthly"
 */
function formatRecurrence(rule) {
  if (!rule) return '—'
  const { frequency, interval, daysOfWeek } = rule
  
  const freqLabel = {
    daily: 'Daily',
    weekly: 'Weekly',
    biweekly: 'Biweekly',
    monthly: 'Monthly',
    custom: 'Custom'
  }[frequency] || frequency

  if (frequency === 'weekly' && daysOfWeek && daysOfWeek.length > 0) {
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const days = daysOfWeek.map(d => dayNames[d]).join(', ')
    return `${freqLabel} (${days})`
  }

  if (interval && interval > 1) {
    return `Every ${interval} ${freqLabel.toLowerCase()}`
  }

  return freqLabel
}

async function handleComplete() {
  const result = await taskStore.handleRecurringCompletion(habit._id)
  if (result.success) {
    emit('complete-habit', habit._id)
  }
}

async function handleSkip() {
  const result = await taskStore.skipRecurringTask(habit._id)
  if (result.success) {
    emit('skip-habit', habit._id)
  }
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
  display: flex;
  flex-direction: column;
  justify-content: space-between;
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
  -webkit-line-clamp: 1;
  line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  word-break: break-word;
  margin-bottom: -1rem;
  font-size: 11px;
}

/* Próxima data do hábito */
.habit-next-date {
  font-size: 11px;
  color: #5d4037;
  margin: 2px 0;
  font-weight: 500;
}

/* Streak em destaque */
.streak-display {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin: 2px 0;
  padding: 1px 2px;
  background: rgba(255, 152, 0, 0.15);
  border-radius: 6px;
  border: 1px solid rgba(255, 152, 0, 0.3);
}

.streak-emoji {
  font-size: 13px;
}

.streak-count {
  font-size: 12px;
  font-weight: 600;
  color: #e65100;
}

/* PERT summary */
.pert-summary {
  font-size: 11px;
  padding: 2px 4px;
  font-weight: 500;
  color: #5d4037;
  margin: 2px 0;
}

/* Recurrence info */
.recurrence-info {
  font-size: 10px;
  color: #6d4c41;
  margin: 2px 0;
  padding: 2px 4px;
  background: rgba(109, 76, 65, 0.08);
  border-radius: 3px;
}

/* Aderência stats */
.adherence-stats {
  font-size: 11px;
  color: #5d4037;
  margin-top: 4px;
  font-weight: 500;
}

/* Ações rápidas */
.habit-actions {
  display: flex;
  gap: 6px;
  justify-content: center;
  margin-top: 6px;
  padding-top: 4px;
  border-top: 1px solid rgba(93, 64, 55, 0.2);
}

.habit-action-btn {
  flex: 1;
  min-height: 28px;
  border: 1px solid rgba(93, 64, 55, 0.3);
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  font-size: 16px;
  transition: all 0.2s ease;
  font-weight: 600;
}

.habit-action-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.95);
  border-color: rgba(93, 64, 55, 0.6);
  transform: scale(1.05);
}

.habit-action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}


</style>
