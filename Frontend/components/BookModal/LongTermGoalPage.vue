<template>
  <div class="page-container">
    <div class="page left-page">
      <div v-if="project">
        <h4>🎯 Objetivo de Longo Prazo</h4>
        <p class="goal-content">{{ project.longTermGoal }}</p>
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
            <span>{{ project.reward }} pontos totais</span>
          </div>
          <div class="reward-item">
            <Award :size="20" />
            <span>{{ project.experience }} EXP total</span>
          </div>
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

type Project = Record<string, any>

const props = defineProps({
  project: { type: Object as PropType<Project | null>, default: null }
})
</script>
