<template>
  <v-sheet class="page-container" :class="{ editing }" elevation="0" color="transparent">
    <v-sheet class="page left-page" elevation="0" color="transparent">
      <div v-if="project">
        <h4>🎯 Objetivo de Curto Prazo</h4>
        <template v-if="editing">
          <v-textarea 
            v-model="local.shortTermGoal" 
            label="Objetivo curto prazo" 
            variant="solo-filled" 
            density="comfortable" 
            auto-grow 
            rows="3" 
            @update:model-value="emitField('shortTermGoal', $event)" 
          />
        </template>
        <p v-else class="goal-content">{{ project.shortTermGoal }}</p>
        <div v-if="project">
          <h4>🎯 Objetivo de Médio Prazo</h4>
          <template v-if="editing">
            <v-textarea 
              v-model="local.midTermGoal" 
              label="Objetivo médio prazo" 
              variant="solo-filled" 
              density="comfortable" 
              auto-grow 
              rows="3" 
              @update:model-value="emitField('midTermGoal', $event)" 
            />
          </template>
          <p v-else class="goal-content">{{ project.midTermGoal }}</p>
        </div>
        <div v-if="project">
          <h4>🎯 Objetivo de Longo Prazo</h4>
          <template v-if="editing">
            <v-textarea 
              v-model="local.longTermGoal" 
              label="Objetivo longo prazo" 
              variant="solo-filled" 
              density="comfortable" 
              auto-grow 
              rows="3" 
              @update:model-value="emitField('longTermGoal', $event)" 
            />
          </template>
          <p v-else class="goal-content">{{ project.longTermGoal }}</p>
        </div>
      </div>
    </v-sheet>
    <v-sheet class="page right-page" elevation="0" color="transparent">
    </v-sheet>
  </v-sheet>
</template>

<script setup lang="ts">
import useDateFormat from '~/composables/useDateFormat'
import type { PropType } from 'vue'
import { reactive, watch } from 'vue'

const { formatDate } = useDateFormat()

type Project = Record<string, any>

const props = defineProps({
  project: { type: Object as PropType<Project | null>, default: null },
  editing: { type: Boolean, default: false }
})

const emit = defineEmits(['update-field'])

const local = reactive<any>({})

// Sincroniza apenas os campos específicos desta página
watch(() => props.project, (v) => { 
  if (v) {
    local.shortTermGoal = v.shortTermGoal
    local.midTermGoal = v.midTermGoal
    local.longTermGoal = v.longTermGoal
  }
}, { immediate: true })

watch(() => props.editing, (is) => { 
  if (is && props.project) {
    local.shortTermGoal = props.project.shortTermGoal
    local.midTermGoal = props.project.midTermGoal
    local.longTermGoal = props.project.longTermGoal
  }
}, { immediate: true })

function emitField(field: string, value: any) { 
  local[field] = value // Atualiza o valor local
  emit('update-field', field, value) 
}
</script>

