<template>
  <v-dialog v-model="isOpen" :max-width="isMobile ? '90vw' : '500'">
    <v-card>
      <v-card-title class="text-h5">
        Excluir Projeto
      </v-card-title>

      <v-card-text>
        <p class="mb-4">
          Você está prestes a excluir o projeto <strong>{{ projectName }}</strong>.
        </p>
        <p class="mb-2">O que deseja fazer com as {{ taskCount }} task(s) associada(s)?</p>

        <v-radio-group v-model="deleteOption">
          <v-radio
            label="Excluir o projeto e todas as tasks associadas"
            value="delete-tasks"
            color="error"
          />
          <v-radio
            label="Excluir apenas o projeto (manter as tasks sem projeto)"
            value="unlink-tasks"
            color="warning"
          />
        </v-radio-group>
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn text @click="cancel">Cancelar</v-btn>
        <v-btn
          :color="deleteOption === 'delete-tasks' ? 'error' : 'warning'"
          @click="confirm"
        >
          Confirmar
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'

const MOBILE_BREAKPOINT = 768
const isMobile = ref(false)

function checkMobile() {
  isMobile.value = window.innerWidth < MOBILE_BREAKPOINT
}

onMounted(() => {
  checkMobile()
  window.addEventListener('resize', checkMobile)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', checkMobile)
})

const props = defineProps<{
  modelValue: boolean
  projectName: string
  taskCount: number
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'confirm': [deleteTasks: boolean]
}>()

const isOpen = ref(props.modelValue)
const deleteOption = ref<'delete-tasks' | 'unlink-tasks'>('unlink-tasks')

watch(() => props.modelValue, (newVal) => {
  isOpen.value = newVal
  if (newVal) {
    // Reset to default when dialog opens
    deleteOption.value = 'unlink-tasks'
  }
})

watch(isOpen, (newVal) => {
  emit('update:modelValue', newVal)
})

const cancel = () => {
  isOpen.value = false
}

const confirm = () => {
  const deleteTasks = deleteOption.value === 'delete-tasks'
  emit('confirm', deleteTasks)
  isOpen.value = false
}
</script>
