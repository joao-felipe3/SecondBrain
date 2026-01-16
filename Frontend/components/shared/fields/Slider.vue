<!-- components/TaskSlider.vue -->
<template>
  <div>
    <div class="text-subtitle-1 ml-2" :style="titleStyle">{{ label }}</div>
    <v-slider
      v-model="localValue"
      :min="1"
      :max="4"
      :step="1"
      class="custom-slider"
      color="black"
    />
    <div class="d-flex justify-space-between px-2 mt-n6">
      <span v-for="i in 4" :key="`${label}-tick-${i}`">Lv.{{ i }}</span>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  modelValue: Number,
  label: String,
  titleStyle: {
    type: Object,
    default: () => ({
      fontFamily: "'Irish Grover', cursive",
      marginBottom: '-5%',
    })
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
