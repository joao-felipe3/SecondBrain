<template>
  <v-sheet class="page-container" :class="{ editing }" elevation="0" color="transparent" @click.stop>
    <!-- LEFT PAGE -->
    <v-sheet class="page left-page" elevation="0" color="transparent" @click.stop>
      <div v-if="!hasWBS && !project?.smartObjective" class="empty-state">
        <v-icon size="64" color="grey-lighten-1">mdi-file-tree-outline</v-icon>
        <h3 class="mt-2 mb-2 text-medium-emphasis">WBS — Estrutura Analítica</h3>
        <p class="text-body-2 text-medium-emphasis">
          Crie primeiro um objetivo SMART para gerar a WBS automaticamente.
        </p>
      </div>

      <div v-else-if="!hasWBS && project?.smartObjective" class="empty-state">
        <v-icon size="64" color="primary">mdi-file-tree-outline</v-icon>
        <h3 class="mt-2 mb-2">Gerar WBS com IA</h3>
        <p class="text-body-2 text-medium-emphasis mb-4">
          Decomponha seu objetivo SMART em <strong>pacotes de trabalho</strong> (regra 8/80h).
          Depois, você pode converter cada pacote em <strong>micro-tarefas (≤3h)</strong> para execução no SecondBrain.
        </p>
        <v-btn
          color="primary"
          prepend-icon="mdi-robot"
          :loading="generating"
          block
          class="wbs-generate-btn"
          @click.stop="generateWBS"
        >
          Gerar WBS Automaticamente
        </v-btn>
      </div>

      <div v-else class="wbs-content-wrapper">
        <div class="d-flex align-center justify-space-between mb-2" style="position: relative; z-index: 10;">
          <h3>🌳 WBS</h3>
          <div class="d-flex gap-1">
            <v-btn
              v-if="!editing"
              size="small"
              style="font-size: 0.55rem;"
              variant="outlined"
              prepend-icon="mdi-refresh"
              :loading="generating"
              @click.stop="generateWBS"
            >
              Regerar
            </v-btn>
          </div>
        </div>

        <!-- Validation summary -->
        <v-alert
          v-if="validation && !validation.valid"
          type="warning"
          variant="tonal"
          density="compact"
          class="mb-2"
          style="font-size: 0.75rem;"
        >
          ⚠️ {{ validation.violations.length }} pacote(s) violam a regra 8/80
        </v-alert>

        <v-alert
          v-else-if="validation && validation.valid && wbsNodes.length > 0"
          type="success"
          variant="tonal"
          density="compact"
          class="mb-2"
          style="font-size: 0.75rem;"
        >
          ✅ Todos os pacotes respeitam a regra 8/80
        </v-alert>

        <!-- WBS Stats -->
        <div v-if="wbsNodes.length > 0" class="wbs-stats mb-2">
          <v-chip size="x-small" variant="tonal" color="primary" class="mr-1">
            {{ totalLeafNodes }} pacotes
          </v-chip>
          <v-chip size="x-small" variant="tonal" color="info" class="mr-1">
            {{ totalHours }}h estimadas
          </v-chip>
        </div>

        <!-- WBS Tree -->
        <div class="wbs-tree-container">
          <WBSTreeView
            :nodes="wbsNodes"
            :editing="editing"
            @suggest-decomposition="handleSuggestDecomposition"
            @update-node="handleUpdateNode"
            @delete-node="handleDeleteNode"
            @add-child="handleAddChild"
            @move-node="handleMoveNode"
          />
        </div>

        <!-- Save button in editing mode -->
        <div v-if="editing" class="edit-mode-actions mt-2">
          <v-btn
            color="success"
            variant="flat"
            prepend-icon="mdi-content-save"
            :loading="savingWBS"
            block
            @click.stop="saveWBS"
          >
            Salvar Alterações
          </v-btn>
        </div>
      </div>
    </v-sheet>

    <!-- RIGHT PAGE -->
    <v-sheet class="page right-page" elevation="0" color="transparent" @click.stop>
      <div v-if="hasWBS">
        <h3 class="mb-2">📋 Ações</h3>

        <!-- Preferences & Conversion -->
        <v-card elevation="1" class="mb-3" @click.stop>
          <v-card-text style="padding: 0.75rem;">
            <div class="d-flex align-center mb-2">
              <v-icon color="primary" size="20" class="mr-2">mdi-cog-outline</v-icon>
              <span class="text-body-2 font-weight-medium">Preferências & Conversão</span>
            </div>

            <div class="mt-1">
              <v-select
                v-model="granularityPomodoros"
                :items="granularityOptions"
                label="Granularidade (pomodoros)"
                density="compact"
                variant="outlined"
                hide-details
              />
            </div>

            <div class="mt-2">
              <v-select
                v-model="workflowMixPreset"
                :items="workflowMixOptions"
                label="Mix de tipos"
                density="compact"
                variant="outlined"
                hide-detai1remls
              />
              <p class="text-caption text-medium-emphasis mt-n4" style="font-size: 0.7rem;">
                {{ workflowMixDescription }}
              </p>
            </div>

            <v-divider class="my-1"/>

            <p class="text-caption text-medium-emphasis mb-2">
              Transforma cada <strong>pacote (8/80h)</strong> em <strong>micro-tarefas (≤3h)</strong>.
            </p>
            
            <!-- Interactive conversion button -->
            <v-btn
              color="success"
              size="small"
              variant="flat"
              prepend-icon="mdi-eye-check"
              style="font-size: 0.6rem;"
              :disabled="!validation?.valid"
              block
              class="mb-2"
              @click.stop="showInteractiveDialog = true"
            >
              Conversão Interativa (Permite revisar)
            </v-btn>

            <!-- Automatic conversion button -->
            <v-btn
              color="primary"
              size="small"
              variant="tonal"
              prepend-icon="mdi-arrow-right-bold"
              style="font-size: 0.6rem;"
              :loading="converting"
              :disabled="!validation?.valid"
              block
              @click.stop="convertToTasks"
            >
              Conversão Automática ({{ totalLeafNodes }} pacotes)
            </v-btn>
            <p v-if="!validation?.valid" class="text-caption text-warning mt-1">
              Corrija as violações 8/80 antes de converter
            </p>
          </v-card-text>
        </v-card>

        <!-- Decomposition suggestion -->
        <v-card v-if="decompositionSuggestion" elevation="1" class="mb-3" @click.stop>
          <v-card-text style="padding: 0.75rem;">
            <div class="d-flex align-center justify-space-between mb-2">
              <div class="d-flex align-center">
                <v-icon color="warning" size="20" class="mr-2">mdi-auto-fix</v-icon>
                <span class="text-body-2 font-weight-medium">Sugestão de Decomposição</span>
              </div>
              <v-btn
                icon="mdi-close"
                variant="text"
                size="x-small"
                @click.stop="dismissSuggestion"
              />
            </div>
            
            <!-- Sugestão parseada com cards -->
            <div v-if="parsedSuggestion" class="suggestion-list">
              <v-card
                v-for="(item, index) in parsedSuggestion"
                :key="index"
                variant="tonal"
                color="warning"
                class="mb-2"
                elevation="0"
              >
                <v-card-text style="padding: 0.5rem;">
                  <div class="d-flex align-center justify-space-between mb-1">
                    <span class="text-caption font-weight-bold">{{ item.name }}</span>
                    <v-chip size="x-small" color="warning">{{ item.estimatedHours }}h</v-chip>
                  </div>
                  <p class="text-caption text-medium-emphasis" style="font-size: 0.65rem;">
                    {{ item.description }}
                  </p>
                </v-card-text>
              </v-card>
              
              <v-btn
                color="warning"
                variant="flat"
                prepend-icon="mdi-check"
                size="small"
                block
                class="mt-2"
                @click.stop="applySuggestion"
              >
                Aplicar Sugestão
              </v-btn>
            </div>
            
            <!-- Fallback para texto bruto -->
            <div v-else>
              <p class="text-caption text-medium-emphasis" style="white-space: pre-wrap;">
                {{ decompositionSuggestion }}
              </p>
            </div>
          </v-card-text>
        </v-card>

        <!-- Conversion success -->
        <v-alert
          v-if="conversionResult"
          type="success"
          variant="tonal"
          density="compact"
          class="mb-2"
          style="font-size: 0.75rem;"
          closable
          @click:close="conversionResult = ''"
        >
          {{ conversionResult }}
        </v-alert>
      </div>

      <!-- Empty right page when no WBS -->
      <div v-else class="empty-state">
        <v-icon size="48" color="grey-lighten-1">mdi-information-outline</v-icon>
        <h4 class="mt-2 mb-2 text-medium-emphasis">WBS: pacotes 8/80 vs micro-tarefas</h4>
        <p class="text-caption text-medium-emphasis">
          Na WBS, você cria <strong>pacotes de trabalho</strong> (planejamento) que devem ter entre
          <strong>8 e 80 horas</strong> estimadas.
        </p>
        <p class="text-caption text-medium-emphasis mt-2">
          <strong>&lt; 8h:</strong> muito granular, combine com outros<br>
          <strong>&gt; 80h:</strong> muito amplo, decomponha mais
        </p>
        <p class="text-caption text-medium-emphasis mt-2">
          Depois, ao converter, cada pacote vira <strong>micro-tarefas (≤3h)</strong> para execução no SecondBrain.
        </p>
      </div>
    </v-sheet>
  </v-sheet>

  <!-- Interactive Conversion Dialog -->
  <InteractiveConversionDialog
    v-model="showInteractiveDialog"
    :project="project"
    :wbs-nodes="wbsNodes"
    :preferences="{
      targetPomodoros: granularityPomodoros,
      workflowMix: buildWorkflowMix(),
    }"
    @complete="handleInteractiveComplete"
    @cancel="handleInteractiveCancel"
  />
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import type { PropType } from 'vue'
import WBSTreeView from '../sections/WBSTreeView.vue'
import InteractiveConversionDialog from '../dialogs/InteractiveConversionDialog.vue'
import type { WBSNode } from '../sections/WBSTreeView.vue'
import { useNuxtApp } from '#app'

type Project = Record<string, any>

const props = defineProps({
  project: { type: Object as PropType<Project | null>, default: null },
  editing: { type: Boolean, default: false },
})

const emit = defineEmits(['wbs-updated', 'update-field'])

const wbsNodes = ref<WBSNode[]>([])
const validation = ref<{ valid: boolean; violations: any[] } | null>(null)
const generating = ref(false)
const converting = ref(false)
const savingWBS = ref(false)
const decompositionSuggestion = ref('')
const parsedSuggestion = ref<WBSNode[] | null>(null)
const suggestionTargetNode = ref<WBSNode | null>(null)
const conversionResult = ref('')
const granularityPomodoros = ref(2)
const workflowMixPreset = ref('balanced')
const showInteractiveDialog = ref(false)

const granularityOptions = [
  { title: '1 pomodoro', value: 1 },
  { title: '2 pomodoros', value: 2 },
  { title: '3 pomodoros', value: 3 },
]

const workflowMixOptions = [
  { title: 'Balanceado', value: 'balanced' },
  { title: 'Mais preparação', value: 'prepare' },
  { title: 'Mais prática', value: 'practice' },
  { title: 'Mais produção', value: 'produce' },
  { title: 'Mais teste', value: 'test' },
]

const workflowMixDescription = computed(() => {
  switch (workflowMixPreset.value) {
    case 'prepare':
      return 'Ênfase em preparação e inputs.'
    case 'practice':
      return 'Ênfase em prática guiada.'
    case 'produce':
      return 'Ênfase em produção e entregáveis.'
    case 'test':
      return 'Ênfase em validação e testes.'
    default:
      return 'Distribuição equilibrada entre tipos.'
  }
})

const hasWBS = computed(() => wbsNodes.value.length > 0)

const totalLeafNodes = computed(() => {
  let count = 0
  const traverse = (nodes: WBSNode[]) => {
    for (const node of nodes) {
      if (!node.children || node.children.length === 0) {
        count++
      } else {
        traverse(node.children)
      }
    }
  }
  traverse(wbsNodes.value)
  return count
})

const totalHours = computed(() => {
  let total = 0
  const traverse = (nodes: WBSNode[]) => {
    for (const node of nodes) {
      if (!node.children || node.children.length === 0) {
        total += node.estimatedHours || 0
      } else {
        traverse(node.children)
      }
    }
  }
  traverse(wbsNodes.value)
  return total
})

// Load saved WBS when project changes
watch(() => props.project?._id, async (newId) => {
  if (newId) {
    await loadWBS()
  }
}, { immediate: true })

async function loadWBS() {
  if (!props.project?._id) return
  try {
    const { $api } = useNuxtApp() as any
    const response = await $api.get(`/projects/${props.project._id}/wbs`)
        
    if (response.data.nodes && response.data.nodes.length > 0) {
      // Criar uma cópia profunda para evitar mutações inesperadas
      wbsNodes.value = JSON.parse(JSON.stringify(response.data.nodes))
      
      // Revalidar após carregar para garantir consistência
      validateWBS()
      
    }
  } catch (error) {
    // No WBS saved yet, that's fine
    console.debug('No saved WBS found:', error)
  }
}

async function generateWBS() {
  if (!props.project?.smartObjective || !props.project?._id) return

  generating.value = true
  try {
    const { $api } = useNuxtApp() as any
    const smart = props.project.smartObjective

    const response = await $api.post(`/projects/${props.project._id}/generate-wbs`, {
      specific: smart.specific,
      measurable: smart.measurable,
      achievable: smart.achievable,
      relevant: smart.relevant,
      temporal: smart.temporal,
      summary: smart.summary,
    })
    
    wbsNodes.value = response.data.nodes
    validation.value = response.data.validation
    
    // Auto-save after generation
    await saveWBS()
  } catch (error) {
    console.error('Erro ao gerar WBS:', error)
    alert('Erro ao gerar WBS. Tente novamente.')
  } finally {
    generating.value = false
  }
}

async function saveWBS() {
  if (!props.project?._id || wbsNodes.value.length === 0) return

  savingWBS.value = true
  try {
    const { $api } = useNuxtApp() as any
    
    
    await $api.post(`/projects/${props.project._id}/save-wbs`, {
      nodes: wbsNodes.value,
    })
  } catch (error) {
    console.error('Erro ao salvar WBS:', error)
    alert('Erro ao salvar WBS.')
  } finally {
    savingWBS.value = false
  }
}

async function convertToTasks() {
  if (!props.project?._id || wbsNodes.value.length === 0) return

  // Budget validation and confirmation
  const wbsBudget = totalHours.value
  const estimatedTasks = totalLeafNodes.value
  const avgPomodorosPerHour = 2 // Aproximação conservadora
  const estimatedPomodoros = wbsBudget * avgPomodorosPerHour
  
  const confirmMsg = `Você está prestes a converter a WBS em micro-tarefas:

  📊 Orçamento WBS: ${wbsBudget.toFixed(1)}h (${estimatedTasks} pacotes)
  🎯 Granularidade: ${granularityPomodoros.value} pomodoros (~${(granularityPomodoros.value * 0.5).toFixed(1)}h)
  ⚙️ Workflow: ${workflowMixPreset.value}
  
  ⏱️ Estimativa: ~${estimatedPomodoros} pomodoros (~${(estimatedPomodoros * 0.5).toFixed(1)}h geradas)
  
  ⚠️ IMPORTANTE: O backend validará se as horas geradas não excedem muito o orçamento planejado.
  
  Deseja continuar?`
  
  if (!confirm(confirmMsg)) {
    return
  }

  converting.value = true
  
  try {
    const { $api } = useNuxtApp() as any
    const payload = {
      nodes: wbsNodes.value,
      autoResolveDiscrepancies: true,
      preferences: {
        targetPomodoros: granularityPomodoros.value,
        workflowMix: buildWorkflowMix(),
      },
    }
    
    
    const response = await $api.post(`/projects/${props.project._id}/wbs/convert-to-tasks`, payload)
    
    if (response.data.tasksCreated === 0) {
      alert('⚠️ Aviso: Nenhuma micro-tarefa foi criada. Verifique se seus pacotes estão dentro da regra 8/80h')
    }
    
    conversionResult.value = response.data.message

    // Persist automatic rebaseline/simplify changes (if any)
    if (Array.isArray(response?.data?.wbsUpdates) && response.data.wbsUpdates.length > 0) {
      const applyUpdates = (nodes: WBSNode[], updates: any[]) => {
        const updateById = new Map<string, any>()
        for (const u of updates) {
          if (u?.nodeId) updateById.set(String(u.nodeId), u)
        }

        const traverse = (list: WBSNode[]) => {
          for (const node of list) {
            const u = node._id ? updateById.get(String(node._id)) : null
            if (u && typeof u.newEstimatedHours === 'number') {
              node.estimatedHours = u.newEstimatedHours
            }
            if (node.children && node.children.length > 0) traverse(node.children)
          }
        }
        traverse(nodes)
      }

      applyUpdates(wbsNodes.value, response.data.wbsUpdates)
      validateWBS()
      wbsNodes.value = JSON.parse(JSON.stringify(wbsNodes.value))
      await saveWBS()
    }
  } catch (error: any) {
    const errorMsg = error?.response?.data?.message || error?.message || 'Erro desconhecido'
    alert(`Erro ao converter WBS: ${errorMsg}`)
  } finally {
    converting.value = false
  }
}

function buildWorkflowMix() {
  switch (workflowMixPreset.value) {
    case 'prepare':
      return { prepare: 0.35, practice: 0.35, produce: 0.2, test: 0.1 }
    case 'practice':
      return { prepare: 0.2, practice: 0.45, produce: 0.25, test: 0.1 }
    case 'produce':
      return { prepare: 0.15, practice: 0.35, produce: 0.4, test: 0.1 }
    case 'test':
      return { prepare: 0.15, practice: 0.3, produce: 0.2, test: 0.35 }
    default:
      return { prepare: 0.2, practice: 0.4, produce: 0.3, test: 0.1 }
  }
}

function handleInteractiveComplete(result: any) {
  conversionResult.value = `✅ Conversão interativa concluída: ${result.totalTasks} micro-tarefas (${result.totalHours.toFixed(1)}h geradas de ${result.budgetHours.toFixed(1)}h orçadas)`

  // Apply any re-baselining updates coming from the dialog and persist to backend
  if (Array.isArray(result?.wbsUpdates) && result.wbsUpdates.length > 0) {
    const applyUpdates = (nodes: WBSNode[], updates: any[]) => {
      const updateById = new Map<string, any>()
      for (const u of updates) {
        if (u?.nodeId) updateById.set(String(u.nodeId), u)
      }

      const traverse = (list: WBSNode[]) => {
        for (const node of list) {
          const u = node._id ? updateById.get(String(node._id)) : null
          if (u && typeof u.newEstimatedHours === 'number') {
            node.estimatedHours = u.newEstimatedHours
          }
          if (node.children && node.children.length > 0) traverse(node.children)
        }
      }
      traverse(nodes)
    }

    applyUpdates(wbsNodes.value, result.wbsUpdates)
    validateWBS()
    wbsNodes.value = JSON.parse(JSON.stringify(wbsNodes.value))
    // Persist to backend (updates intermediate rollups server-side)
    saveWBS()
  }

  showInteractiveDialog.value = false
}

function handleInteractiveCancel() {
  showInteractiveDialog.value = false
}

const themePreview = computed(() => {
  if (!wbsNodes.value.length) return []
  const groups = new Map<string, { theme: string; count: number; hours: number }>()

  const traverse = (nodes: WBSNode[], ancestors: string[] = []) => {
    for (const node of nodes) {
      const nextAncestors = [...ancestors, node.name]
      if (!node.children || node.children.length === 0) {
        const theme = nextAncestors[0] || 'Sem tema'
        const entry = groups.get(theme) || { theme, count: 0, hours: 0 }
        entry.count += 1
        entry.hours += node.estimatedHours || 0
        groups.set(theme, entry)
      } else {
        traverse(node.children, nextAncestors)
      }
    }
  }

  traverse(wbsNodes.value)
  return Array.from(groups.values()).sort((a, b) => b.hours - a.hours)
})

async function handleSuggestDecomposition(node: WBSNode) {
  if (!props.project?._id) return

  decompositionSuggestion.value = 'Gerando sugestão...'
  parsedSuggestion.value = null
  suggestionTargetNode.value = null
  
  try {
    const { $api } = useNuxtApp() as any
    const response = await $api.post(`/projects/${props.project._id}/wbs/suggest-decomposition`, {
      name: node.name,
      description: node.description,
      estimatedHours: node.estimatedHours,
    })

    decompositionSuggestion.value = response.data.suggestion
    suggestionTargetNode.value = node
    
    // Tentar parsear JSON da sugestão
    try {
      const jsonMatch = response.data.suggestion.match(/```json\s*([\s\S]*?)```/)
      if (jsonMatch) {
        parsedSuggestion.value = JSON.parse(jsonMatch[1])
      }
    } catch (e) {
      console.error('Erro ao parsear sugestão JSON:', e)
    }
  } catch (error) {
    console.error('Erro ao gerar sugestão:', error)
    decompositionSuggestion.value = 'Erro ao gerar sugestão de decomposição.'
  }
}

function validateWBS() {
  const violations: any[] = []
  
  const checkNode = (node: WBSNode, path: string[] = []) => {
    const currentPath = [...path, node.name]
    const isLeaf = !node.children || node.children.length === 0
    
    if (isLeaf) {
      if (node.estimatedHours < 8) {
        violations.push({
          path: currentPath.join(' > '),
          reason: `Muito pequeno: ${node.estimatedHours}h (mínimo 8h)`
        })
      } else if (node.estimatedHours > 80) {
        violations.push({
          path: currentPath.join(' > '),
          reason: `Muito grande: ${node.estimatedHours}h (máximo 80h)`
        })
      }
    }
    
    if (node.children && node.children.length > 0) {
      node.children.forEach(child => checkNode(child, currentPath))
    }
  }
  
  wbsNodes.value.forEach(node => checkNode(node))
  
  validation.value = {
    valid: violations.length === 0,
    violations
  }
}

async function applySuggestion() {
  if (!parsedSuggestion.value || !suggestionTargetNode.value) return
  
  // Ajustar o level dos children sugeridos para parent.level + 1
  const targetLevel = suggestionTargetNode.value.level
  const adjustedChildren = parsedSuggestion.value.map(child => ({
    ...child,
    level: targetLevel + 1
  }))
    
  // Encontrar e substituir o nó alvo pelos filhos sugeridos
  const replaceNode = (nodes: WBSNode[]): WBSNode[] => {
    return nodes.map(node => {
      if (node === suggestionTargetNode.value) {
        return {
          ...node,
          children: adjustedChildren
        }
      }
      if (node.children && node.children.length > 0) {
        return {
          ...node,
          children: replaceNode(node.children)
        }
      }
      return node
    })
  }
  
  wbsNodes.value = replaceNode(wbsNodes.value)
  
  // Revalidar a WBS após aplicar a sugestão
  validateWBS()
  
  // Limpar sugestão após aplicar
  decompositionSuggestion.value = ''
  parsedSuggestion.value = null
  suggestionTargetNode.value = null
  
  // Auto-save after applying suggestion
  await saveWBS()
  
  alert('✅ Sugestão aplicada e salva com sucesso!')
}

function dismissSuggestion() {
  decompositionSuggestion.value = ''
  parsedSuggestion.value = null
  suggestionTargetNode.value = null
}

// Node editing handlers
function handleUpdateNode(payload: { nodeId?: string; field: string; value: any }) {
  const findAndUpdate = (nodes: WBSNode[]): boolean => {
    for (const node of nodes) {
      if (node._id === payload.nodeId) {
        ;(node as any)[payload.field] = payload.value
        return true
      }
      if (node.children && findAndUpdate(node.children)) {
        return true
      }
    }
    return false
  }
  
  if (findAndUpdate(wbsNodes.value)) {
    validateWBS()
    // Trigger re-render
    wbsNodes.value = JSON.parse(JSON.stringify(wbsNodes.value))
  }
}

function handleDeleteNode(nodeId?: string) {
  const deleteNode = (nodes: WBSNode[]): WBSNode[] => {
    return nodes.filter(node => {
      if (node._id === nodeId) {
        return false
      }
      if (node.children && node.children.length > 0) {
        node.children = deleteNode(node.children)
      }
      return true
    })
  }
  
  wbsNodes.value = deleteNode(wbsNodes.value)
  validateWBS()
}

function handleAddChild(parentNodeId?: string) {
  const newChild: WBSNode = {
    _id: `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    name: 'Novo pacote',
    description: '',
    level: 1,
    estimatedHours: 20,
  }
  
  const findAndAddChild = (nodes: WBSNode[]): boolean => {
    for (const node of nodes) {
      if (node._id === parentNodeId) {
        if (!node.children) {
          node.children = []
        }
        const parentLevel = node.level || 0
        newChild.level = parentLevel + 1
        node.children.push(newChild)
        return true
      }
      if (node.children && findAndAddChild(node.children)) {
        return true
      }
    }
    return false
  }
  
  if (findAndAddChild(wbsNodes.value)) {
    validateWBS()
    // Trigger re-render
    wbsNodes.value = JSON.parse(JSON.stringify(wbsNodes.value))
  }
}

function handleMoveNode(payload: { sourceId?: string; targetId?: string }) {
  const { sourceId, targetId } = payload
  if (!sourceId || !targetId) return

  // Find nodes and their parents
  interface NodeInfo {
    node: WBSNode | null
    parent: WBSNode | null
    index: number
  }

  const findNodeAndParent = (nodes: WBSNode[] | undefined, nodeId?: string, parent: WBSNode | null = null): NodeInfo => {
    // Accept undefined to avoid TS "object is possibly 'undefined'" when
    // calling with `node.children`. Guard early for undefined.
    if (!nodes || nodes.length === 0) {
      return { node: null, parent: null, index: -1 }
    }

    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i]._id === nodeId) {
        return { node: nodes[i], parent, index: i }
      }
      const childList = nodes[i].children
      if (childList && childList.length > 0) {
        const result = findNodeAndParent(childList, nodeId, nodes[i])
        if (result.node) return result
      }
    }
    return { node: null, parent: null, index: -1 }
  }

  const sourceInfo = findNodeAndParent(wbsNodes.value, sourceId)
  const targetInfo = findNodeAndParent(wbsNodes.value, targetId)

  if (!sourceInfo.node || !targetInfo.node) return

  // Check if they are siblings (same parent)
  const areSiblings = sourceInfo.parent === targetInfo.parent

  if (areSiblings && sourceInfo.parent) {
    // Reorder siblings
    const siblings = sourceInfo.parent.children || []
    if (sourceInfo.index !== -1) {
      // Remove source from its current position
      siblings.splice(sourceInfo.index, 1)
      // Insert before target
      const newTargetIndex = siblings.findIndex(n => n._id === targetId)
      if (newTargetIndex !== -1) {
        siblings.splice(newTargetIndex, 0, sourceInfo.node)
      } else {
        siblings.push(sourceInfo.node)
      }
    }
  } else if (areSiblings && !sourceInfo.parent) {
    // Reorder root level nodes
    const newTargetIndex = wbsNodes.value.findIndex(n => n._id === targetId)
    if (sourceInfo.index !== -1 && newTargetIndex !== -1) {
      const [removed] = wbsNodes.value.splice(sourceInfo.index, 1)
      wbsNodes.value.splice(newTargetIndex, 0, removed)
    }
  } else {
    // Move source as child of target
    let sourceNode: WBSNode | null = null

    // Extract source node
    const extractSource = (nodes: WBSNode[]): WBSNode[] => {
      return nodes.filter(node => {
        if (node._id === sourceId) {
          sourceNode = node
          return false
        }
        if (node.children && node.children.length > 0) {
          node.children = extractSource(node.children)
        }
        return true
      })
    }

    wbsNodes.value = extractSource(wbsNodes.value)

    if (!sourceNode) return

    // Add source as child of target
    const addToTarget = (nodes: WBSNode[]): boolean => {
      for (const node of nodes) {
        if (node._id === targetId) {
          if (!node.children) {
            node.children = []
          }
          const targetLevel = node.level || 0
          sourceNode!.level = targetLevel + 1
          node.children.push(sourceNode!)
          return true
        }
        if (node.children && addToTarget(node.children)) {
          return true
        }
      }
      return false
    }

    if (!addToTarget(wbsNodes.value)) {
      return
    }
  }

  validateWBS()
  // Trigger re-render
  wbsNodes.value = JSON.parse(JSON.stringify(wbsNodes.value))
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
  min-width: 0;
  padding: 1rem;
  background: rgba(255, 255, 255, 0.9);
  border-radius: 8px;
  overflow-y: auto;
  overflow-x: hidden;
  box-sizing: border-box;
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

.empty-state {
  text-align: center;
  padding: 1rem;
  margin-top: 1rem;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.wbs-content-wrapper {
  max-width: 100%;
  width: 92%;
  box-sizing: border-box;
}

.page-container.editing .wbs-content-wrapper {
  width: 80%;
}

.wbs-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}

.wbs-tree-container {
  max-height: 50vh;
  overflow: auto;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 0.5rem;
  background: #fafbfc;
  position: relative;
  z-index: 1;
  width: 100%;
  box-sizing: border-box;
  contain: layout;
}

.gap-1 {
  gap: 0.25rem;
}

.wbs-generate-btn {
  font-size: 0.75rem;
  height: 44px !important;
  min-height: 44px !important;
  max-height: 44px !important;
}

.right-page .v-card {
  max-width: 100%;
  box-sizing: border-box;
  min-width: 0;
}

.right-page .v-card-text {
  max-width: 100%;
  box-sizing: border-box;
  min-width: 0;
}

.right-page .v-btn {
  max-width: 100%;
  word-wrap: break-word;
  white-space: normal;
  height: auto !important;
  min-height: 36px;
}

.preview-list {
  max-height: 160px;
  overflow-y: auto;
  padding-right: 4px;
}

.edit-mode-actions {
  padding: 0.5rem 0;
}

.edit-mode-actions .v-btn {
  font-size: 0.75rem;
}
</style>
