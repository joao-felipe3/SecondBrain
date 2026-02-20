<template>
  <v-dialog v-model="isOpen" max-width="900" persistent scrollable style="height: 95vh;">
    <v-card>
      <v-card-title class="d-flex align-center justify-space-between">
        <span>🔄 Geração Interativa de Micro-Tarefas</span>
        <v-btn icon="mdi-close" size="small" variant="text" @click="handleCancel" />
      </v-card-title>

      <v-divider />

      <!-- Progress Overview (Fixed Header) -->
      <v-card-text class="progress-header pa-4 pb-3">
        <div class="d-flex align-center justify-space-between mb-3">
          <div>
            <div class="text-subtitle-2">Progresso: {{ currentIndex }} / {{ totalLeafs }}</div>
            <div class="text-caption text-medium-emphasis">
              {{ accumulatedHours.toFixed(1) }}h geradas de {{ totalBudgetHours.toFixed(1) }}h
            </div>
          </div>
          <v-chip :color="statusColor" size="small" variant="tonal">
            {{ statusText }}
          </v-chip>
        </div>

        <v-progress-linear
          :model-value="progressPercentage"
          :color="statusColor"
          height="8"
          rounded
        />
      </v-card-text>

      <v-divider />

      <!-- Main Content Area (Scrollable) -->
      <div class="main-content-wrapper">
        <!-- WBS Tree Visualization -->
        <v-expand-transition>
          <div v-if="currentLeaf" class="px-4">
            <WBSTreeVisualization 
              :leaf-nodes="leafNodes" 
              :current-index="currentIndex"
              @leaf-clicked="openLeafDetailDialog"
              @task-clicked="openMicroTaskDialog"
            />
          </div>
        </v-expand-transition>

        <v-divider class="my-4" />

        <!-- Two Column Layout: Leaf Nodes List + Current Leaf Details -->
        <div class="content-grid px-4 pb-4">
          <!-- Left: Leaf Nodes List (Collapsible) -->
          <div class="leaf-list-column">
            <div class="list-header">
              <h4 class="text-subtitle-2">📦 Pacotes</h4>
              <v-btn
                :icon="listExpanded ? 'mdi-chevron-down' : 'mdi-chevron-right'"
                size="x-small"
                variant="text"
                @click="listExpanded = !listExpanded"
              />
            </div>
            
            <v-expand-transition>
              <v-list v-show="listExpanded" density="compact" class="leaf-nodes-list">
                <v-list-item
                  v-for="(leaf, idx) in leafNodes"
                  :key="idx"
                  :class="{
                    'bg-primary-lighten-5': idx === currentIndex,
                    'bg-success-lighten-5': idx < currentIndex,
                  }"
                >
                  <template #prepend>
                    <v-icon
                      :icon="
                        idx < currentIndex
                          ? 'mdi-check-circle'
                          : idx === currentIndex
                          ? 'mdi-loading mdi-spin'
                          : 'mdi-circle-outline'
                      "
                      :color="
                        idx < currentIndex
                          ? 'success'
                          : idx === currentIndex
                          ? 'primary'
                          : 'grey-lighten-1'
                      "
                      size="small"
                    />
                  </template>
                  <v-list-item-title class="text-caption">{{ leaf.path }}</v-list-item-title>
                  <v-list-item-subtitle class="text-caption">
                    {{ leaf.node.estimatedHours }}h → 
                    {{ leaf.generatedTasks ? leaf.generatedTasks.length : '?' }} tasks
                    {{ leaf.generatedHours ? `(${leaf.generatedHours.toFixed(1)}h)` : '' }}
                  </v-list-item-subtitle>
                </v-list-item>
              </v-list>
            </v-expand-transition>
          </div>

          <!-- Right: Current Leaf Details + Generated Tasks Preview -->
          <div class="leaf-details-column">
            <div v-if="currentLeaf && currentGeneratedResult">
              <div class="leaf-header">
                <div>
                  <h3 class="text-subtitle-1 mb-1">{{ currentLeaf.node.name }}</h3>
                  <p class="text-caption text-medium-emphasis">{{ currentLeaf.path }}</p>
                </div>
              </div>

              <v-alert 
                :type="budgetAlertType" 
                density="compact" 
                variant="tonal" 
                class="my-3"
                :prominent="differencePercentage > 50"
              >
                <div class="text-caption">
                  <strong>Orçamento:</strong> {{ currentLeaf.node.estimatedHours }}h &nbsp;
                  <strong>Gerado:</strong> {{ currentGeneratedResult.generatedHours.toFixed(1) }}h 
                  ({{ currentGeneratedResult.pomodorosGenerated }} 🍅)
                  <br>
                  <strong>Diferença:</strong>
                  <span :class="differenceClass">
                    {{ ((currentGeneratedResult.generatedHours - currentLeaf.node.estimatedHours) >= 0 ? '+' : '') }}
                    {{ (currentGeneratedResult.generatedHours - currentLeaf.node.estimatedHours).toFixed(1) }}h
                    ({{ differencePercentage.toFixed(0) }}%)
                  </span>
                  <div v-if="differencePercentage > 20" class="mt-2 font-weight-bold">
                    ⚠️ Discrepância detectada
                  </div>
                </div>
              </v-alert>

              <!-- Generated Tasks Preview -->
              <h4 class="text-subtitle-2 mt-4 mb-2">✅ Micro-tarefas Geradas ({{ currentGeneratedResult.tasks?.length || 0 }})</h4>
              <div class="tasks-preview-container">
                <div v-if="!currentGeneratedResult.tasks || currentGeneratedResult.tasks.length === 0" class="text-caption text-medium-emphasis pa-3">
                  Nenhuma tarefa gerada
                </div>
                <v-slide-y-transition group>
                  <div
                    v-for="(task, idx) in currentGeneratedResult.tasks"
                    :key="`task-${idx}`"
                    class="task-item"
                    @click="openMicroTaskDialog(task)"
                  >
                    <div class="task-header">
                      <div class="task-title">
                        <v-icon 
                          :icon="`mdi-${getTaskTypeIcon(task.microTaskType)}`"
                          size="small"
                          class="mr-2"
                        />
                        <span class="font-weight-medium">{{ task.name }}</span>
                      </div>
                      <v-chip 
                        size="x-small"
                        :color="getPriorityColor(task.priority)"
                        variant="tonal"
                      >
                        {{ task.pomodorosPlanned || 1 }} 🍅
                      </v-chip>
                    </div>
                    <div v-if="task.themeTag || task.contextTag" class="task-tags">
                      <v-chip v-if="task.themeTag" size="x-small" variant="outlined" class="mr-1">
                        {{ task.themeTag }}
                      </v-chip>
                      <v-chip v-if="task.contextTag" size="x-small" variant="outlined">
                        {{ task.contextTag }}
                      </v-chip>
                    </div>
                  </div>
                </v-slide-y-transition>
              </div>
            </div>
          </div>
        </div>
      </div>

      <v-divider />

      <!-- Actions -->
      <v-card-actions class="justify-space-between pa-4">
        <v-btn
          variant="text"
          color="error"
          prepend-icon="mdi-close"
          @click="handleCancel"
          :disabled="processing"
        >
          Cancelar Tudo
        </v-btn>

        <div class="d-flex gap-2">
          <v-btn
            v-if="currentGeneratedResult && !isLastLeaf"
            variant="outlined"
            color="warning"
            prepend-icon="mdi-refresh"
            @click="handleRegenerate"
            :disabled="processing"
          >
            Regenerar
          </v-btn>

          <v-btn
            v-if="currentGeneratedResult && !isLastLeaf"
            variant="outlined"
            color="secondary"
            prepend-icon="mdi-lightning-bolt"
            @click="openModelSelectionDialog"
            :disabled="processing"
          >
            Modelo Forte
          </v-btn>

          <v-btn
            v-if="currentGeneratedResult && differencePercentage > 20 && !isLastLeaf"
            variant="flat"
            color="info"
            prepend-icon="mdi-scale-balance"
            @click="openResolutionDialog"
            :disabled="processing"
          >
            Resolver discrepância
          </v-btn>
          
          <v-btn
            v-if="currentGeneratedResult && !isLastLeaf"
            variant="tonal"
            color="primary"
            prepend-icon="mdi-check"
            @click="handleApproveAndContinue"
            :loading="processing"
          >
            Aprovar e Continuar
          </v-btn>

          <v-btn
            v-if="isLastLeaf && currentGeneratedResult"
            variant="flat"
            color="success"
            prepend-icon="mdi-content-save"
            @click="handleSaveAll"
            :loading="processing"
          >
            Salvar Todas ({{ approvedTasks.length }} tasks)
          </v-btn>
        </div>
      </v-card-actions>
      <!-- Model Selection Dialog -->
      <v-dialog v-model="modelSelectionDialogOpen" max-width="500">
        <v-card>
          <v-card-title class="d-flex align-center justify-space-between">
            <span>⚡ Regenerar com Modelo Forte</span>
            <v-btn icon="mdi-close" size="small" variant="text" @click="modelSelectionDialogOpen = false" />
          </v-card-title>

          <v-divider />

          <v-card-text>
            <p class="text-caption text-medium-emphasis mb-4">
              Selecione um modelo mais forte para regenerar as micro-tarefas com melhor qualidade e precisão.
            </p>

            <v-radio-group v-model="selectedModel" density="compact">
              <v-radio
                value="gemini-2.5-flash"
                label="Gemini 2.5 Flash (⚡ Recomendado)"
              />
              <div class="text-caption text-medium-emphasis ml-7 mb-3">
                Modelo balanceado com boa qualidade e velocidade.
              </div>

              <v-radio
                value="gemini-3-flash-preview"
                label="Gemini 3 Flash Preview (🚀 Mais Avançado)"
              />
              <div class="text-caption text-medium-emphasis ml-7 mb-3">
                Novo modelo experimental com melhor compreensão.
              </div>

              <v-radio
                value="gemini-2.5-flash-lite"
                label="Gemini 2.5 Flash Lite (⚡ Rápido)"
              />
              <div class="text-caption text-medium-emphasis ml-7">
                Versão leve, mais rápida mas com menos capacidade.
              </div>
            </v-radio-group>
          </v-card-text>

          <v-divider />

          <v-card-actions class="justify-end pa-4">
            <v-btn variant="text" @click="modelSelectionDialogOpen = false" :disabled="processing">
              Cancelar
            </v-btn>

            <v-btn
              color="primary"
              variant="flat"
              :loading="processing"
              @click="regenerateWithModel"
            >
              Regenerar
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>
      <!-- Resolution Dialog (re-baseline / audit / simplify) -->
      <v-dialog v-model="resolutionDialogOpen" max-width="760">
        <v-card>
          <v-card-title class="d-flex align-center justify-space-between">
            <span>⚖️ Resolver discrepância</span>
            <v-btn icon="mdi-close" size="small" variant="text" @click="resolutionDialogOpen = false" />
          </v-card-title>

          <v-divider />

          <v-card-text>
            <div v-if="currentGeneratedResult && currentLeaf" class="text-caption">
              <div><strong>Pacote:</strong> {{ currentLeaf.node.name }}</div>
              <div><strong>Orçado (WBS):</strong> {{ currentLeaf.node.estimatedHours }}h</div>
              <div><strong>Detalhado (micro-tarefas):</strong> {{ currentGeneratedResult.generatedHours.toFixed(1) }}h ({{ currentGeneratedResult.pomodorosGenerated }} 🍅)</div>
              <div><strong>Diferença:</strong> {{ differencePercentage.toFixed(0) }}%</div>
            </div>

            <v-divider class="my-3" />

            <v-radio-group v-model="resolutionMode" density="compact">
              <v-radio
                value="rebaseline"
                label="Atualizar estimativa do pacote (re-baseline)"
              />
              <div class="text-caption text-medium-emphasis ml-7 mb-2">
                Recomendado quando o detalhamento revelou complexidade real (bottom-up vence).
              </div>

              <v-radio
                value="audit"
                label="Auditar com IA (gold plating vs subestimado)"
              />
              <div class="text-caption text-medium-emphasis ml-7 mb-2">
                Pede à IA para justificar a discrepância e sugerir ação.
              </div>

              <v-radio
                value="simplify"
                label="Simplificar escopo para caber na estimativa atual"
              />
              <div class="text-caption text-medium-emphasis ml-7">
                Corta/reduz tarefas de menor prioridade até caber (mudança explícita de escopo).
              </div>
            </v-radio-group>

            <v-alert
              v-if="auditResult"
              type="info"
              variant="tonal"
              density="compact"
              class="mt-3"
            >
              <div class="text-caption">
                <strong>Diagnóstico:</strong> {{ auditResult.diagnosis }}<br>
                <strong>Justificativa:</strong> {{ auditResult.rationale }}<br>
                <strong>Sugestão:</strong> {{ auditResult.suggestedAction }}
                <span v-if="auditResult.suggestedEstimatedHours"> — {{ auditResult.suggestedEstimatedHours }}h</span>
              </div>
            </v-alert>
          </v-card-text>

          <v-divider />

          <v-card-actions class="justify-end pa-4">
            <v-btn variant="text" @click="resolutionDialogOpen = false" :disabled="resolutionProcessing">
              Cancelar
            </v-btn>

            <v-btn
              v-if="resolutionMode === 'audit'"
              color="primary"
              variant="tonal"
              :loading="resolutionProcessing"
              @click="runAudit"
            >
              Rodar auditoria
            </v-btn>

            <v-btn
              v-if="resolutionMode === 'audit' && auditResult"
              color="info"
              variant="flat"
              :loading="resolutionProcessing"
              @click="applyAuditSuggestion"
            >
              Aplicar sugestão da auditoria
            </v-btn>

            <v-btn
              color="success"
              variant="flat"
              :loading="resolutionProcessing"
              @click="applyResolution"
            >
              Aplicar
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>

      <!-- Micro Task Preview Dialog -->
      <v-dialog v-model="microTaskDialogOpen" max-width="600" persistent>
        <div class="micro-task-paper-dialog" v-if="selectedMicroTask">
          <!-- Imagem de fundo do papel -->
          <v-img 
            src="/svg/old-paper-4.svg" 
            alt="Old Paper" 
            width="500"
            height="700"
            style="z-index: 3;" 
          />
          
          <!-- Conteúdo sobre o papel -->
          <div class="paper-dialog-content micro-task-content">
            <div class="close-button-wrapper">
              <v-btn 
                icon="mdi-close" 
                variant="text" 
                size="small" 
                @click="microTaskDialogOpen = false"
                class="close-btn"
              />
            </div>

            <h1 class="paper-title mt-10 ml-4">{{ selectedMicroTask.name }}</h1>

            <!-- Seção Básica -->
            <div class="form-section">
              <div v-if="selectedMicroTask.description" class="field-display">
                <strong>Descrição:</strong>
                <p>{{ selectedMicroTask.description }}</p>
              </div>
              <div v-if="selectedMicroTask.definitionOfDone" class="field-display">
                <strong>📝 Definição de Pronto:</strong> <span style="font-weight: normal;">{{ selectedMicroTask.definitionOfDone }}</span>
              </div>
            </div>

            <!-- Seção Checklist -->
            <div v-if="selectedMicroTask.checklist && selectedMicroTask.checklist.length > 0" class="form-section">
              <h5 class="section-title">☑️ Checklist</h5>
              <div class="checklist-display">
                <div v-for="(item, idx) in selectedMicroTask.checklist" :key="idx" class="checklist-item">
                  <v-icon icon="mdi-checkbox-blank-outline" size="small" />
                  <span>{{ item }}</span>
                </div>
              </div>
            </div>

            <!-- Seção Planejamento -->
            <div class="form-section">
              <h5 class="section-title">🎯 Atributos</h5>
              <div class="dialog-grid">
                <div class="field-display" style="display: flex; align-items: center; gap: 0.25rem;">
                  <strong>- Prioridade:</strong><span style="font-weight: normal;">{{ selectedMicroTask.priority || 'N/A' }}</span>
                </div>
                <div class="field-display" style="display: flex; align-items: center; gap: 0.25rem;">
                  <strong>- Dificuldade:</strong><span style="font-weight: normal;">{{ selectedMicroTask.difficult || 'N/A' }}</span>
                </div>
              </div>
              <div v-if="selectedMicroTask.experience" class="field-display mt-2">
                <strong>- Experiência: {{ selectedMicroTask.experience }} XP</strong>
              </div>
              <div v-if="selectedMicroTask.prize" class="field-display">
                <strong>- Prêmio: {{ selectedMicroTask.prize }} pontos</strong>
              </div>
              <div class="dialog-grid">
                <div class="field-display" style="display: flex; align-items: center; gap: 0.25rem;">
                  <strong>- Tipo de Task:</strong><span style="font-weight: normal;">{{ selectedMicroTask.microTaskType || 'N/A' }}</span>
                </div>
                <div class="field-display" style="display: flex; align-items: center; gap: 0.25rem;">
                  <strong>- Modo Cognitivo:</strong> <span style="font-weight: normal;">{{ selectedMicroTask.cognitiveMode || 'N/A' }}</span>
                </div>

              </div>
              <div class="field-display mt-n2" style="display: flex; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
                <strong>- Tags:</strong>
                <v-chip v-if="selectedMicroTask.contextTag" size="small" variant="outlined">
                  {{ selectedMicroTask.contextTag }}
                </v-chip>
                <v-chip 
                  v-for="(tag, idx) in (Array.isArray(selectedMicroTask.themeTag) ? selectedMicroTask.themeTag : [])" 
                  :key="idx" 
                  size="small" 
                  variant="outlined"
                >
                  {{ tag }}
                </v-chip>
              </div>
              <div class="dialog-grid">
                <div class="field-display" style="display: flex; align-items: center; gap: 0.25rem;">
                  <strong>- Pomodoros:</strong><span style="font-weight: normal;">{{ selectedMicroTask.pomodorosPlanned || 1 }}</span>
                </div>
                <div class="field-display" style="display: flex; align-items: center; gap: 0.25rem;">
                  <strong>- Deadline:</strong><span style="font-weight: normal;">{{ formatDate(selectedMicroTask.deadline) }}</span>
                </div>
              </div>

              <div v-if="selectedMicroTask.pertExpectedMinutes" class="pert-display">
                <strong>PERT Estimativas:</strong>
                <div class="pert-values">
                  <span>Otimista: {{ selectedMicroTask.pertOptimisticMinutes }}min</span>
                  <span>Provável: {{ selectedMicroTask.pertMostLikelyMinutes }}min</span>
                  <span>Pessimista: {{ selectedMicroTask.pertPessimisticMinutes }}min</span>
                  <span>Esperado: {{ selectedMicroTask.pertExpectedMinutes }}min</span>
                  <span>Variância: {{ selectedMicroTask.pertVariance?.toFixed(2) }}</span>
                </div>
              </div>
            </div>

            <div v-if="selectedMicroTask.wbsPath" class="form-section">
              <h5 class="section-title">📂 WBS Path</h5>
              <p class="wbs-path">{{ selectedMicroTask.wbsPath }}</p>
            </div>
          </div>
        </div>
      </v-dialog>

      <!-- Leaf Node Detail Dialog -->
      <v-dialog v-model="leafDetailDialogOpen" max-width="650" persistent scrollable>
        <div class="leaf-paper-dialog" v-if="selectedLeafNode">
          <!-- Imagem de fundo do papel -->
          <v-img 
            src="/svg/old-paper-4.svg" 
            alt="Old Paper" 
            width="550"
            height="750"
            style="z-index: 3;" 
          />
          
          <!-- Conteúdo sobre o papel -->
          <div class="paper-dialog-content leaf-content">
            <div class="close-button-wrapper">
              <v-btn 
                icon="mdi-close" 
                variant="text" 
                size="small" 
                @click="leafDetailDialogOpen = false"
                class="close-btn"
              />
            </div>

            <h1 class="paper-title">{{ selectedLeafNode.node.name }}</h1>

            <!-- Seção Informações do Pacote -->
            <div class="form-section">
              <h5 class="section-title">📦 Informações do Pacote</h5>
              <div v-if="selectedLeafNode.node.description" class="field-display">
                <strong>Descrição:</strong>
                <p>{{ selectedLeafNode.node.description }}</p>
              </div>
              <div class="field-display">
                <strong>Nível de Profundidade:</strong>
                <span class="value">{{ selectedLeafNode.level }}</span>
              </div>
              <div class="field-display">
                <strong>Caminho WBS:</strong>
                <p class="wbs-path">{{ selectedLeafNode.path }}</p>
              </div>
            </div>

            <!-- Seção Orçamento -->
            <div class="form-section">
              <h5 class="section-title">💰 Orçamento</h5>
              <div class="budget-display">
                <div class="budget-item">
                  <span>Estimado (WBS):</span>
                  <span class="value">{{ selectedLeafNode.node.estimatedHours }}h</span>
                </div>
                <div class="budget-item">
                  <span>Gerado (Bottom-up):</span>
                  <span class="value">{{ selectedLeafNode.generatedHours?.toFixed(1) || 'N/A' }}h</span>
                </div>
                <div class="budget-item" v-if="selectedLeafNode.generatedHours">
                  <span>Pomodoros:</span>
                  <span class="value">{{ Math.round(selectedLeafNode.generatedHours * 2) }} 🍅</span>
                </div>
              </div>
              
              <div v-if="selectedLeafNode.generatedHours" class="budget-alert">
                <div class="budget-diff">
                  <strong>Diferença:</strong>
                  <span :class="getBudgetDiffClass(selectedLeafNode)">
                    {{ ((selectedLeafNode.generatedHours - selectedLeafNode.node.estimatedHours) >= 0 ? '+' : '') }}
                    {{ (selectedLeafNode.generatedHours - selectedLeafNode.node.estimatedHours).toFixed(1) }}h
                    ({{ getBudgetDiffPercentage(selectedLeafNode).toFixed(0) }}%)
                  </span>
                </div>
              </div>
            </div>

            <!-- Seção Tasks Geradas -->
            <div v-if="selectedLeafNode.generatedTasks && selectedLeafNode.generatedTasks.length > 0" class="form-section">
              <h5 class="section-title">✅ Micro-tarefas ({{ selectedLeafNode.generatedTasks.length }})</h5>
              <div class="tasks-summary">
                <div 
                  v-for="(task, idx) in selectedLeafNode.generatedTasks"
                  :key="idx"
                  class="task-summary-item"
                >
                  <div class="task-summary-name">
                    <v-icon size="small" class="mr-1">mdi-{{ getTaskTypeIcon(task.microTaskType) }}</v-icon>
                    <span>{{ task.name }}</span>
                  </div>
                  <div class="task-summary-info">
                    <v-chip size="x-small" :color="getPriorityColor(task.priority)" variant="tonal" class="mr-1">
                      P{{ task.priority }}
                    </v-chip>
                    <span class="text-caption">{{ task.pomodorosPlanned || 1 }} 🍅</span>
                  </div>
                </div>
              </div>
            </div>

            <div v-else class="form-section empty-state">
              <p class="text-caption text-medium-emphasis">Nenhuma tarefa gerada ainda</p>
            </div>
          </div>
        </div>
      </v-dialog>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { PropType } from 'vue'
import { useNuxtApp } from '#app'
import WBSTreeVisualization from '~/components/features/projects/visualization/WBSTreeVisualization.vue'


type WBSNode = {
  _id?: string
  name: string
  description?: string
  level: number
  estimatedHours: number
  children?: WBSNode[]
}

type LeafNode = {
  node: WBSNode
  path: string
  level: number
  generatedTasks?: any[]
  generatedHours?: number
}

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  project: { type: Object as PropType<any>, default: null },
  wbsNodes: { type: Array as PropType<WBSNode[]>, default: () => [] },
  preferences: { type: Object, default: () => ({}) },
})

const emit = defineEmits(['update:modelValue', 'complete', 'cancel'])

const isOpen = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
})

const leafNodes = ref<LeafNode[]>([])
const currentIndex = ref(0)
const currentGeneratedResult = ref<any>(null)
const processing = ref(false)
const approvedTasks = ref<any[]>([])
const accumulatedHours = ref(0)
const listExpanded = ref(true)

const resolutionDialogOpen = ref(false)
const resolutionMode = ref<'rebaseline' | 'audit' | 'simplify'>('rebaseline')
const resolutionProcessing = ref(false)
const auditResult = ref<any>(null)

const modelSelectionDialogOpen = ref(false)
const selectedModel = ref<string>('gemini-2.5-flash')

const microTaskDialogOpen = ref(false)
const selectedMicroTask = ref<any>(null)

const leafDetailDialogOpen = ref(false)
const selectedLeafNode = ref<any>(null)

// When discrepancy is very large, run audit automatically.
const autoAuditThresholdPct = 60

const wbsUpdates = ref<
  Array<{ nodeId?: string; path: string; oldEstimatedHours: number; newEstimatedHours: number; reason: string }>
>([])

const totalLeafs = computed(() => leafNodes.value.length)
const currentLeaf = computed(() => leafNodes.value[currentIndex.value])
const isLastLeaf = computed(() => currentIndex.value === totalLeafs.value - 1)
const progressPercentage = computed(() => 
  totalLeafs.value > 0 ? (currentIndex.value / totalLeafs.value) * 100 : 0
)

const totalBudgetHours = computed(() => 
  leafNodes.value.reduce((sum, leaf) => sum + (leaf.node.estimatedHours || 0), 0)
)

const statusColor = computed(() => {
  if (processing.value) return 'primary'
  if (currentIndex.value === totalLeafs.value) return 'success'
  return 'info'
})

const statusText = computed(() => {
  if (processing.value) return 'Gerando...'
  if (currentIndex.value === totalLeafs.value) return 'Concluído'
  if (currentIndex.value === 0) return 'Pronto para começar'
  return 'Em progresso'
})

const differencePercentage = computed(() => {
  if (!currentGeneratedResult.value || !currentLeaf.value) return 0
  const budget = currentLeaf.value.node.estimatedHours
  const generated = currentGeneratedResult.value.generatedHours
  return budget > 0 ? ((generated - budget) / budget) * 100 : 0
})

const differenceClass = computed(() => {
  const diff = differencePercentage.value
  if (diff > 50) return 'text-error font-weight-bold text-h6'
  if (diff > 20) return 'text-error font-weight-bold'
  if (diff > 10) return 'text-warning'
  if (diff < -10) return 'text-info'
  return 'text-success'
})

const budgetAlertType = computed(() => {
  const diff = differencePercentage.value
  if (diff > 50) return 'error'
  if (diff > 20) return 'warning'
  return 'info'
})

function getPriorityColor(priority: number) {
  const colors = { 1: 'error', 2: 'warning', 3: 'info', 4: 'success' }
  return colors[priority as keyof typeof colors] || 'grey'
}

function getTaskTypeIcon(type: string) {
  const icons: Record<string, string> = {
    'practice': 'dumbbell',
    'produce': 'pencil-box',
    'test': 'checkbox-marked-circle',
    'consolidate': 'book',
    'prepare': 'clipboard-list',
  }
  return icons[String(type || '').toLowerCase()] || 'checkbox-blank-circle-outline'
}

function summarizeTasks(tasks: any[]) {
  const pomodoros = tasks.reduce((sum, t) => sum + (t.pomodorosPlanned || 1), 0)
  return {
    pomodoros,
    hours: pomodoros * 0.5,
  }
}

function roundToHalfHour(hours: number) {
  return Math.max(0, Math.round(hours * 2) / 2)
}

function pruneByPriority(tasks: any[], targetPomodoros: number) {
  const working = [...tasks].map((t) => ({ ...t }))
  working.sort((a, b) => {
    const pa = Number(a.priority) || 4
    const pb = Number(b.priority) || 4
    if (pa !== pb) return pb - pa // menor prioridade primeiro
    return (Number(b.pomodorosPlanned) || 1) - (Number(a.pomodorosPlanned) || 1)
  })

  let total = summarizeTasks(working).pomodoros
  if (total <= targetPomodoros) {
    return { tasks: working, changed: false, reason: 'Dentro do orçamento' }
  }

  let idx = 0
  while (total > targetPomodoros && working.length > 0) {
    const task = working[idx % working.length]
    if ((task.pomodorosPlanned || 1) > 1) {
      task.pomodorosPlanned -= 1
      total -= 1
      idx++
      continue
    }

    if (working.length > 1) {
      total -= task.pomodorosPlanned || 1
      working.splice(idx % working.length, 1)
    } else {
      break
    }
  }

  return { tasks: working, changed: true, reason: 'Podado pelas menores prioridades' }
}

function normalizeTaskKey(name: string): string {
  const raw = String(name || '').trim().toLowerCase()
  const hasDuolingo = /\bduolingo\b/.test(raw)

  if (hasDuolingo) {
    // Canonicalize Duolingo-style tasks so we can dedupe obvious repetitions like:
    // - "Completar Lições 1-5 do Duolingo" appearing with different pomodoros/types
    // - variants like "Revisar e Praticar Lições 6-10 do Duolingo"
    const duolingoRange = raw.match(/li[cç][oõ]es\s*(\d+)\s*[-–]\s*(\d+)/i)
    if (duolingoRange) {
      return `duolingo:lessons:${duolingoRange[1]}-${duolingoRange[2]}`
    }

    const duolingoUnit = raw.match(/unidade\s*(\d+)/i)
    if (duolingoUnit) {
      return `duolingo:unit:${duolingoUnit[1]}`
    }

    const genericLessons = raw.match(/\b(\d+)\s*li[cç][oõ]es\b/i)
    if (genericLessons) {
      return `duolingo:lessons:count:${genericLessons[1]}`
    }
  }

  // Remove common suffixes like "(1/3)", "(2/10)", etc.
  const withoutCounters = raw.replace(/\(\s*\d+\s*\/\s*\d+\s*\)\s*$/g, '').trim()
  // Strip diacritics + punctuation, collapse whitespace
  const noMarks = withoutCounters.normalize('NFD').replace(/[\u0300-\u036f]/g, '')

  // Remove pure numbers to reduce near-duplicate variants like "Lições 1-5" vs "Lições 6-10"
  // ONLY for non-Duolingo keys (Duolingo already handled above).
  const noNumbers = noMarks.replace(/\b\d+\b/g, ' ')

  const cleaned = noNumbers.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
  return cleaned
}

function dedupeRepeatedTasks(tasks: any[]) {
  const kept: any[] = []
  const byKey = new Map<string, any>()
  let removed = 0

  for (const t of tasks || []) {
    const key = normalizeTaskKey(String(t?.name || ''))
    if (!key) {
      kept.push(t)
      continue
    }

    const existing = byKey.get(key)
    if (!existing) {
      const clone = { ...t }
      byKey.set(key, clone)
      kept.push(clone)
      continue
    }

    // Merge duplicates: keep the one with higher importance (lower priority number),
    // and keep the max pomodoros to avoid accidentally shrinking scope.
    removed += 1
    const pExisting = Number(existing?.priority ?? 4)
    const pIncoming = Number(t?.priority ?? 4)
    if (pIncoming < pExisting) {
      existing.priority = pIncoming
    }
    const pomExisting = Number(existing?.pomodorosPlanned ?? 1)
    const pomIncoming = Number(t?.pomodorosPlanned ?? 1)
    existing.pomodorosPlanned = Math.max(1, Math.min(6, Math.max(pomExisting, pomIncoming)))

    // Prefer more "actionable" microTaskType when duplicates collapse.
    const rankType = (type: any): number => {
      const v = String(type || '').trim().toLowerCase()
      // Higher rank wins
      if (v === 'practice') return 5
      if (v === 'produce') return 4
      if (v === 'test') return 3
      if (v === 'consolidate') return 2
      if (v === 'prepare') return 1
      return 0
    }
    const existingRank = rankType(existing?.microTaskType)
    const incomingRank = rankType(t?.microTaskType)
    if (incomingRank > existingRank) {
      existing.microTaskType = t?.microTaskType
    }
  }

  return { tasks: kept, removed }
}

async function openResolutionDialog() {
  // Regra de tolerância: <= 20% sugerir re-baseline
  resolutionMode.value = differencePercentage.value > 20 ? 'audit' : 'rebaseline'
  resolutionDialogOpen.value = true

  // Auto-audit for large discrepancies (no need for user to click).
  if (!auditResult.value && differencePercentage.value >= autoAuditThresholdPct) {
    await runAudit()
  }
}

async function runAudit() {
  if (!currentGeneratedResult.value || !currentLeaf.value) return
  resolutionProcessing.value = true
  auditResult.value = null
  try {
    const { $api } = useNuxtApp() as any
    const response = await $api.post(`/projects/${props.project._id}/wbs/audit-leaf-discrepancy`, {
      leafNode: currentLeaf.value.node,
      nodePath: currentLeaf.value.path,
      generatedHours: currentGeneratedResult.value.generatedHours,
      tasks: (currentGeneratedResult.value.tasks || []).map((t: any) => ({
        name: t.name,
        pomodorosPlanned: t.pomodorosPlanned,
        priority: t.priority,
        microTaskType: t.microTaskType,
        themeTag: t.themeTag,
        contextTag: t.contextTag,
        cognitiveMode: t.cognitiveMode,
      })),
    })

    auditResult.value = response.data
  } catch (error: any) {
    console.error('Erro ao auditar discrepância:', error)
    alert(`Erro ao auditar: ${error?.response?.data?.message || error.message}`)
  } finally {
    resolutionProcessing.value = false
  }
}

function applyRebaseline(newHours: number, reason: string) {
  if (!currentLeaf.value || !currentGeneratedResult.value) return
  const oldHours = Number(currentLeaf.value.node.estimatedHours || 0)
  const rounded = roundToHalfHour(newHours)
  currentLeaf.value.node.estimatedHours = rounded
  leafNodes.value[currentIndex.value].node.estimatedHours = rounded

  wbsUpdates.value.push({
    nodeId: currentLeaf.value.node._id,
    path: currentLeaf.value.path,
    oldEstimatedHours: oldHours,
    newEstimatedHours: rounded,
    reason,
  })
}

function applyDedupeOnly() {
  if (!currentGeneratedResult.value) return
  const before = currentGeneratedResult.value.tasks || []
  const deduped = dedupeRepeatedTasks(before)
  const summaryAfter = summarizeTasks(deduped.tasks)

  currentGeneratedResult.value = {
    ...currentGeneratedResult.value,
    tasks: deduped.tasks,
    generatedHours: summaryAfter.hours,
    pomodorosGenerated: summaryAfter.pomodoros,
    dedupeRemoved: deduped.removed,
  }
  leafNodes.value[currentIndex.value].generatedTasks = deduped.tasks
  leafNodes.value[currentIndex.value].generatedHours = summaryAfter.hours
}

async function applyAuditSuggestion() {
  if (!currentGeneratedResult.value || !currentLeaf.value) return
  resolutionProcessing.value = true
  try {
    if (!auditResult.value) {
      await runAudit()
    }
    if (!auditResult.value) return

    // Explicit rule requested: when diagnosis is mixed => dedupe repeated tasks + re-baseline estimate.
    if (auditResult.value.diagnosis === 'mixed') {
      applyDedupeOnly()
      const suggested = Number(
        auditResult.value.suggestedEstimatedHours || currentGeneratedResult.value.generatedHours,
      )
      const bottomUp = Number(currentGeneratedResult.value.generatedHours || 0)
      const target = Math.max(suggested, bottomUp)
      applyRebaseline(target, 'Auditoria IA (mixed): dedupe + re-baseline')
      resolutionDialogOpen.value = false
      return
    }

    // For other diagnoses, follow suggestedAction.
    if (auditResult.value.suggestedAction === 'rebaseline') {
      const suggested = Number(
        auditResult.value.suggestedEstimatedHours || currentGeneratedResult.value.generatedHours,
      )
      const bottomUp = Number(currentGeneratedResult.value.generatedHours || 0)
      applyRebaseline(Math.max(suggested, bottomUp), `Auditoria IA: ${String(auditResult.value.diagnosis || 'n/a')}`)
      resolutionDialogOpen.value = false
      return
    }
    if (auditResult.value.suggestedAction === 'simplify') {
      const suggestedHours = Number(auditResult.value.suggestedEstimatedHours)
      if (Number.isFinite(suggestedHours) && suggestedHours > 0) {
        applySimplifyToTargetHours(suggestedHours, 'Auditoria IA: simplify (novo orçamento do pacote)')
      } else {
        applySimplifyToBudget()
      }
      resolutionDialogOpen.value = false
      return
    }
  } finally {
    resolutionProcessing.value = false
  }
}

function applySimplifyToBudget() {
  if (!currentGeneratedResult.value || !currentLeaf.value) return

  const budgetHours = Number(currentLeaf.value.node.estimatedHours || 0)
  const targetPomodoros = Math.round(budgetHours * 2)
  const tasks = currentGeneratedResult.value.tasks || []

  // Always dedupe before pruning so we don't waste budget on repeated tasks.
  const deduped = dedupeRepeatedTasks(tasks)
  const adjusted = pruneByPriority(deduped.tasks, targetPomodoros)
  const summaryAfter = summarizeTasks(adjusted.tasks)

  currentGeneratedResult.value = {
    ...currentGeneratedResult.value,
    tasks: adjusted.tasks,
    generatedHours: summaryAfter.hours,
    pomodorosGenerated: summaryAfter.pomodoros,
    dedupeRemoved: (currentGeneratedResult.value.dedupeRemoved || 0) + (deduped.removed || 0),
  }
  leafNodes.value[currentIndex.value].generatedTasks = adjusted.tasks
  leafNodes.value[currentIndex.value].generatedHours = summaryAfter.hours
}

function applySimplifyToTargetHours(targetHours: number, estimateUpdateReason?: string) {
  if (!currentGeneratedResult.value || !currentLeaf.value) return

  const hours = Math.max(0, Number(targetHours || 0))
  const targetPomodoros = Math.round(hours * 2)
  const tasks = currentGeneratedResult.value.tasks || []

  const deduped = dedupeRepeatedTasks(tasks)
  const adjusted = pruneByPriority(deduped.tasks, targetPomodoros)
  const summaryAfter = summarizeTasks(adjusted.tasks)

  currentGeneratedResult.value = {
    ...currentGeneratedResult.value,
    tasks: adjusted.tasks,
    generatedHours: summaryAfter.hours,
    pomodorosGenerated: summaryAfter.pomodoros,
    dedupeRemoved: (currentGeneratedResult.value.dedupeRemoved || 0) + (deduped.removed || 0),
  }
  leafNodes.value[currentIndex.value].generatedTasks = adjusted.tasks
  leafNodes.value[currentIndex.value].generatedHours = summaryAfter.hours

  if (estimateUpdateReason) {
    applyRebaseline(hours, estimateUpdateReason)
  }
}

async function applyResolution() {
  if (!currentGeneratedResult.value || !currentLeaf.value) return
  resolutionProcessing.value = true
  try {
    if (resolutionMode.value === 'rebaseline') {
      applyRebaseline(currentGeneratedResult.value.generatedHours, 'Re-baseline (bottom-up)')
      resolutionDialogOpen.value = false
      return
    }

    if (resolutionMode.value === 'audit') {
      if (!auditResult.value) {
        await runAudit()
      }
      if (!auditResult.value) return

      // If audit says mixed, apply dedupe of repeated tasks first (gold plating symptom)
      if (auditResult.value.diagnosis === 'mixed') {
        applyDedupeOnly()
      }

      if (auditResult.value.suggestedAction === 'rebaseline') {
        const suggested = Number(
          auditResult.value.suggestedEstimatedHours || currentGeneratedResult.value.generatedHours,
        )
        // Keep estimate at least as big as the (possibly deduped) bottom-up total
        const bottomUp = Number(currentGeneratedResult.value.generatedHours || 0)
        const target = Math.max(suggested, bottomUp)
        applyRebaseline(target, `Auditoria IA: ${String(auditResult.value.diagnosis || 'n/a')}`)
        resolutionDialogOpen.value = false
        return
      }

      if (auditResult.value.suggestedAction === 'simplify') {
        // For mixed+simple, keep dedupe if applied above, then simplify.
        const suggestedHours = Number(auditResult.value.suggestedEstimatedHours)
        if (Number.isFinite(suggestedHours) && suggestedHours > 0) {
          applySimplifyToTargetHours(suggestedHours, 'Auditoria IA: simplify (novo orçamento do pacote)')
        } else {
          applySimplifyToBudget()
        }
        resolutionDialogOpen.value = false
        return
      }

      // fallback: apenas fechar
      resolutionDialogOpen.value = false
      return
    }

    if (resolutionMode.value === 'simplify') {
      applySimplifyToBudget()
      resolutionDialogOpen.value = false
      return
    }
  } finally {
    resolutionProcessing.value = false
  }
}

async function initializeLeafNodes() {
  processing.value = true
  try {
    const { $api } = useNuxtApp() as any
    const response = await $api.post(`/projects/${props.project._id}/wbs/leaf-nodes`, {
      nodes: props.wbsNodes,
    })
    
    leafNodes.value = response.data.leafNodes
    currentIndex.value = 0
    approvedTasks.value = []
    accumulatedHours.value = 0
    
    console.log(`📋 ${leafNodes.value.length} pacotes identificados`)
    
    // Auto-start first generation
    await generateCurrentLeaf()
  } catch (error: any) {
    console.error('Erro ao inicializar leafs:', error)
    alert('Erro ao preparar conversão interativa')
  } finally {
    processing.value = false
  }
}

async function generateCurrentLeaf() {
  if (!currentLeaf.value) return

  processing.value = true
  currentGeneratedResult.value = null
  auditResult.value = null
  
  try {
    const { $api } = useNuxtApp() as any
    const response = await $api.post(
      `/projects/${props.project._id}/wbs/generate-tasks-for-leaf`,
      {
        leafNode: currentLeaf.value.node,
        nodePath: currentLeaf.value.path,
        preferences: props.preferences,
        saveTasks: false, // Preview only
      }
    )

    currentGeneratedResult.value = response.data
    
    // Update leaf with generated data
    leafNodes.value[currentIndex.value].generatedTasks = response.data.tasks
    leafNodes.value[currentIndex.value].generatedHours = response.data.generatedHours
    
    console.log(`✅ ${response.data.tasks.length} tasks geradas para "${currentLeaf.value.node.name}"`)

    // Auto-audit when discrepancy is big.
    if (differencePercentage.value >= autoAuditThresholdPct) {
      try {
        const auditResp = await $api.post(`/projects/${props.project._id}/wbs/audit-leaf-discrepancy`, {
          leafNode: currentLeaf.value.node,
          nodePath: currentLeaf.value.path,
          generatedHours: currentGeneratedResult.value.generatedHours,
          tasks: (currentGeneratedResult.value.tasks || []).map((t: any) => ({
            name: t.name,
            pomodorosPlanned: t.pomodorosPlanned,
            priority: t.priority,
            microTaskType: t.microTaskType,
            themeTag: t.themeTag,
            contextTag: t.contextTag,
            cognitiveMode: t.cognitiveMode,
          })),
        })
        auditResult.value = auditResp.data
      } catch (e) {
        console.warn('Auto-auditoria falhou:', e)
      }
    }
  } catch (error: any) {
    console.error('Erro ao gerar tasks:', error)
    alert(`Erro ao gerar tasks: ${error?.response?.data?.message || error.message}`)
  } finally {
    processing.value = false
  }
}

async function handleRegenerate() {
  if (!confirm('Regenerar as micro-tarefas para este pacote?')) return
  await generateCurrentLeaf()
}

function openModelSelectionDialog() {
  modelSelectionDialogOpen.value = true
}

async function regenerateWithModel() {
  if (!currentLeaf.value) return

  processing.value = true
  currentGeneratedResult.value = null
  auditResult.value = null
  
  try {
    const { $api } = useNuxtApp() as any
    const response = await $api.post(
      `/projects/${props.project._id}/wbs/generate-tasks-for-leaf`,
      {
        leafNode: currentLeaf.value.node,
        nodePath: currentLeaf.value.path,
        preferences: {
          ...props.preferences,
          modelOverride: selectedModel.value,
        },
        saveTasks: false, // Preview only
      }
    )

    currentGeneratedResult.value = response.data
    
    // Update leaf with generated data
    leafNodes.value[currentIndex.value].generatedTasks = response.data.tasks
    leafNodes.value[currentIndex.value].generatedHours = response.data.generatedHours
    
    console.log(`✅ ${response.data.tasks.length} tasks geradas com ${selectedModel.value}`)

    modelSelectionDialogOpen.value = false

    // Auto-audit quando discrepância é grande
    if (differencePercentage.value >= autoAuditThresholdPct) {
      try {
        const auditResp = await $api.post(`/projects/${props.project._id}/wbs/audit-leaf-discrepancy`, {
          leafNode: currentLeaf.value.node,
          nodePath: currentLeaf.value.path,
          generatedHours: currentGeneratedResult.value.generatedHours,
          tasks: (currentGeneratedResult.value.tasks || []).map((t: any) => ({
            name: t.name,
            pomodorosPlanned: t.pomodorosPlanned,
            priority: t.priority,
            microTaskType: t.microTaskType,
            themeTag: t.themeTag,
            contextTag: t.contextTag,
            cognitiveMode: t.cognitiveMode,
          })),
        })
        auditResult.value = auditResp.data
      } catch (e) {
        console.warn('Auto-auditoria falhou:', e)
      }
    }
  } catch (error: any) {
    console.error('Erro ao gerar tasks com modelo:', error)
    alert(`Erro ao gerar tasks: ${error?.response?.data?.message || error.message}`)
    modelSelectionDialogOpen.value = false
  } finally {
    processing.value = false
  }
}

async function handleApproveAndContinue() {
  if (!currentGeneratedResult.value) return

  // Add to approved list
  approvedTasks.value.push(...currentGeneratedResult.value.tasks)
  accumulatedHours.value += currentGeneratedResult.value.generatedHours

  // Move to next
  currentIndex.value++
  currentGeneratedResult.value = null

  // Generate next if not last
  if (!isLastLeaf.value) {
    await generateCurrentLeaf()
  }
}

async function handleSaveAll() {
  if (approvedTasks.value.length === 0) {
    alert('Nenhuma task aprovada para salvar')
    return
  }

  const totalApprovedHours = accumulatedHours.value + (currentGeneratedResult.value?.generatedHours || 0)
  const budgetExceeded = totalApprovedHours - totalBudgetHours.value
  const exceedPercentage = totalBudgetHours.value > 0 ? (budgetExceeded / totalBudgetHours.value) * 100 : 0

  const confirmMsg = `
Salvar todas as ${approvedTasks.value.length} micro-tarefas aprovadas?

💰 Orçamento WBS: ${totalBudgetHours.value.toFixed(1)}h
✅ Horas aprovadas: ${totalApprovedHours.toFixed(1)}h
📊 Diferença: ${budgetExceeded >= 0 ? '+' : ''}${budgetExceeded.toFixed(1)}h (${exceedPercentage >= 0 ? '+' : ''}${exceedPercentage.toFixed(0)}%)

${exceedPercentage > 20 ? '⚠️ ATENÇÃO: Extrapolação significativa do orçamento!' : ''}
  `.trim()

  if (!confirm(confirmMsg)) return

  processing.value = true
  try {
    const { $api } = useNuxtApp() as any
    
    // Approve last leaf tasks if exists
    const finalTasks = [...approvedTasks.value]
    if (currentGeneratedResult.value) {
      finalTasks.push(...currentGeneratedResult.value.tasks)
    }

    // Save all approved tasks
    const savePromises = finalTasks.map((taskData: any) =>
      $api.post(`/tasks`, taskData)
    )

    await Promise.all(savePromises)

    console.log(`✅ ${finalTasks.length} tasks salvas com sucesso`)
    
    emit('complete', {
      totalTasks: finalTasks.length,
      totalHours: totalApprovedHours,
      budgetHours: totalBudgetHours.value,
      wbsUpdates: wbsUpdates.value,
    })
    
    isOpen.value = false
  } catch (error: any) {
    console.error('Erro ao salvar tasks:', error)
    alert(`Erro ao salvar tasks: ${error?.response?.data?.message || error.message}`)
  } finally {
    processing.value = false
  }
}

function handleCancel() {
  if (approvedTasks.value.length > 0) {
    if (!confirm(`Cancelar? ${approvedTasks.value.length} tasks aprovadas serão descartadas.`)) {
      return
    }
  }
  
  emit('cancel')
  isOpen.value = false
}

watch(isOpen, (newVal) => {
  if (newVal) {
    initializeLeafNodes()
  }
})

function openMicroTaskDialog(task: any) {
  selectedMicroTask.value = task
  microTaskDialogOpen.value = true
}


function openLeafDetailDialog(leafNode: any) {
  selectedLeafNode.value = leafNode
  leafDetailDialogOpen.value = true
}

function getBudgetDiffPercentage(leafNode: any): number {
  const budget = leafNode.node.estimatedHours || 0
  const generated = leafNode.generatedHours || 0
  return budget > 0 ? ((generated - budget) / budget) * 100 : 0
}

function getBudgetDiffClass(leafNode: any): string {
  const diff = getBudgetDiffPercentage(leafNode)
  if (diff > 50) return 'text-error font-weight-bold'
  if (diff > 20) return 'text-warning font-weight-bold'
  if (diff < -10) return 'text-info'
  return 'text-success'
}

function formatDate(dateValue: any): string {
  if (!dateValue) return 'N/A'
  try {
    const date = new Date(dateValue)
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  } catch {
    return 'Data inválida'
  }
}
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Irish+Grover&family=MedievalSharp&display=swap');

/* Dialog Layout Structure */
.progress-header {
  background: rgba(var(--v-theme-surface), 1);
  position: sticky;
  top: 0;
  z-index: 5;
  border-bottom: 1px solid rgba(var(--v-border-color), 0.12);
}

.main-content-wrapper {
  max-height: calc(100vh - 340px);
  overflow-y: auto;
  overflow-x: hidden;
}

/* Two Column Grid Layout */
.content-grid {
  display: grid;
  grid-template-columns: 0.6fr 1.4fr;
  gap: 2rem;
  align-items: start;
}

.leaf-list-column {
  display: flex;
  flex-direction: column;
}

.list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 0.5rem;
  margin-bottom: 0.5rem;
  border-bottom: 1px solid rgba(var(--v-border-color), 0.12);
}

.list-header h4 {
  margin: 0;
}

.leaf-nodes-list {
  border: 1px solid rgba(var(--v-border-color), 0.12);
  border-radius: 4px;
  padding: 0.5rem;
  background: rgba(var(--v-theme-surface-variant), 0.02);
  max-height: 600px;
  overflow-y: auto;
}

.leaf-details-column {
  display: flex;
  flex-direction: column;
  border: 1px solid rgba(var(--v-border-color), 0.12);
  border-radius: 4px;
  padding: 1.5rem;
  background: rgba(var(--v-theme-surface-variant), 0.02);
}

.leaf-header {
  margin-bottom: 1rem;
}

.leaf-header h3 {
  margin-bottom: 0.25rem;
}

/* Tasks Preview Container */
.tasks-preview-container {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  max-height: 500px;
  overflow-y: auto;
  border: 1px solid rgba(var(--v-border-color), 0.08);
  border-radius: 4px;
  padding: 0.75rem;
  background: rgba(var(--v-theme-surface), 0.5);
}

.task-item {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem;
  border-left: 3px solid rgba(var(--v-primary-color), 0.2);
  border-radius: 2px;
  background: rgba(var(--v-surface-color), 1);
  transition: all 0.2s ease;
}

.task-item:hover {
  border-left-color: rgba(var(--v-primary-color), 0.8);
  background: rgba(var(--v-primary-color), 0.03);
}

.task-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.task-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex: 1;
  font-size: 0.875rem;
  min-width: 0;
}

.task-title span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-tags {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.details-content {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

  .task-item {
    cursor: pointer;
  }

  /* Micro Task Dialog Styles */
  .micro-task-paper-dialog {
    position: relative;
    width: 500px;
    height: 700px;
    margin: -4rem auto;
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

  .micro-task-content::-webkit-scrollbar {
    width: 8px;
  }

  .micro-task-content::-webkit-scrollbar-track {
    background: rgba(201, 166, 107, 0.2);
    border-radius: 4px;
  }

  .micro-task-content::-webkit-scrollbar-thumb {
    background: rgba(139, 90, 43, 0.5);
    border-radius: 4px;
  }

  .micro-task-content::-webkit-scrollbar-thumb:hover {
    background: rgba(139, 90, 43, 0.7);
  }

  /* Paper Title */
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

  /* Paper Dialog Content */
  .paper-dialog-content,
  .micro-task-content {
    font-size: 0.9rem;
    line-height: 1.5;
  }

  /* Form Sections */
  .form-section {
    margin-bottom: 0.75rem;
  }

  .form-section:last-child {
    margin-bottom: 0;
  }

  .section-title {
    font-family: 'MedievalSharp', cursive;
    font-size: 0.95rem;
    font-weight: 600;
    color: #5d4037;
    margin: 0 0 0.25rem 0;
    padding-bottom: 0.4rem;
    border-bottom: 2px dashed #c9a66b;
  }

  /* Field Display */
  .field-display {
    margin-bottom: 0.5rem;
    font-size: 0.85rem;
  }

  .field-display strong {
    color: #3e2723;
    display: block;
    margin-bottom: 0.2rem;
  }

  .field-display .value {
    font-weight: 600;
    color: #5d4037;
  }

  .field-display p {
    margin: 0.3rem 0 0 0;
    color: #5d4037;
  }

  /* Dialog Grid */
  .dialog-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }

  /* Checklist Display */
  .checklist-display {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .checklist-item {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    font-size: 0.85rem;
    color: #5d4037;
  }

  /* PERT Display */
  .pert-display {
    background: rgba(201, 166, 107, 0.1);
    padding: 0.5rem;
    border-radius: 3px;
    border-left: 3px solid #c9a66b;
    margin: 0.5rem 0;
    font-size: 0.8rem;
  }

  .pert-display strong {
    display: block;
    margin-bottom: 0.3rem;
    color: #3e2723;
  }

  .pert-values {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.3rem;
    color: #5d4037;
  }

  .pert-values span {
    font-size: 0.75rem;
  }

  /* Tags Display */
  .tags-display {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin-top: 0.3rem;
  }

  /* WBS Path */
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

  /* Close Button */
  .close-button-wrapper {
    position: absolute;
    top: 1rem;
    right: 1rem;
    z-index: 10;
  }

  .close-btn {
    background: rgba(255, 255, 255, 0.8) !important;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }

  /* Responsive utilities */
  .mr-1 {
    margin-right: 0.25rem;
  }

  .mt-2 {
    margin-top: 0.5rem;
  }

  .mt-4 {
    margin-top: 1rem;
  }

  .mb-2 {
    margin-bottom: 0.5rem;
  }

  .mb-3 {
    margin-bottom: 0.75rem;
  }

  .pa-3 {
    padding: 0.75rem;
  }

  /* Leaf Detail Dialog Styles */
  .leaf-paper-dialog {
    position: relative;
    width: 550px;
    height: 750px;
    margin: 0 auto;
  }

  .leaf-content {
    position: absolute;
    top: 1rem;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 4;
    padding: 0 3rem;
    overflow-y: auto;
    overflow-x: hidden;
    color: #3e2723;
    font-family: 'MedievalSharp', 'Irish Grover', cursive;
  }

  .leaf-content::-webkit-scrollbar {
    width: 8px;
  }

  .leaf-content::-webkit-scrollbar-track {
    background: rgba(201, 166, 107, 0.2);
    border-radius: 4px;
  }

  .leaf-content::-webkit-scrollbar-thumb {
    background: rgba(139, 90, 43, 0.5);
    border-radius: 4px;
  }

  .leaf-content::-webkit-scrollbar-thumb:hover {
    background: rgba(139, 90, 43, 0.7);
  }

  /* Budget Display */
  .budget-display {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    background: rgba(201, 166, 107, 0.1);
    padding: 0.75rem;
    border-radius: 3px;
    border-left: 3px solid #c9a66b;
  }

  .budget-item {
    display: flex;
    justify-content: space-between;
    font-size: 0.85rem;
    color: #5d4037;
  }

  .budget-item .value {
    font-weight: 600;
    color: #3e2723;
  }

  .budget-alert {
    margin-top: 0.5rem;
    padding: 0.5rem;
    border-radius: 3px;
    background: rgba(229, 57, 53, 0.08);
    border-left: 3px solid #E53935;
  }

  .budget-diff {
    display: flex;
    justify-content: space-between;
    font-size: 0.85rem;
    align-items: center;
  }

  .budget-diff strong {
    color: #3e2723;
  }

  /* Tasks Summary */
  .tasks-summary {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    max-height: 300px;
    overflow-y: auto;
  }

  .task-summary-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.5rem;
    background: rgba(46, 125, 50, 0.05);
    border-radius: 3px;
    border-left: 2px solid #2E7D32;
    font-size: 0.8rem;
  }

  .task-summary-name {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    flex: 1;
    min-width: 0;
    color: #5d4037;
  }

  .task-summary-name span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .task-summary-info {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    flex-shrink: 0;
  }

  .empty-state {
    text-align: center;
    padding: 1rem;
    color: #999;
  }
  @media (max-width: 1400px) {
    .content-grid {
      grid-template-columns: 0.5fr 1.5fr;
    }
  }

  @media (max-width: 1200px) {
    .content-grid {
      grid-template-columns: 1fr;
      gap: 1.5rem;
    }

    .main-content-wrapper {
      max-height: calc(100vh - 300px);
    }

    .tasks-preview-container {
      max-height: 400px;
    }
  }

  @media (max-width: 600px) {
    .task-header {
      flex-direction: column;
      align-items: flex-start;
    }

    .task-tags {
      width: 100%;
    }
  }
</style>
