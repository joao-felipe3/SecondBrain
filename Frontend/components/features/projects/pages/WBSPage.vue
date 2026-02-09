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
            @suggest-decomposition="handleSuggestDecomposition"
          />
        </div>
      </div>
    </v-sheet>

    <!-- RIGHT PAGE -->
    <v-sheet class="page right-page" elevation="0" color="transparent" @click.stop>
      <div v-if="hasWBS">
        <h3 class="mb-2">📋 Ações</h3>

        <!-- Preview & Preferences -->
        <v-card elevation="1" class="mb-3" @click.stop>
          <v-card-text style="padding: 0.75rem;">
            <div class="d-flex align-center mb-2">
              <v-icon color="info" size="20" class="mr-2">mdi-eye-outline</v-icon>
              <span class="text-body-2 font-weight-medium">Preview por módulos/temas</span>
            </div>

            <div v-if="themePreview.length" class="theme-preview">
              <div
                v-for="t in themePreview"
                :key="t.theme"
                class="d-flex align-center justify-space-between py-1"
              >
                <span class="text-caption font-weight-medium">{{ t.theme }}</span>
                <div class="d-flex align-center" style="gap: 0.25rem;">
                  <v-chip size="x-small" variant="tonal" color="primary">
                    {{ t.count }} pacotes
                  </v-chip>
                  <v-chip size="x-small" variant="tonal" color="info">
                    {{ Math.round(t.hours) }}h
                  </v-chip>
                </div>
              </div>
              <v-divider class="my-2" />
            </div>
            <p v-else class="text-caption text-medium-emphasis">
              Nenhum pacote disponível para preview.
            </p>

            <div class="mt-3">
              <v-select
                v-model="granularityPomodoros"
                :items="granularityOptions"
                label="Granularidade (pomodoros)"
                density="compact"
                variant="outlined"
                hide-details
              />
            </div>

            <div class="mt-3">
              <v-select
                v-model="workflowMixPreset"
                :items="workflowMixOptions"
                label="Mix de tipos"
                density="compact"
                variant="outlined"
                hide-details
              />
              <p class="text-caption text-medium-emphasis mt-1">
                {{ workflowMixDescription }}
              </p>
            </div>
          </v-card-text>
        </v-card>

        <!-- Convert to Tasks -->
        <v-card elevation="1" class="mb-3" @click.stop>
          <v-card-text style="padding: 0.75rem;">
            <div class="d-flex align-center mb-2">
              <v-icon color="primary" size="20" class="mr-2">mdi-checkbox-multiple-marked-outline</v-icon>
              <span class="text-body-2 font-weight-medium">Converter em Micro-tarefas (≤3h)</span>
            </div>
            <p class="text-caption text-medium-emphasis mb-2">
              Transforma cada <strong>pacote de trabalho (8/80)</strong> em várias <strong>micro-tarefas (≤3h)</strong>.
            </p>
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
              Converter {{ totalLeafNodes }} pacotes em micro-tarefas
            </v-btn>
            <p v-if="!validation?.valid" class="text-caption text-warning mt-1">
              Corrija as violações 8/80 antes de converter
            </p>
          </v-card-text>
        </v-card>

        <!-- Save WBS -->
        <v-card elevation="1" class="mb-3" @click.stop>
          <v-card-text style="padding: 0.75rem;">
            <div class="d-flex align-center mb-2">
              <v-icon color="success" size="20" class="mr-2">mdi-content-save-outline</v-icon>
              <span class="text-body-2 font-weight-medium">Salvar WBS</span>
            </div>
            <p class="text-caption text-medium-emphasis mb-2">
              Persiste a WBS no banco de dados vinculada ao projeto.
            </p>
            <v-btn
              color="success"
              size="small"
              variant="tonal"
              prepend-icon="mdi-content-save"
              :loading="savingWBS"
              block
              @click.stop="saveWBS"
            >
              Salvar WBS
            </v-btn>
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
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import type { PropType } from 'vue'
import WBSTreeView from '../sections/WBSTreeView.vue'
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
    
    console.log('🔍 Dados carregados do backend:', JSON.stringify(response.data.nodes, null, 2))
    
    if (response.data.nodes && response.data.nodes.length > 0) {
      // Criar uma cópia profunda para evitar mutações inesperadas
      wbsNodes.value = JSON.parse(JSON.stringify(response.data.nodes))
      
      // Revalidar após carregar para garantir consistência
      validateWBS()
      
      console.log('✅ WBS carregada com', totalLeafNodes.value, 'pacotes e', totalHours.value, 'horas')
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

    console.log('🎉 WBS gerada pelo backend:', JSON.stringify(response.data.nodes, null, 2))
    
    wbsNodes.value = response.data.nodes
    validation.value = response.data.validation
    
    console.log('✅ WBS aplicada com', totalLeafNodes.value, 'pacotes e', totalHours.value, 'horas')
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
    
    console.log('💾 Salvando WBS com', totalLeafNodes.value, 'pacotes e', totalHours.value, 'horas')
    console.log('💾 Dados sendo enviados:', JSON.stringify(wbsNodes.value, null, 2))
    
    await $api.post(`/projects/${props.project._id}/save-wbs`, {
      nodes: wbsNodes.value,
    })
    console.log('✅ WBS salva com sucesso!')
    // NÃO fazer emit('wbs-updated') aqui para evitar fechar o modal
  } catch (error) {
    console.error('Erro ao salvar WBS:', error)
    alert('Erro ao salvar WBS.')
  } finally {
    savingWBS.value = false
  }
}

async function convertToTasks() {
  if (!props.project?._id || wbsNodes.value.length === 0) return

  converting.value = true
  console.log('🔄 Iniciando conversão de tarefas...')
  try {
    const { $api } = useNuxtApp() as any
    const response = await $api.post(`/projects/${props.project._id}/wbs/convert-to-tasks`, {
      nodes: wbsNodes.value,
      preferences: {
        targetPomodoros: granularityPomodoros.value,
        workflowMix: buildWorkflowMix(),
      },
    })

    console.log('✅ Conversão bem-sucedida:', response.data.message)
    conversionResult.value = response.data.message
    // NÃO fazer emit('wbs-updated') aqui para evitar fechar o modal
  } catch (error) {
    console.error('❌ Erro ao converter WBS em tarefas:', error)
    alert('Erro ao converter WBS em micro-tarefas.')
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

function applySuggestion() {
  if (!parsedSuggestion.value || !suggestionTargetNode.value) return
  
  // Ajustar o level dos children sugeridos para parent.level + 1
  const targetLevel = suggestionTargetNode.value.level
  const adjustedChildren = parsedSuggestion.value.map(child => ({
    ...child,
    level: targetLevel + 1
  }))
  
  console.log(`🔧 Ajustando children de level ${parsedSuggestion.value[0]?.level} para ${targetLevel + 1}`)
  
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
  
  alert('✅ Sugestão aplicada com sucesso! Lembre-se de salvar a WBS.')
}

function dismissSuggestion() {
  decompositionSuggestion.value = ''
  parsedSuggestion.value = null
  suggestionTargetNode.value = null
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
  width: 100%;
  box-sizing: border-box;
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
</style>
