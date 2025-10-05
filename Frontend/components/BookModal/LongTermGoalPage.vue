<template>
  <div class="page-container" :class="{ editing }">
    <div class="page left-page">
      <div v-if="project">
        <h4>🎯 Objetivo de Longo Prazo</h4>
        <template v-if="editing">
          <v-textarea v-model="local.longTermGoal" label="Objetivo longo prazo" variant="solo-filled" density="comfortable" auto-grow rows="4" @update:model-value="emitField('longTermGoal', $event)" />
        </template>
        <p v-else class="goal-content">{{ project.longTermGoal }}</p>
        <div class="vision-section">
          <h5>🔮 Visão do Futuro</h5>
          <p>Imagine o impacto que este projeto terá em sua vida e carreira quando concluído.</p>
        </div>
      </div>
    </div>
    <div class="page right-page">
      <div v-if="project">
        <h5>🏆 Recompensas Finais</h5>
        <div class="final-rewards">
          <div class="reward-item">
            <Coins :size="20" />
            <span>{{ editing ? local.reward : project.reward }} pontos totais</span>
          </div>
            <div class="reward-item">
              <Award :size="20" />
              <span>{{ editing ? local.experience : project.experience }} EXP total</span>
            </div>
        </div>
        <div v-if="editing" class="edit-grid">
          <label class="mini">
            Recompensa
            <v-text-field v-model.number="local.reward" type="number" label="Recompensa" variant="solo-filled" density="comfortable" hide-details @update:model-value="emitField('reward', $event)" />
          </label>
          <label class="mini">
            XP
            <v-text-field v-model.number="local.experience" type="number" label="XP" variant="solo-filled" density="comfortable" hide-details @update:model-value="emitField('experience', $event)" />
          </label>
        </div>
        <div class="celebration-box">
          <h6>🎉 Celebração</h6>
          <p>Não esqueça de celebrar suas conquistas!</p>
        </div>
        <div class="next-steps">
          <h6>➡️ Próximos Passos</h6>
          <p>Use a experiência adquirida para projetos ainda mais ambiciosos.</p>
        </div>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
import { Coins, Award } from 'lucide-vue-next'
import type { PropType } from 'vue'
import { reactive, watch } from 'vue'

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
    local.longTermGoal = v.longTermGoal
    local.reward = v.reward
    local.experience = v.experience
  }
}, { immediate: true })

watch(() => props.editing, (is) => { 
  if (is && props.project) {
    local.longTermGoal = props.project.longTermGoal
    local.reward = props.project.reward
    local.experience = props.project.experience
  }
}, { immediate: true })

function emitField(field: string, value: any) { 
  local[field] = value // Atualiza o valor local
  emit('update-field', field, value) 
}
</script>

<style scoped>
/* CSS removido - deixando BookModal.css gerenciar os estilos globalmente */
</style>
