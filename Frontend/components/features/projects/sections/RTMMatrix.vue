<template>
  <v-card elevation="1" class="mb-4 pa-0">
    <v-card-text v-if="!loading">
      <!-- Empty State -->
      <div v-if="!matrixData || matrixData.requirements.length === 0" class="text-center py-4">
        <v-icon size="48" color="grey">mdi-information</v-icon>
        <p class="text-medium-emphasis mt-2">
          Nenhum requisito definido. Crie uma Smart Objective e gere requisitos automaticamente.
        </p>
        <v-btn color="primary" variant="tonal" size="small" class="mt-3" @click="autoGenerateRequirements">
          Gerar Requisitos com IA
        </v-btn>
      </div>

      <!-- Matrix View -->
      <div v-else class="rtm-container">
        <!-- Validation Summary -->
        <v-card variant="tonal" color="info">
          <v-card-text style="cursor: pointer; padding: 0.65rem" @click="expandedValidation = !expandedValidation">
            <div class="d-flex align-center gap-2">
              <v-icon :color="getValidationColor()" class="mr-2">
                {{ getValidationIcon() }}
              </v-icon>
              <div>
                <strong>Cobertura: {{ matrixData.validation.coverage }}%</strong>
              </div>
              <v-icon :class="{ 'rotate-180': expandedValidation }">mdi-chevron-down</v-icon>
            </div>

            <v-divider v-if="expandedValidation" class="my-1" />

            <div class="text-caption" v-if="expandedValidation">
              <p v-if="matrixData.validation.isValid" class="text-success mb-0">
                ✓ Todos os {{ matrixData.requirements.length }} requisito(s) rastreado(s)!
              </p>
              <p v-else class="text-warning mb-0">
                ⚠ {{ matrixData.validation.unmappedRequirements.length }} requisito(s) sem rastreamento
              </p>
            </div>

          </v-card-text>
        </v-card>

        <!-- Matrix Table -->
        <div v-if="matrixData.requirements.length > 0" class="mb-4 table-container">
          <div class="text-subtitle-2 font-weight-bold mb-2">Mapeamento Requisito × Tarefa</div>

          <v-table class="rtm-table">
            <thead>
              <tr>
                <th style="min-width: 150px; text-align: center;">Requisito</th>
                <th style="width: 60px; text-align: center;">Tipo</th>
                <th style="width: 60px; text-align: center;">Tarefas</th>
                <th style="width: 40px; text-align: center;">Status</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="req in paginatedRequirements"
                :key="req.id"
                :class="{ 'unmapped-row': !isRequirementMapped(req.id) }"
              >

                <td class="requirement-cell">
                  <div class="requirement-wrapper">
                    <div 
                      class="text-caption font-weight-medium truncate-text"
                      :title="req.description"
                    >
                      {{ req.description }}
                    </div>
                  </div>
                </td>

                <td class="text-center compact-cell" style="padding: 0.025rem 0.1rem !important;">
                  <v-chip
                    size="x-small"
                    variant="tonal"
                    :color="getTypeColor(req.type)"
                    class="compact-chip"
                    label
                  >
                    {{ req.type === 'functional' ? 'Funcional' : req.type === 'non_functional' ? 'Não-Funcional' : 'Restrição' }}
                  </v-chip>
                </td>

                <td class="compact-cell" style="padding: 0.025rem 0.1rem !important;">
                  <v-btn
                    v-if="getTasksForRequirement(req.id).length > 0"
                    size="x-small"
                    variant="tonal"
                    color="primary"
                    class="compact-btn"
                    :text="`${getTasksForRequirement(req.id).length} Tasks`"
                    @click="openTasksDialog(req)"
                  />
                  <span v-else class="text-caption text-medium-emphasis">—</span>
                </td>

                <td class="text-center compact-cell" style="padding: 0.025rem 0.1rem !important;">
                  <div class="d-flex align-center justify-center gap-1">
                    <v-icon
                      :color="isRequirementMapped(req.id) ? 'success' : 'error'"
                      size="small"
                    >
                      {{ isRequirementMapped(req.id) ? 'mdi-check-circle' : 'mdi-alert-circle' }}
                    </v-icon>

                    <v-btn
                      icon="mdi-delete"
                      size="x-small"
                      variant="text"
                      color="error"
                      :loading="deletingRequirementId === req.id"
                      :disabled="loading || autoGenerating || deletingRequirementId !== null"
                      @click.stop="deleteRequirement(req.id)"
                    />
                  </div>
                </td>
              </tr>
            </tbody>
          </v-table>

          <!-- Pagination -->
          <div v-if="totalPages > 1" class="d-flex justify-center pagination-container">
            <v-pagination
              v-model="currentPage"
              :length="totalPages"
              :total-visible="6"
              color="primary"
            />
          </div>
        </div>

        <!-- Actions -->
        <v-card-actions class="mt-4 actions-row">
          <v-spacer />
          <v-btn
            v-if="matrixData.requirements.length > 0 && matrixData.validation.unmappedRequirements.length > 0"
            color="success"
            variant="tonal"
            size="small"
            prepend-icon="mdi-plus-circle"
            @click="generateTasksForUnmappedRequirements"
            :loading="loading"
            :disabled="autoGenerating || autoMapping"
          >
            Gerar Tarefas IA
          </v-btn>
          <v-btn
            v-if="matrixData.requirements.length > 0"
            color="error"
            variant="tonal"
            size="small"
            prepend-icon="mdi-delete-multiple"
            @click="deleteAllRequirements"
            :loading="loading"
          >
            Limpar Todos
          </v-btn>
          <v-btn
            v-if="matrixData.requirements.length > 0 && matrixData.tasks.length > 0"
            color="info"
            variant="tonal"
            size="small"
            prepend-icon="mdi-brain"
            @click="autoMapRequirements"
            :loading="autoMapping"
            :disabled="loading || autoGenerating"
          >
            Auto-Map IA
          </v-btn>
          <v-btn
            color="primary"
            variant="tonal"
            size="small"
            prepend-icon="mdi-refresh"
            @click="loadMatrix"
            :loading="loading"
          >
            Atualizar
          </v-btn>
          <v-btn
            color="primary"
            variant="tonal"
            size="small"
            prepend-icon="mdi-robotics"
            @click="autoGenerateRequirements"
            :loading="autoGenerating"
          >
            Gerar Requisitos IA
          </v-btn>
        </v-card-actions>
      </div>
    </v-card-text>

    <!-- Loading -->
    <v-card-text v-else class="text-center py-8">
      <v-progress-circular indeterminate color="primary" />
      <p class="text-medium-emphasis mt-2">Carregando matriz de rastreabilidade...</p>
    </v-card-text>
  </v-card>

  <!-- Dialog: Tasks for Requirement -->
  <v-dialog v-model="selectedRequirementDialog" max-width="800">
    <v-card>
      <v-card-title class="d-flex justify-space-between align-center pa-3">
        <div 
          class="text-h6 flex-grow-1 text-truncate"
          :title="selectedRequirement?.description"
        >
          {{ selectedRequirement?.description }}
        </div>
        <v-btn icon="mdi-close" variant="text" size="small" @click="selectedRequirementDialog = false" />
      </v-card-title>

      <v-divider />

      <v-card-text class="py-4">
        <div class="text-caption text-medium-emphasis mb-3">
          {{ getTasksForRequirement(selectedRequirement?.id || '').length }} tarefa(s) mapeada(s)
        </div>

        <div class="tasks-list">
          <div
            v-for="taskId in getTasksForRequirement(selectedRequirement?.id || '')"
            :key="taskId"
            class="task-item mb-2 pa-3"
          >
            <div class="d-flex justify-space-between align-center">
              <div class="flex-grow-1 min-width-0">
                <div 
                  class="text-body-2 font-weight-medium truncate-text"
                  :title="getTaskName(taskId)"
                >
                  {{ getTaskName(taskId) }}
                </div>
                <div 
                  class="text-caption text-medium-emphasis truncate-text"
                  :title="taskId"
                >
                  ID: {{ taskId }}
                </div>
              </div>
              <v-btn
                icon="mdi-close"
                size="x-small"
                variant="text"
                color="error"
                @click="unmapTask(selectedRequirement?.id || '', taskId)"
              />
            </div>
          </div>

          <div v-if="getTasksForRequirement(selectedRequirement?.id || '').length === 0" class="text-center py-4">
            <p class="text-medium-emphasis">Nenhuma tarefa mapeada</p>
          </div>
        </div>

        <!-- Add Task to Requirement -->
        <v-divider class="my-4" />
        <div class="text-caption text-medium-emphasis mb-2">Adicionar Tarefa</div>
        
        <!-- Task Autocomplete -->
        <v-autocomplete
          v-model="selectedTaskId"
          :items="groupedTasksForAutocomplete"
          item-title="name"
          item-value="id"
          placeholder="Digite o nome ou ID da tarefa..."
          density="compact"
          prepend-icon="mdi-magnify"
          clearable
          auto-select-first
          hide-details
          :search="taskSearchQuery"
          @update:model-value="(val: any) => val && handleTaskSelected(selectedRequirement?.id || '', val)"
          @input="(val: any) => taskSearchQuery = typeof val === 'string' ? val : ''"
        >
          <template #item="{ props, item }">
            <v-list-item v-bind="props" class="text-body-2">
              <v-list-item-subtitle class="text-caption">{{ item.raw.wbsNodeName }}</v-list-item-subtitle>
            </v-list-item>
          </template>

          <template #no-data>
            <div class="pa-4 text-center">
              <v-icon color="grey" size="32" class="mb-2">mdi-database-search</v-icon>
              <p class="text-caption text-medium-emphasis">
                {{ taskSearchQuery ? 'Nenhuma tarefa encontrada' : 'Digite para buscar tarefas' }}
              </p>
            </div>
          </template>
        </v-autocomplete>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useApi } from '~/composables/api';

interface Requirement {
  id: string;
  description: string;
  type: string;
  status: string;
}

interface Task {
  id: string;
  name: string;
  wbsNodeId?: string;
  wbsNodeName?: string;
}

interface MatrixData {
  requirements: Requirement[];
  tasks: Task[];
  matrix: Record<string, string[]>;
  validation: {
    isValid: boolean;
    coverage: number;
    unmappedRequirements: string[];
    risks: string[];
  };
}

const props = defineProps<{
  projectId: string;
  smartObjective?: any;
}>();

// State
const expandedValidation = ref(false);
const currentPage = ref(1);
const itemsPerPage = 5;
const loading = ref(false);
const autoGenerating = ref(false);
const autoMapping = ref(false);
const deletingRequirementId = ref<string | null>(null);
const matrixData = ref<MatrixData | null>(null);

// Dialog state
const selectedRequirementDialog = ref(false);
const selectedRequirement = ref<Requirement | null>(null);
const taskSearchQuery = ref('');
const selectedTaskId = ref<string | null>(null);

// Computed
const getValidationColor = () => {
  if (!matrixData.value) return 'grey';
  if (matrixData.value.validation.isValid) return 'success';
  if (matrixData.value.validation.coverage >= 80) return 'warning';
  return 'error';
};

const getValidationIcon = () => {
  if (!matrixData.value) return 'mdi-information';
  if (matrixData.value.validation.isValid) return 'mdi-check-circle';
  if (matrixData.value.validation.coverage >= 80) return 'mdi-alert-circle';
  return 'mdi-alert-octagon';
};

// Computed for autocomplete tasks
const groupedTasksForAutocomplete = computed(() => {
  const requirementId = selectedRequirement.value?.id || '';
  const unmappedTasks = getUnmappedTasks(requirementId);
  
  if (unmappedTasks.length === 0) return [];

  // Filter by search query
  let filtered = unmappedTasks;
  if (taskSearchQuery.value.trim()) {
    const query = taskSearchQuery.value.toLowerCase();
    filtered = unmappedTasks.filter((task) => 
      task.name.toLowerCase().includes(query) || 
      task.id.toLowerCase().includes(query)
    );
  }

  // Return filtered tasks with WBS info - autocomplete will handle grouping
  return filtered.map(task => ({
    id: task.id,
    name: `${task.name}`,
    wbsNodeId: task.wbsNodeId,
    wbsNodeName: task.wbsNodeName || 'Sem WBS',
  }));
});

// Computed for paginated requirements
const paginatedRequirements = computed(() => {
  if (!matrixData.value) return [];
  const startIndex = (currentPage.value - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  return matrixData.value.requirements.slice(startIndex, endIndex);
});

const totalPages = computed(() => {
  if (!matrixData.value) return 0;
  return Math.ceil(matrixData.value.requirements.length / itemsPerPage);
});

// Methods
const loadMatrix = async () => {
  if (!props.projectId) return;

  loading.value = true;
  try {
    const { get } = useApi(`/projects/${props.projectId}/rtm-matrix`);
    const { data, error } = await get();

    if (error) {
      console.error('Erro ao carregar matriz RTM:', error);
      return;
    }

    if (data && data.success) {
      matrixData.value = {
        requirements: data.requirements || [],
        tasks: data.tasks || [],
        matrix: data.matrix || {},
        validation: data.validation,
      };
      currentPage.value = 1; // Reset pagination when data loads
      
      // Debug: log WBS data availability
      if (process.env.NODE_ENV === 'development') {
        const tasksWithWBS = matrixData.value.tasks.filter((t: any) => t.wbsNodeId).length;
        console.debug('[RTM] Matrix loaded:', {
          totalTasks: matrixData.value.tasks.length,
          tasksWithWBS,
          sampleTask: matrixData.value.tasks[0],
          requirements: matrixData.value.requirements.length,
        });
      }
    }
  } catch (err) {
    console.error('Erro buscando matriz RTM:', err);
  } finally {
    loading.value = false;
  }
};

const autoGenerateRequirements = async () => {
  if (!props.projectId) return;

  autoGenerating.value = true;
  try {
    const { post } = useApi(`/projects/${props.projectId}/requirements/auto-generate`);
    const { data, error } = await post({ smartObjective: props.smartObjective });

    if (error) {
      console.error('Erro ao gerar requisitos:', error);
      return;
    }

    // Recarregar matriz
    await loadMatrix();
  } catch (err) {
    console.error('Erro gerando requisitos:', err);
  } finally {
    autoGenerating.value = false;
  }
};

const openTasksDialog = (requirement: Requirement) => {
  selectedRequirement.value = requirement;
  taskSearchQuery.value = '';
  selectedTaskId.value = null;
  selectedRequirementDialog.value = true;
};

const mapTask = async (requirementId: string, taskId: string) => {
  if (!props.projectId) return;

  try {
    const { post } = useApi(`/projects/${props.projectId}/requirements/map`);
    const { data, error } = await post({ requirementId, taskId });

    if (error) {
      console.error('Erro ao mapear tarefa:', error);
      return;
    }

    // Recarregar matriz
    await loadMatrix();
  } catch (err) {
    console.error('Erro mapeando tarefa:', err);
  }
};

const mapTaskFromDialog = async (requirementId: string, taskId: string) => {
  if (!taskId) return;
  await mapTask(requirementId, taskId);
};

const handleTaskSelected = async (requirementId: string, taskId: string) => {
  if (!taskId) return;
  await mapTask(requirementId, taskId);
  // Reset search and selected task after mapping
  taskSearchQuery.value = '';
  selectedTaskId.value = null;
};

const unmapTask = async (requirementId: string, taskId: string) => {
  if (!props.projectId) return;

  try {
    const { post } = useApi(`/projects/${props.projectId}/requirements/unmap`);
    const { data, error } = await post({ requirementId, taskId });

    if (error) {
      console.error('Erro ao remover mapeamento:', error);
      return;
    }

    // Recarregar matriz
    await loadMatrix();
  } catch (err) {
    console.error('Erro removendo mapeamento:', err);
  }
};

const deleteRequirement = async (requirementId: string) => {
  if (!requirementId) return;

  const ok = window.confirm('Excluir este requisito? Essa ação não pode ser desfeita.');
  if (!ok) return;

  deletingRequirementId.value = requirementId;
  try {
    const { remove } = useApi(`/projects/requirements/${requirementId}`);
    const { error } = await remove();

    if (error) {
      console.error('Erro ao excluir requisito:', error);
      return;
    }

    await loadMatrix();
  } catch (err) {
    console.error('Erro excluindo requisito:', err);
  } finally {
    deletingRequirementId.value = null;
  }
};

const deleteAllRequirements = async () => {
  if (!props.projectId) return;

  const ok = window.confirm(
    `Excluir TODOS os ${matrixData.value?.requirements.length || 0} requisito(s)? Essa ação não pode ser desfeita.`,
  );
  if (!ok) return;

  loading.value = true;
  try {
    const { remove } = useApi(`/projects/${props.projectId}/requirements`);
    const { error } = await remove();

    if (error) {
      console.error('Erro ao excluir todos os requisitos:', error);
      return;
    }

    await loadMatrix();
  } catch (err) {
    console.error('Erro excluindo todos os requisitos:', err);
  } finally {
    loading.value = false;
  }
};

const autoMapRequirements = async () => {
  if (!props.projectId) return;

  const ok = window.confirm(
    'Auto-mapear tarefas para requisitos usando IA? Isso pode levar alguns minutos com muitas tarefas.',
  );
  if (!ok) return;

  autoMapping.value = true;
  try {
    const { post } = useApi(`/projects/${props.projectId}/requirements/auto-map`);
    const { data, error } = await post({});

    if (error) {
      console.error('Erro ao auto-mapear requisitos:', error);
      return;
    }

    if (data && data.success) {
      console.log(
        `[Auto-Map] ${data.mappedCount} tarefas mapeadas, ${data.createdRequirementsCount} requisitos criados, ${data.coverage}% cobertura`,
      );
    }

    // Recarregar matriz
    await loadMatrix();
  } catch (err) {
    console.error('Erro auto-mapeando requisitos:', err);
  } finally {
    autoMapping.value = false;
  }
};

const generateTasksForUnmappedRequirements = async () => {
  if (!props.projectId) return;

  const unmappedCount = matrixData.value?.validation.unmappedRequirements.length || 0;
  if (unmappedCount === 0) {
    window.alert('Todos os requisitos já possuem tarefas mapeadas!');
    return;
  }

  const ok = window.confirm(
    `Gerar tarefas para ${unmappedCount} requisito(s) sem mapeamento? Isso pode levar alguns minutos.`,
  );
  if (!ok) return;

  loading.value = true;
  try {
    const { post } = useApi(
      `/projects/${props.projectId}/tasks/auto-generate-from-unmapped-requirements`,
    );
    const { data, error } = await post({});

    if (error) {
      console.error('Erro ao gerar tarefas:', error);
      return;
    }

    if (data && data.success) {
      console.log(
        `[Gen Tasks] ${data.createdTasksCount} tarefas criadas, ${data.coverage}% cobertura final`,
      );
    }

    // Recarregar matriz
    await loadMatrix();
  } catch (err) {
    console.error('Erro gerando tarefas:', err);
  } finally {
    loading.value = false;
  }
};

const isRequirementMapped = (requirementId: string): boolean => {
  if (!matrixData.value) return false;
  const tasks = matrixData.value.matrix[requirementId];
  return Array.isArray(tasks) && tasks.length > 0;
};

const getTasksForRequirement = (requirementId: string): string[] => {
  if (!matrixData.value) return [];
  return matrixData.value.matrix[requirementId] || [];
};

const getTaskName = (taskId: string): string => {
  if (!matrixData.value) return 'Task';
  const task = matrixData.value.tasks.find((t) => t.id === taskId);
  return task?.name || 'Task';
};

const getUnmappedTasks = (requirementId: string): Task[] => {
  if (!matrixData.value) return [];
  const mapped = getTasksForRequirement(requirementId);
  return matrixData.value.tasks.filter((t) => !mapped.includes(t.id));
};

const getTypeColor = (type: string): string => {
  switch (type) {
    case 'functional':
      return 'primary';
    case 'non_functional':
      return 'warning';
    case 'constraint':
      return 'error';
    default:
      return 'grey';
  }
};


// Lifecycle
onMounted(() => {
  loadMatrix();
});

// Watchers
watch(() => props.projectId, () => {
  loadMatrix();
});

// Expose methods
defineExpose({
  loadMatrix,
  autoGenerateRequirements,
  deleteAllRequirements,
  autoMapRequirements,
  generateTasksForUnmappedRequirements,
});
</script>

<style scoped>
.rtm-container {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.table-container {
  margin-left: -6px;
  margin-right: -6px;
  width: calc(100% + 12px);
}

.rotate-180 {
  transform: rotate(180deg);
  transition: transform 0.2s ease-in-out;
}

.rtm-table {
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  overflow: hidden;
  width: 100%;
}

.unmapped-row {
  background-color: rgba(244, 67, 54, 0.05);
}

.rtm-table tr {
  border-bottom: 1px solid #f5f5f5;
}

.rtm-table td {
  vertical-align: middle;
  height: auto;
  min-height: 32px;
  padding: 0.15rem 0.25rem !important;
}

.rtm-table .compact-cell {
  padding: 0.05rem 0.1rem !important;
}

.rtm-table tbody .compact-cell {
  padding: 0.05rem 0.1rem !important;
}

.rtm-table thead {
  background-color: #f5f5f5;
  font-weight: 600;
}

.rtm-table thead th {
  padding: 0.02rem 0.15rem !important;
  font-size: 0.85rem;
  height: 36px !important;
  line-height: 1 !important;
}

.tasks-list {
  max-height: 400px;
  overflow-y: auto;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
}

.task-item {
  border-bottom: 1px solid #f5f5f5;
  background-color: #fafafa;
}

.task-item:last-child {
  border-bottom: none;
}

.task-item:hover {
  background-color: #f0f0f0;
}

.truncate-text {
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: default;
  width: 100%;
  max-width: 100%;
  min-width: 0;
}

.min-width-0 {
  min-width: 0;
}

.compact-chip {
  height: 20px !important;
  font-size: 0.6rem !important;
  padding: 0 6px !important;
}

.compact-btn {
  height: 24px !important;
  font-size: 0.55rem !important;
  padding: 0 6px !important;
}

.requirement-cell {
  padding: 0.25rem 0.35rem !important;
  max-width: 1px;
}

.requirement-wrapper {
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  width: 100%;
  min-width: 0;
  line-height: 1.4;
}

.requirement-cell .truncate-text {
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  width: 100%;
  line-height: 1.4;
  white-space: normal;
  word-wrap: break-word;
  font-size: 0.65rem !important;
}

.actions-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}

:deep(.v-pagination) {
  gap: 0.15rem;
}

:deep(.v-pagination .v-btn) {
  min-width: 28px !important;
  height: 28px !important;
  font-size: 0.7rem !important;
}

.pagination-container {
  width: 100%;
  max-width: 100%;
  justify-content: center;
  margin-top: 0.5rem;
}
</style>
