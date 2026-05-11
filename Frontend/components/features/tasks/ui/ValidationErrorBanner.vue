<template>
  <v-alert
    v-if="errors.length > 0"
    type="warning"
    variant="tonal"
    class="validation-banner"
  >
    <div class="validation-title">Resolve before completing</div>
    <ul class="validation-list">
      <li v-for="(error, idx) in errors" :key="idx">{{ error }}</li>
    </ul>
  </v-alert>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useApi } from '~/composables/api/useApi'

interface Props {
  taskId?: string
}

const props = defineProps<Props>()
const errors = ref<string[]>([])

async function loadErrors() {
  if (!props.taskId) {
    errors.value = []
    return
  }

  const { get } = useApi(`/tasks/${props.taskId}/validation-errors`)
  const { data, error } = await get()
  if (!error && data?.errors) {
    errors.value = data.errors
  }
}

onMounted(loadErrors)
watch(() => props.taskId, loadErrors)
</script>

<style scoped>
.validation-banner {
  margin-bottom: 12px;
}

.validation-title {
  font-weight: 600;
  margin-bottom: 6px;
}

.validation-list {
  margin: 0;
  padding-left: 16px;
}
</style>
