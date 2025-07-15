<template>
  <v-textarea 
    :label="label"
    v-model="localValue"
    variant="solo-filled"
    class="custom-input"
    density="comfortable"
    rows="3"
    auto-grow
  />
</template>

<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  modelValue: String,
  label: {
    type: String,
    default: 'Quest description'
  }
})

const emit = defineEmits(['update:modelValue'])

const localValue = ref(props.modelValue)

watch(() => props.modelValue, (val) => {
  localValue.value = val
})

watch(localValue, (val) => {
  emit('update:modelValue', val)
})
</script>
