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

  <CommonEffortSelect class="mt-n4" v-model="task.pomodorosPlanned" />
</template>

<script setup>
import CommonTextField from '../../../shared/fields/TextField.vue'
import CommonDescriptionField from '../../../shared/fields/DescriptionField.vue'
import CommonSlider from '../../../shared/fields/Slider.vue'
import CommonDatePickerField from '../../../shared/fields/DatePickerField.vue'
import CommonSelect from '../../../shared/fields/Select.vue'
import CommonEffortSelect from '../../../shared/fields/EffortSelect.vue'

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

watch(microTaskTypeUi, (value) => {
  props.task.microTaskType = value === 'None' ? undefined : value
  if (!props.task.microTaskType) {
    props.task.checklist = undefined
    props.task.autoGenerateChecklist = true
    return
  }
  const hasChecklist = Array.isArray(props.task.checklist) && props.task.checklist.length > 0
  props.task.autoGenerateChecklist = !hasChecklist
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

const isFormValid = computed(() => {
  return (
    props.task.name?.trim() !== '' &&
    props.task.recurrency?.trim() !== '' &&
    isValidDate(localDeadline.value) &&
    props.task.pomodorosPlanned > 0
  )
})

watch(
  () => [
    props.task.name,
    props.task.recurrency,
    props.task.pomodorosPlanned,
    localDeadline.value,
    props.task.microTaskType,
  ],
  () => {
    const valid = isFormValid.value
    emit('update:is-valid', valid)
  },
  { immediate: true }
)

</script>

