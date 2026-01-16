<template>
  <div class="d-flex justify-start align-center mt-1">
    <div class="effort-label">Planned Effort *:</div>
    <div class="d-flex gap-2 ml-2">
      <img
        v-for="index in 6"
        :key="index"
        @click="$emit('update:modelValue', index)"
        class="pomodoro-star"
        :class="{ inactive: index > modelValue }"
        :src="index <= modelValue ? 'svg/star-full.svg' : 'svg/star.svg'"
        alt="Pomodoro Star"
      />
    </div>
  </div>
</template>

<script setup>
defineProps(['modelValue'])
</script>

<style scoped>
.pomodoro-star {
  width: 32px;
  height: 32px;
  cursor: pointer;
  transition: transform 0.2s, opacity 0.2s;
}

.pomodoro-star:hover {
  transform: scale(1.15);
}

.pomodoro-star.inactive {
  opacity: 0.3;
}

.effort-label {
  font-family: 'Irish Grover', cursive;
  font-size: large;
  margin-left: 2%;
  margin-top: 1%;
}
</style>
