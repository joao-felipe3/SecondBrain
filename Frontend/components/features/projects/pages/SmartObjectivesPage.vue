<template>
  <v-sheet class="page-container" :class="{ editing }" elevation="0" color="transparent">
    <!-- LEFT PAGE -->
    <v-sheet class="page left-page" elevation="0" color="transparent">
      <div v-if="!project?.smartObjective" class="ai-planning-prompt">
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

      <div v-if="project?.smartObjective">
        <div class="d-flex align-center justify-space-between mb-3">
          <h3>📌 Resumo Executivo</h3>
          <v-btn
            v-if="!editing"
            size="small"
            style="font-size: 0.55rem;"
            variant="outlined"
            prepend-icon="mdi-robot"
            @click="openPlannerDialog"
          >
            Replanejar
          </v-btn>
        </div>

        <template v-if="editing">
          <v-textarea
            v-model="local.smartObjective.summary"
            label="Resumo Executivo"
            variant="outlined"
            rows="6"
            auto-grow
            @update:model-value="emitSmartField('summary', $event)"
          />
        </template>
        <v-card v-else elevation="2">
          <v-card-text>
            <p class="smart-content">{{ project.smartObjective.summary }}</p>
          </v-card-text>
        </v-card>
      </div>
    </v-sheet>

    <!-- RIGHT PAGE -->
    <v-sheet class="page right-page" elevation="0" color="transparent">
      <div v-if="project?.smartObjective">
        <h3 class="mb-2">🎯 Detalhes SMART</h3>
        
        <template v-if="editing">
          <v-textarea
            v-model="local.smartObjective.specific"
            label="🎯 Específico"
            variant="outlined"
            rows="2"
            auto-grow
            class="mb-2"
            @update:model-value="emitSmartField('specific', $event)"
          />
          
          <v-textarea
            v-model="local.smartObjective.measurable"
            label="📊 Mensurável"
            variant="outlined"
            rows="2"
            auto-grow
            class="mb-2"
            @update:model-value="emitSmartField('measurable', $event)"
          />
          
          <v-textarea
            v-model="local.smartObjective.achievable"
            label="✅ Atingível"
            variant="outlined"
            rows="2"
            auto-grow
            class="mb-2"
            @update:model-value="emitSmartField('achievable', $event)"
          />
          
          <v-textarea
            v-model="local.smartObjective.relevant"
            label="💡 Relevante"
            variant="outlined"
            rows="2"
            auto-grow
            class="mb-2"
            @update:model-value="emitSmartField('relevant', $event)"
          />
          
          <v-textarea
            v-model="local.smartObjective.temporal"
            label="⏰ Temporal"
            variant="outlined"
            rows="2"
            auto-grow
            class="mb-2"
            @update:model-value="emitSmartField('temporal', $event)"
          />
          
          <v-textarea
            v-if="local.smartObjective.risks"
            :model-value="local.smartObjective.risks.join('\n')"
            label="⚠️ Riscos (um por linha)"
            variant="outlined"
            rows="3"
            auto-grow
            @update:model-value="updateRisks"
          />
        </template>
        
        <template v-else>
          <SmartDetailCard
            title="🎯 Específico"
            :content="project.smartObjective.specific"
            color="blue-lighten-5"
          />

          <SmartDetailCard
            title="📊 Mensurável"
            :content="project.smartObjective.measurable"
            color="green-lighten-5"
          />

          <SmartDetailCard
            title="✅ Atingível"
            :content="project.smartObjective.achievable"
            color="orange-lighten-5"
          />

          <SmartDetailCard
            title="💡 Relevante"
            :content="project.smartObjective.relevant"
            color="purple-lighten-5"
          />

          <SmartDetailCard
            title="⏰ Temporal"
            :content="project.smartObjective.temporal"
            color="red-lighten-5"
          />

          <SmartDetailCard
            v-if="project.smartObjective.risks?.length"
            title="⚠️ Riscos Identificados"
            :risks="project.smartObjective.risks"
            color="warning-lighten-5"
          />
        </template>
      </div>
    </v-sheet>

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
  </v-sheet>
</template>

<script setup lang="ts">
import { ref, reactive, watch } from 'vue'
import type { PropType } from 'vue'
import ProjectPlannerDialog from '../dialogs/ProjectPlannerDialog.vue'
import SmartDetailCard from '../sections/SmartDetailCard.vue'

interface SmartObjective {
  specific: string
  measurable: string
  achievable: string
  relevant: string
  temporal: string
  summary: string
  risks: string[]
}

type Project = Record<string, any>

const props = defineProps({
  project: { type: Object as PropType<Project | null>, default: null },
  editing: { type: Boolean, default: false }
})

const emit = defineEmits(['smart-objective-updated', 'update-field'])

const showPlannerDialog = ref(false)

const local = reactive<any>({
  smartObjective: {
    specific: '',
    measurable: '',
    achievable: '',
    relevant: '',
    temporal: '',
    summary: '',
    risks: []
  }
})

// Sync fields when project changes
watch(() => props.project, (val) => {
  if (val?.smartObjective) {
    local.smartObjective = {
      specific: val.smartObjective.specific || '',
      measurable: val.smartObjective.measurable || '',
      achievable: val.smartObjective.achievable || '',
      relevant: val.smartObjective.relevant || '',
      temporal: val.smartObjective.temporal || '',
      summary: val.smartObjective.summary || '',
      risks: val.smartObjective.risks || []
    }
  }
}, { immediate: true, deep: true })

function emitSmartField(field: string, value: any) {
  local.smartObjective[field] = value
  emit('update-field', 'smartObjective', local.smartObjective)
}

function updateRisks(value: string) {
  const risks = value.split('\n').filter(r => r.trim())
  local.smartObjective.risks = risks
  emit('update-field', 'smartObjective', local.smartObjective)
}

function openPlannerDialog() {
  showPlannerDialog.value = true
}

function handleObjectiveGenerated(objective: SmartObjective) {
  emit('smart-objective-updated')
}

function handleSmartObjectiveUpdated() {
  emit('smart-objective-updated')
}
</script>

<style scoped>
.page-container {
  display: flex;
  gap: 1rem;
  padding: 0.5rem;
  height: 100%;
}

.page {
  flex: 1;
  padding: 1rem;
  background: rgba(255, 255, 255, 0.9);
  border-radius: 8px;
  overflow-y: auto;
}

.left-page {
  border-right: 1px solid #e2e8f0;
}

.right-page {
  border-left: 1px solid #e2e8f0;
}

.page-container.editing .page {
  background: rgba(255, 255, 255, 0.95);
}

.ai-planning-prompt {
  text-align: center;
  padding: 2rem;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.smart-content {
  margin: 0;
  color: #475569;
  font-size: 0.95rem;
  line-height: 1.6;
  word-wrap: break-word;
  overflow-wrap: break-word;
}
</style>
