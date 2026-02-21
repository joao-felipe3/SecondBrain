<template>
  <v-dialog :model-value="modelValue" max-width="600" persistent @update:model-value="emit('update:modelValue', $event)">
    <div v-if="task" class="micro-task-paper-dialog">
      <v-img src="/svg/old-paper-4.svg" alt="Old Paper" width="500" height="700" style="z-index: 3;" />

      <div class="paper-dialog-content micro-task-content">
        <div class="close-button-wrapper">
          <v-btn icon="mdi-close" variant="text" size="small" class="close-btn" @click="emit('update:modelValue', false)" />
        </div>

        <h1 class="paper-title mt-10 ml-4">{{ task.name }}</h1>

        <!-- Básico -->
        <div class="form-section">
          <div v-if="task.description" class="field-display">
            <strong>Descrição:</strong>
            <p>{{ task.description }}</p>
          </div>
          <div v-if="task.definitionOfDone" class="field-display">
            <strong>📝 Definição de Pronto:</strong>
            <span style="font-weight: normal;">{{ task.definitionOfDone }}</span>
          </div>
        </div>

        <!-- Checklist -->
        <div v-if="task.checklist && task.checklist.length > 0" class="form-section">
          <h5 class="section-title">☑️ Checklist</h5>
          <div class="checklist-display">
            <div v-for="(item, idx) in task.checklist" :key="idx" class="checklist-item">
              <v-icon icon="mdi-checkbox-blank-outline" size="small" />
              <span>{{ item }}</span>
            </div>
          </div>
        </div>

        <!-- Atributos -->
        <div class="form-section">
          <h5 class="section-title">🎯 Atributos</h5>
          <div class="dialog-grid">
            <div class="field-display" style="display:flex;align-items:center;gap:.25rem;">
              <strong>- Prioridade:</strong><span style="font-weight:normal;">{{ task.priority || 'N/A' }}</span>
            </div>
            <div class="field-display" style="display:flex;align-items:center;gap:.25rem;">
              <strong>- Dificuldade:</strong><span style="font-weight:normal;">{{ task.difficult || 'N/A' }}</span>
            </div>
          </div>
          <div v-if="task.experience" class="field-display mt-2">
            <strong>- Experiência: {{ task.experience }} XP</strong>
          </div>
          <div v-if="task.prize" class="field-display">
            <strong>- Prêmio: {{ task.prize }} pontos</strong>
          </div>
          <div class="dialog-grid">
            <div class="field-display" style="display:flex;align-items:center;gap:.25rem;">
              <strong>- Tipo de Task:</strong><span style="font-weight:normal;">{{ task.microTaskType || 'N/A' }}</span>
            </div>
            <div class="field-display" style="display:flex;align-items:center;gap:.25rem;">
              <strong>- Modo Cognitivo:</strong><span style="font-weight:normal;">{{ task.cognitiveMode || 'N/A' }}</span>
            </div>
          </div>
          <div class="field-display mt-n2" style="display:flex;align-items:center;flex-wrap:wrap;gap:.5rem;">
            <strong>- Tags:</strong>
            <v-chip v-if="task.contextTag" size="small" variant="outlined">{{ task.contextTag }}</v-chip>
            <v-chip
              v-for="(tag, idx) in (Array.isArray(task.themeTag) ? task.themeTag : [])"
              :key="idx"
              size="small"
              variant="outlined"
            >{{ tag }}</v-chip>
          </div>
          <div class="dialog-grid">
            <div class="field-display" style="display:flex;align-items:center;gap:.25rem;">
              <strong>- Pomodoros:</strong><span style="font-weight:normal;">{{ task.pomodorosPlanned || 1 }}</span>
            </div>
            <div class="field-display" style="display:flex;align-items:center;gap:.25rem;">
              <strong>- Deadline:</strong><span style="font-weight:normal;">{{ formatDate(task.deadline) }}</span>
            </div>
          </div>

          <div v-if="task.pertExpectedMinutes" class="pert-display">
            <strong>PERT Estimativas:</strong>
            <div class="pert-values">
              <span>Otimista: {{ task.pertOptimisticMinutes }}min</span>
              <span>Provável: {{ task.pertMostLikelyMinutes }}min</span>
              <span>Pessimista: {{ task.pertPessimisticMinutes }}min</span>
              <span>Esperado: {{ task.pertExpectedMinutes }}min</span>
              <span>Variância: {{ task.pertVariance?.toFixed(2) }}</span>
            </div>
          </div>
        </div>

        <!-- WBS Path -->
        <div v-if="task.wbsPath" class="form-section">
          <h5 class="section-title">📂 WBS Path</h5>
          <p class="wbs-path">{{ task.wbsPath }}</p>
        </div>
      </div>
    </div>
  </v-dialog>
</template>

<script setup lang="ts">
import type { PropType } from 'vue'
import { useConversionHelpers } from '~/composables/features/useConversionHelpers'

defineProps({
  modelValue: { type: Boolean, required: true },
  task:        { type: Object as PropType<any | null>, default: null },
})

const emit = defineEmits<{
  'update:modelValue': [val: boolean]
}>()

const { formatDate } = useConversionHelpers()
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Irish+Grover&family=MedievalSharp&display=swap');

.micro-task-paper-dialog {
  position: relative;
  width: 500px;
  height: 700px;
  margin: -4rem auto;
}

.paper-dialog-content {
  font-size: 0.9rem;
  line-height: 1.5;
}

.micro-task-content {
  position: absolute;
  top: 1rem;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 4;
  padding: 0 3.5rem;
  overflow-y: auto;
  overflow-x: hidden;
  color: #3e2723;
  font-family: 'MedievalSharp', 'Irish Grover', cursive;
}

.micro-task-content::-webkit-scrollbar { width: 8px; }
.micro-task-content::-webkit-scrollbar-track { background: rgba(201, 166, 107, 0.2); border-radius: 4px; }
.micro-task-content::-webkit-scrollbar-thumb { background: rgba(139, 90, 43, 0.5); border-radius: 4px; }
.micro-task-content::-webkit-scrollbar-thumb:hover { background: rgba(139, 90, 43, 0.7); }

.paper-title {
  font-family: 'Irish Grover', cursive;
  font-size: 1.5rem;
  font-weight: 400;
  color: #3e2723;
  margin: 0 0 1rem 0;
  text-align: center;
  text-shadow: 1px 1px 0 rgba(255, 255, 255, 0.3);
  word-wrap: break-word;
}

.form-section { margin-bottom: 0.75rem; }
.form-section:last-child { margin-bottom: 0; }

.section-title {
  font-family: 'MedievalSharp', cursive;
  font-size: 0.95rem;
  font-weight: 600;
  color: #5d4037;
  margin: 0 0 0.25rem 0;
  padding-bottom: 0.4rem;
  border-bottom: 2px dashed #c9a66b;
}

.field-display { margin-bottom: 0.5rem; font-size: 0.85rem; }
.field-display strong { color: #3e2723; display: block; margin-bottom: 0.2rem; }
.field-display p { margin: 0.3rem 0 0 0; color: #5d4037; }

.dialog-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.5rem; margin-bottom: 0.5rem; }

.checklist-display { display: flex; flex-direction: column; gap: 0.3rem; }
.checklist-item { display: flex; align-items: flex-start; gap: 0.5rem; font-size: 0.85rem; color: #5d4037; }

.pert-display {
  background: rgba(201, 166, 107, 0.1);
  padding: 0.5rem;
  border-radius: 3px;
  border-left: 3px solid #c9a66b;
  margin: 0.5rem 0;
  font-size: 0.8rem;
}
.pert-display strong { display: block; margin-bottom: 0.3rem; color: #3e2723; }
.pert-values { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.3rem; color: #5d4037; }
.pert-values span { font-size: 0.75rem; }

.wbs-path {
  background: rgba(201, 166, 107, 0.1);
  padding: 0.35rem;
  border-radius: 3px;
  border-left: 3px solid #c9a66b;
  margin: 0.5rem 0;
  font-size: 0.725rem;
  color: #5d4037;
  word-break: break-word;
}

.close-button-wrapper { position: absolute; top: 1rem; right: 1rem; z-index: 10; }
.close-btn { background: rgba(255, 255, 255, 0.8) !important; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2); }
</style>
