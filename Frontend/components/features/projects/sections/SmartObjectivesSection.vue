<template>
  <div class="smart-objectives-section">
    <div v-if="project">
      <!-- Botão para Planejamento com IA -->
      <div v-if="!project.smartObjective" class="ai-planning-prompt">
        <div class="text-center mb-4">
          <v-icon size="64" color="primary">mdi-robot-outline</v-icon>
          <h3 class="mt-2 mb-2">Planejamento Inteligente com IA</h3>
          <p class="text-body-2 text-medium-emphasis">
            Use a IA para criar objetivos SMART estruturados através de um diálogo estratégico
          </p>
        </div>
        
        <v-btn
          color="primary"
          size="large"
          prepend-icon="mdi-robot"
          block
          @click="openPlannerDialog"
        >
          Iniciar Planejamento com IA
        </v-btn>
      </div>

      <!-- Objetivo SMART (se existe) -->
      <div v-if="project.smartObjective" class="smart-objective-display">
        <div class="d-flex align-center justify-space-between mb-4">
          <h3>🎯 Objetivo SMART</h3>
          <v-btn
            size="small"
            variant="outlined"
            prepend-icon="mdi-robot"
            @click="openPlannerDialog"
          >
            Replanejar
          </v-btn>
        </div>

        <v-card class="mb-4" elevation="2">
          <v-card-text>
            <div class="smart-label">📌 Resumo Executivo</div>
            <p class="smart-content">{{ project.smartObjective.summary }}</p>
          </v-card-text>
        </v-card>

        <v-expansion-panels>
          <v-expansion-panel>
            <v-expansion-panel-title>
              <v-icon start>mdi-information-outline</v-icon>
              Ver Detalhes Completos SMART
            </v-expansion-panel-title>
            <v-expansion-panel-text>
              <v-card class="mb-3" elevation="0" color="blue-lighten-5">
                <v-card-text>
                  <div class="smart-label">🎯 Específico (Specific)</div>
                  <p class="smart-content">{{ project.smartObjective.specific }}</p>
                </v-card-text>
              </v-card>

              <v-card class="mb-3" elevation="0" color="green-lighten-5">
                <v-card-text>
                  <div class="smart-label">📊 Mensurável (Measurable)</div>
                  <p class="smart-content">{{ project.smartObjective.measurable }}</p>
                </v-card-text>
              </v-card>

              <v-card class="mb-3" elevation="0" color="orange-lighten-5">
                <v-card-text>
                  <div class="smart-label">✅ Atingível (Achievable)</div>
                  <p class="smart-content">{{ project.smartObjective.achievable }}</p>
                </v-card-text>
              </v-card>

              <v-card class="mb-3" elevation="0" color="purple-lighten-5">
                <v-card-text>
                  <div class="smart-label">💡 Relevante (Relevant)</div>
                  <p class="smart-content">{{ project.smartObjective.relevant }}</p>
                </v-card-text>
              </v-card>

              <v-card class="mb-3" elevation="0" color="red-lighten-5">
                <v-card-text>
                  <div class="smart-label">⏰ Temporal (Time-bound)</div>
                  <p class="smart-content">{{ project.smartObjective.temporal }}</p>
                </v-card-text>
              </v-card>

              <v-card v-if="project.smartObjective.risks?.length" elevation="0" color="warning-lighten-5">
                <v-card-text>
                  <div class="smart-label">⚠️ Riscos Identificados</div>
                  <ul class="risks-list">
                    <li v-for="(risk, index) in project.smartObjective.risks" :key="index">
                      {{ risk }}
                    </li>
                  </ul>
                </v-card-text>
              </v-card>
            </v-expansion-panel-text>
          </v-expansion-panel>
        </v-expansion-panels>
      </div>
    </div>

    <!-- Dialog de Planejamento -->
    <ProjectPlannerDialog
      v-model="showPlannerDialog"
      :project-id="project?._id"
      :project-name="project?.name || ''"
      :project-description="project?.description || ''"
      :short-term-goal="project?.shortTermGoal"
      :mid-term-goal="project?.midTermGoal"
      :long-term-goal="project?.longTermGoal"
      @objective-generated="handleObjectiveGenerated"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import ProjectPlannerDialog from '../dialogs/ProjectPlannerDialog.vue'

interface SmartObjective {
  specific: string
  measurable: string
  achievable: string
  relevant: string
  temporal: string
  summary: string
  risks: string[]
}

defineProps<{
  project: Record<string, any> | null
}>()

const emit = defineEmits<{
  (e: 'smart-objective-updated'): void
}>()

const showPlannerDialog = ref(false)

function openPlannerDialog() {
  showPlannerDialog.value = true
}

function handleObjectiveGenerated(objective: SmartObjective) {
  emit('smart-objective-updated')
}
</script>

<style scoped>
.smart-objectives-section {
  width: 100%;
  padding: 1rem;
}

.ai-planning-prompt {
  text-align: center;
  padding: 2rem;
}

.smart-objective-display {
  width: 100%;
}

.smart-label {
  font-weight: 600;
  font-size: 1rem;
  color: #1e293b;
  margin-bottom: 0.75rem;
}

.smart-content {
  margin: 0;
  color: #475569;
  font-size: 0.95rem;
  line-height: 1.6;
  word-wrap: break-word;
  overflow-wrap: break-word;
}

.risks-list {
  margin: 0;
  padding-left: 1.5rem;
  color: #475569;
  font-size: 0.95rem;
}

.risks-list li {
  margin-bottom: 0.75rem;
  line-height: 1.5;
}
</style>
