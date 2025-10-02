<template>
  <div class="page-container">
    <div class="page left-page">
      <div v-if="project">
        <h4>🎯 Objetivo de Longo Prazo</h4>
        <template v-if="editing">
          <textarea v-model="local.longTermGoal" class="textarea" rows="5" placeholder="Objetivo longo prazo" @input="emitField('longTermGoal', local.longTermGoal)" />
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
            <input type="number" min="0" v-model.number="local.reward" class="input" @input="emitField('reward', local.reward)" />
          </label>
          <label class="mini">
            XP
            <input type="number" min="0" v-model.number="local.experience" class="input" @input="emitField('experience', local.experience)" />
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
watch(() => props.project, (v) => { if (v) Object.assign(local, v) }, { immediate: true })
watch(() => props.editing, (is) => { if (is && props.project) Object.assign(local, props.project) })

function emitField(field: string, value: any) { emit('update-field', field, value) }
</script>

<style scoped>
.textarea, .input { width:100%; background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.2); color:#fff; padding:.4rem .5rem; border-radius:4px; font:inherit; }
.editing .textarea, .editing .input { background:#fff; color:#222; border:1px solid #c9b28a; box-shadow:0 0 0 2px rgba(140,90,40,0.12); }
.editing .textarea:focus, .editing .input:focus { outline:2px solid #b7791f; outline-offset:2px; }
.edit-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(120px,1fr)); gap:.5rem; margin-top:.75rem; }
label.mini { display:flex; flex-direction:column; font-size:.75rem; gap:.25rem; }
</style>
