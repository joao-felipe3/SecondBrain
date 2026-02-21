<template>
  <v-dialog :model-value="modelValue" max-width="500" @update:model-value="emit('update:modelValue', $event)">
    <v-card>
      <v-card-title class="d-flex align-center justify-space-between">
        <span>⚡ Regenerar com Modelo Forte</span>
        <v-btn icon="mdi-close" size="small" variant="text" @click="emit('update:modelValue', false)" />
      </v-card-title>

      <v-divider />

      <v-card-text>
        <p class="text-caption text-medium-emphasis mb-4">
          Selecione um modelo mais forte para regenerar as micro-tarefas com melhor qualidade e precisão.
        </p>

        <v-radio-group v-model="selectedModel" density="compact">
          <v-radio value="gemini-2.5-flash" label="Gemini 2.5 Flash (⚡ Recomendado)" />
          <div class="text-caption text-medium-emphasis ml-7 mb-3">
            Modelo balanceado com boa qualidade e velocidade.
          </div>

          <v-radio value="gemini-3-flash-preview" label="Gemini 3 Flash Preview (🚀 Mais Avançado)" />
          <div class="text-caption text-medium-emphasis ml-7 mb-3">
            Novo modelo experimental com melhor compreensão.
          </div>

          <v-radio value="gemini-2.5-flash-lite" label="Gemini 2.5 Flash Lite (⚡ Rápido)" />
          <div class="text-caption text-medium-emphasis ml-7">
            Versão leve, mais rápida mas com menos capacidade.
          </div>
        </v-radio-group>
      </v-card-text>

      <v-divider />

      <v-card-actions class="justify-end pa-4">
        <v-btn variant="text" :disabled="processing" @click="emit('update:modelValue', false)">
          Cancelar
        </v-btn>
        <v-btn color="primary" variant="flat" :loading="processing" @click="confirm">
          Regenerar
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue'

defineProps({
  modelValue: { type: Boolean, required: true },
  processing:  { type: Boolean, default: false },
})

const emit = defineEmits<{
  'update:modelValue': [val: boolean]
  'regenerate': [model: string]
}>()

const selectedModel = ref('gemini-2.5-flash')

function confirm() {
  emit('regenerate', selectedModel.value)
}
</script>
