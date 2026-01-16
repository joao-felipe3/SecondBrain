<template>
  <div>
    <v-text-field
      v-model="inputValue"
      :label="computedLabel"
      :error="error"
      :error-messages="errorMessage"
      variant="solo-filled"
      class="custom-input"
      density="comfortable"
      @input="onInputChange"
      @blur="onInputBlur"
      placeholder="DD/MM/YYYY"
      :readonly="false"
    >
      <template #append-inner>
        <Calendar
          class="cursor-pointer"
          @click="menu = true"
          :size="20"
        />
      </template>
    </v-text-field>

    <v-menu
      v-model="menu"
      :close-on-content-click="false"
      transition="scale-transition"
      offset-y
    >
      <v-date-picker
        v-model="localValue"
        @update:model-value="onPickerUpdate"
        hide-actions
      />
    </v-menu>
  </div>
</template>

<script setup>
import { Calendar } from 'lucide-vue-next'
import { ref, watch, computed } from 'vue'

const props = defineProps({
  modelValue: [String, Date],
  label: String,
  minDate: Date,
  required: { type: Boolean, default: false }
})

const emit = defineEmits(['update:modelValue'])

const localValue = ref(props.modelValue)
const menu = ref(false)
const inputValue = ref(formatDate(props.modelValue))
const error = ref(false)
const errorMessage = ref('')

watch(() => props.modelValue, (val) => {
  localValue.value = val
  inputValue.value = formatDate(val)
}, { immediate: true })

watch(localValue, (val) => {
  emit('update:modelValue', val)
  inputValue.value = formatDate(val)
})

function onPickerUpdate(val) {
  localValue.value = val
  menu.value = false
}

function onInputChange(e) {
  let clean = e.target.value.replace(/[^0-9/]/g, '')

  if (clean.length === 2 || clean.length === 5) {
    if (clean.slice(-1) !== '/') {
      clean += '/'
    }
  }
  if (clean.length > 10) clean = clean.slice(0, 10)

  inputValue.value = clean
}

function onInputBlur() {
  const date = parseDate(inputValue.value)
  if (!date) {
    setError('Invalid date format')
    return
  }

  if (props.minDate && date < props.minDate) {
    setError(`Date cannot be before ${formatDate(props.minDate)}`)
    return
  }

  clearError()
  localValue.value = date
}

function setError(msg) {
  error.value = true
  errorMessage.value = msg
}

function clearError() {
  error.value = false
  errorMessage.value = ''
}

function formatDate(val) {
  if (!val) return ''
  const date = new Date(val)
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()
  return `${day}/${month}/${year}`
}

function parseDate(str) {
  const regex = /^(\d{2})\/(\d{2})\/(\d{4})$/
  const match = str.match(regex)
  if (!match) return null

  const day = parseInt(match[1], 10)
  const month = parseInt(match[2], 10) - 1
  const year = parseInt(match[3], 10)

  const date = new Date(year, month, day)
  if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) {
    return null
  }
  return date
}
const computedLabel = computed(() => {
  return props.required ? `${props.label} *` : props.label
})
</script>
