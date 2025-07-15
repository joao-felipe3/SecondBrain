<template>
  <div class="custom-input">
    <v-text-field
      :label="computedLabel"
      v-model="localValue"
      variant="solo-filled"
      density="comfortable"
      :rules="validationRules"
    />
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  modelValue: String,
  label: String,
  required: { type: Boolean, default: false }
})

const emit = defineEmits(['update:modelValue'])

const localValue = ref(props.modelValue)

watch(() => props.modelValue, (val) => {
  localValue.value = val
})

watch(localValue, (val) => {
  emit('update:modelValue', val)
})

const validationRules = computed(() => {
  const rules = []
  if (props.required) {
    rules.push(v => !!v || 'Esse campo é obrigatório')
  }
  return rules
})
const computedLabel = computed(() => {
  return props.required ? `${props.label} *` : props.label
})

</script>
