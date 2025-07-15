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

  <v-row dense>
    <v-col cols="6"><CommonTextField v-model="task.project" label="Project" /></v-col>
    <v-col cols="6"><CommonSelect v-model="task.recurrency" label="Recurrency" :items="recurrencyOptions" :required="true" /></v-col>
  </v-row>

  <CommonEffortSelect v-model="task.pomodorosPlanned" />
</template>

<script setup>

const props = defineProps({
  task: {
    type: Object,
    required: true
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
  () => [props.task.name, props.task.recurrency, props.task.pomodorosPlanned, localDeadline.value],
  () => {
    const valid = isFormValid.value
    emit('update:is-valid', valid)
  },
  { immediate: true }
)


</script>

