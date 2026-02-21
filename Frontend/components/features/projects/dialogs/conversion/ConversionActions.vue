<template>
  <v-card-actions class="justify-space-between pa-4">
    <v-btn
      variant="text"
      color="error"
      prepend-icon="mdi-close"
      :disabled="processing"
      @click="emit('cancel')"
    >
      Cancelar Tudo
    </v-btn>

    <div class="d-flex gap-2">
      <v-btn
        v-if="currentGeneratedResult && !isLastLeaf"
        variant="outlined"
        color="warning"
        prepend-icon="mdi-refresh"
        :disabled="processing"
        @click="emit('regenerate')"
      >
        Regenerar
      </v-btn>

      <v-btn
        v-if="currentGeneratedResult && !isLastLeaf"
        variant="outlined"
        color="secondary"
        prepend-icon="mdi-lightning-bolt"
        :disabled="processing"
        @click="emit('open-model-selection')"
      >
        Modelo Forte
      </v-btn>

      <v-btn
        v-if="currentGeneratedResult && differencePercentage > 20 && !isLastLeaf"
        variant="flat"
        color="info"
        prepend-icon="mdi-scale-balance"
        :disabled="processing"
        @click="emit('open-resolution')"
      >
        Resolver discrepância
      </v-btn>

      <v-btn
        v-if="currentGeneratedResult && !isLastLeaf"
        variant="tonal"
        color="primary"
        prepend-icon="mdi-check"
        :loading="processing"
        @click="emit('approve-and-continue')"
      >
        Aprovar e Continuar
      </v-btn>

      <v-btn
        v-if="isLastLeaf && currentGeneratedResult"
        variant="flat"
        color="success"
        prepend-icon="mdi-content-save"
        :loading="processing"
        @click="emit('save-all')"
      >
        Salvar Todas ({{ approvedTasksCount }} tasks)
      </v-btn>
    </div>
  </v-card-actions>
</template>

<script setup lang="ts">
defineProps({
  currentGeneratedResult: { type: Object, default: null },
  isLastLeaf:             { type: Boolean, required: true },
  processing:             { type: Boolean, required: true },
  differencePercentage:   { type: Number, required: true },
  approvedTasksCount:     { type: Number, required: true },
})

const emit = defineEmits<{
  'cancel': []
  'regenerate': []
  'open-model-selection': []
  'open-resolution': []
  'approve-and-continue': []
  'save-all': []
}>()
</script>
