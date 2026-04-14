<template>
  <h1 class="text-center py-2">{{ createOrEdit }} Task</h1>

  <CommonTextField v-model="task.name" label="Quest Title" :required="true"/>
  <CommonDescriptionField v-model="task.description"/>

  <v-row>
    <v-col cols="6"><CommonSlider v-model="task.difficult" label="Difficulty" /></v-col>
    <v-col cols="6"><CommonSlider v-model="task.priority" label="Priority" /></v-col>
  </v-row>

  <v-row dense>
    <v-col cols="6"><CommonDatePickerField label="Deadline" v-model="localDeadline" :formatted="formattedDeadline" :minDate="getYesterday()" :required="true" /></v-col>
    <v-col cols="6"><CommonDatePickerField label="Notification" v-model="localNotification" :formatted="formattedNotification" placeholder="Selecione a data" :minDate="getYesterday()"/></v-col>
  </v-row>

  <v-row dense class="mt-n3 mb-n4">
    <v-col cols="6"><CommonSelect v-model="task.project" label="Project" :items="projectNames" :required="true" /></v-col>
    <v-col cols="6"><CommonSelect v-model="task.recurrency" label="Recurrency" :items="recurrencyOptions" :required="true" /></v-col>
  </v-row>

  <v-row dense class="mt-1 mb-1">
    <v-col cols="6">
      <CommonSelect
        v-model="microTaskTypeUi"
        label="Task Type"
        :items="microTaskTypeOptions"
      />
    </v-col>
  </v-row>

  <v-row dense v-if="task.microTaskType">
    <v-col cols="12">
      <div class="text-subtitle-2 mb-2">Checklist</div>
      <div
        v-for="(item, index) in checklistItems"
        :key="`checklist-item-${index}`"
        class="checklist-row"
      >
        <input
          v-model="item.completed"
          type="checkbox"
          class="checklist-native-checkbox"
        />
        <v-text-field
          v-model="item.item"
          placeholder="Item"
          variant="underlined"
          class="flex-1 checklist-item-input"
          density="comfortable"
          hide-details="auto"
        />
        <v-btn
          icon="mdi-delete"
          variant="text"
          color="error"
          :disabled="checklistItems.length <= 1"
          @click="removeChecklistItem(index)"
        />
      </div>
      <v-btn
        size="small"
        variant="text"
        prepend-icon="mdi-plus"
        @click="addChecklistItem"
      >
        Adicionar item
      </v-btn>
    </v-col>
  </v-row>

  <CommonEffortSelect v-model="task.pomodorosPlanned" />

  <!-- PERT Estimation Section -->
  <PERTEstimationCard
    v-if="props.task._id || task.microTaskType"
    :task-id="props.task._id"
    v-model:optimistic-minutes="task.pertOptimisticMinutes"
    v-model:most-likely-minutes="task.pertMostLikelyMinutes"
    v-model:pessimistic-minutes="task.pertPessimisticMinutes"
    :initial-optimistic="props.task.pertOptimisticMinutes || 0"
    :initial-most-likely="props.task.pertMostLikelyMinutes || 0"
    :initial-pessimistic="props.task.pertPessimisticMinutes || 0"
  />
</template>

<script setup>
import CommonTextField from '../../../shared/fields/TextField.vue'
import CommonDescriptionField from '../../../shared/fields/DescriptionField.vue'
import CommonSlider from '../../../shared/fields/Slider.vue'
import CommonDatePickerField from '../../../shared/fields/DatePickerField.vue'
import CommonSelect from '../../../shared/fields/Select.vue'
import CommonEffortSelect from '../../../shared/fields/EffortSelect.vue'
import PERTEstimationCard from '../widgets/PERTEstimationCard.vue'

const props = defineProps({
  task: {
    type: Object,
    required: true
  },
  projects: {
    type: Array,
    default: () => []
  },
  deadline: [String, Date],
  notification: [String, Date],
  createOrEdit: {
    type: String,
    default: 'Create'
  },
  isValid: Boolean,
})

const emit = defineEmits(['update:is-valid'])
// Derived list of project names for the select
const projectNames = computed(() => (props.projects || []).map(p => p.name).filter(Boolean))


const localDeadline = ref(props.task.deadline)
const localNotification = ref(props.task.notification)

// Sincronização de entrada (props → local)
watch(() => props.deadline, (val) => { localDeadline.value = val })
watch(() => props.notification, (val) => { localNotification.value = val })

// Formatadores
const formattedDeadline = computed(() => {
  return localDeadline.value ? formatDateToDDMMYYYY(localDeadline.value) : ''
})
const formattedNotification = computed(() => {
  return localNotification.value ? formatDateToDDMMYYYY(localNotification.value) : ''
})

function getYesterday() {
  const date = new Date()
  date.setDate(date.getDate() - 1) // Subtrai um dia
  return date
}

function formatDateToDDMMYYYY(date) {
  if (!date) return ''
  const d = new Date(date)
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()
  return `${day}/${month}/${year}`
}

const recurrencyOptions = [
  'Daily',
  'Weekly',
  'Monthly',
  'Yearly',
  'Doesn\'t Repeat',
]

const microTaskTypeOptions = ['None', 'subtask', 'habit', 'quick', 'complex']
const microTaskTypeUi = ref(props.task.microTaskType || 'None')
const checklistItems = ref([{ item: '', completed: false, order: 0 }])
let syncingChecklistFromTask = false

function checklistToUiItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return [{ item: '', completed: false, order: 0 }]
  }

  const normalized = items
    .map((entry, index) => {
      if (typeof entry === 'string') {
        return { item: entry, completed: false, order: index }
      }
      if (entry && typeof entry === 'object') {
        return {
          item: String(entry.item || ''),
          completed: Boolean(entry.completed),
          order: Number.isFinite(entry.order) ? Number(entry.order) : index,
        }
      }
      return null
    })
    .filter(Boolean)

  return normalized.length > 0
    ? normalized
    : [{ item: '', completed: false, order: 0 }]
}

function checklistToTaskItems(items) {
  if (!Array.isArray(items)) return []
  return items
    .map((entry, index) => ({
      item: String(entry.item || '').trim(),
      completed: Boolean(entry.completed),
      order: index,
    }))
    .filter((entry) => entry.item.length > 0)
}

function addChecklistItem() {
  checklistItems.value.push({
    item: '',
    completed: false,
    order: checklistItems.value.length,
  })
}

function removeChecklistItem(index) {
  if (checklistItems.value.length <= 1) return
  checklistItems.value.splice(index, 1)
  checklistItems.value = checklistItems.value.map((entry, idx) => ({
    ...entry,
    order: idx,
  }))
}

watch(
  () => props.task.checklist,
  (value) => {
    syncingChecklistFromTask = true
    checklistItems.value = checklistToUiItems(value)
    syncingChecklistFromTask = false
  },
  { immediate: true, deep: true },
)

watch(
  checklistItems,
  (value) => {
    if (syncingChecklistFromTask) return
    const normalized = checklistToTaskItems(value)
    props.task.checklist = normalized.length > 0 ? normalized : undefined
    props.task.autoGenerateChecklist = normalized.length === 0
  },
  { deep: true },
)

watch(microTaskTypeUi, (value) => {
  props.task.microTaskType = value === 'None' ? undefined : value
  if (!props.task.microTaskType) {
    props.task.checklist = undefined
    checklistItems.value = [{ item: '', completed: false, order: 0 }]
    props.task.autoGenerateChecklist = true
    return
  }
  if (!Array.isArray(props.task.checklist) || props.task.checklist.length === 0) {
    checklistItems.value = [{ item: '', completed: false, order: 0 }]
  }
})

watch(localDeadline, (val) => {
  if (val && val instanceof Date && !isNaN(val)) {
    props.task.deadline = val.toISOString();
  } else {
    props.task.deadline = null
  }
})

watch(localNotification, (val) => {
  if (val && val instanceof Date && !isNaN(val)) {
    props.task.notification = val.toISOString();
  } else {
    props.task.notification = null
  }
})

function normalizeTaskProject() {
  const names = projectNames.value || []
  if (!props.task) return
  const p = props.task.project
  if (!p) {
    props.task.project = null
    return
  }

  if (typeof p === 'object' && p !== null) {
    if (p.name) {
      props.task.project = p.name
      return
    }
    const foundById = (props.projects || []).find(pr => pr._id === p._id)
    props.task.project = foundById ? foundById.name || null : null
    return
  }

  if (typeof p === 'string') {
    if (names.includes(p)) return
    // or it may be an id that we can map to a name
    const found = (props.projects || []).find(pr => pr._id === p)
    if (found) {
      props.task.project = found.name || null
      return
    }
    // otherwise clear invalid value
    props.task.project = null
  }
}

normalizeTaskProject()
watch(projectNames, () => normalizeTaskProject(), { immediate: true })
watch(() => props.task.project, () => normalizeTaskProject())

const isValidDate = (dateStr) => {
  const date = new Date(dateStr)
  return !isNaN(date.getTime())
}

const isPertValidForMicroTask = computed(() => {
  if (!props.task.microTaskType) return true

  const optimistic = Number(props.task.pertOptimisticMinutes)
  const mostLikely = Number(props.task.pertMostLikelyMinutes)
  const pessimistic = Number(props.task.pertPessimisticMinutes)

  const hasAny = [optimistic, mostLikely, pessimistic].some(v => Number.isFinite(v) && v > 0)
  if (!hasAny) return true

  if (![optimistic, mostLikely, pessimistic].every(v => Number.isFinite(v) && v > 0)) {
    return false
  }

  return optimistic < mostLikely && mostLikely < pessimistic
})


const isFormValid = computed(() => {
  return (
    props.task.name?.trim() !== '' &&
    props.task.recurrency?.trim() !== '' &&
    isValidDate(localDeadline.value) &&
    props.task.pomodorosPlanned > 0 &&
    isPertValidForMicroTask.value
  )
})

watch(
  () => [
    props.task.name,
    props.task.recurrency,
    props.task.pomodorosPlanned,
    localDeadline.value,
    props.task.pertOptimisticMinutes,
    props.task.pertMostLikelyMinutes,
    props.task.pertPessimisticMinutes,
    props.task.microTaskType,
  ],
  () => {
    const valid = isFormValid.value
    emit('update:is-valid', valid)
  },
  { immediate: true }
)

</script>

<style scoped>
.checklist-row {
  width: 100%;
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr) 32px;
  column-gap: 4px;
  align-items: center;
  direction: ltr;
}

.checklist-item-input {
  min-width: 0;
  margin-top: -12px;
}

.checklist-native-checkbox {
  -webkit-appearance: none;
  appearance: none;
  width: 14px;
  height: 14px;
  margin: 0;
  cursor: pointer;
  background: transparent;
  border: 1.5px solid #8f6f4f;
  border-radius: 2px;
  display: inline-grid;
  place-content: center;
}

.checklist-native-checkbox::before {
  content: '';
  width: 8px;
  height: 8px;
  transform: scale(0);
  transition: transform 0.12s ease-in-out;
  clip-path: polygon(14% 44%, 0 65%, 50% 100%, 100% 16%, 80% 0%, 43% 62%);
  background: #5f1a35;
}

.checklist-native-checkbox:checked {
  background: transparent;
}

.checklist-native-checkbox:checked::before {
  transform: scale(1);
}

:deep(.checklist-item-input .v-field) {
  background: transparent !important;
  box-shadow: none !important;
}

:deep(.checklist-item-input .v-field__input) {
  padding-left: 0;
}

:deep(.checklist-item-input .v-field__outline),
:deep(.checklist-item-input .v-field__overlay) {
  display: none;
}
</style>

