<template>
  <v-card elevation="1" class="mb-4">
    <v-card-title class="d-flex align-center gap-2" style="font-size: 1rem; font-weight: 500">
      <v-icon>mdi-link-variant</v-icon>
      Matriz de Rastreabilidade (RTM)
    </v-card-title>

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
        <v-card variant="tonal" color="info" class="mb-4">
          <v-card-text>
            <div class="d-flex align-center gap-2 mb-2">
              <v-icon :color="getValidationColor()">
                {{ getValidationIcon() }}
              </v-icon>
              <div>
                <strong>Cobertura: {{ matrixData.validation.coverage }}%</strong>
              </div>
            </div>

            <v-divider class="my-2" />

            <div class="text-caption">
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
        <div v-if="matrixData.requirements.length > 0" class="mb-4">
          <div class="text-subtitle-2 font-weight-bold mb-2">Mapeamento Requisito × Tarefa</div>

          <v-table density="compact" class="rtm-table">
            <thead>
              <tr>
                <th width="30%">Requisito</th>
                <th width="10%">Tipo</th>
                <th width="50%">Tarefas Rastreadas</th>
                <th width="10%">Status</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="req in matrixData.requirements"
                :key="req.id"
                :class="{ 'unmapped-row': !isRequirementMapped(req.id) }"
              >
                <td>
                  <div class="d-flex align-start justify-space-between gap-2">
                    <div class="text-caption">{{ req.description }}</div>
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
                  <v-chip
                    size="x-small"
                    variant="tonal"
                    :color="getTypeColor(req.type)"
                    class="mt-1"
                  >
                    {{ req.type }}
                  </v-chip>
                </td>

                <td>
                  <v-chip size="x-small" variant="outlined">
                    {{ req.type === 'functional' ? 'Func' : req.type === 'non_functional' ? 'NF' : 'Constraint' }}
                  </v-chip>
                </td>

                <td>
                  <div class="d-flex flex-wrap gap-1">
                    <v-chip
                      v-for="taskId in getTasksForRequirement(req.id)"
                      :key="taskId"
                      size="x-small"
                      variant="outlined"
                      closable
                      @click:close="unmapTask(req.id, taskId)"
                    >
                      {{ getTaskName(taskId) }}
                    </v-chip>

                    <!-- Add Task Button -->
                    <v-menu>
                      <template #activator="{ props }">
                        <v-btn
                          v-bind="props"
                          icon="mdi-plus"
                          size="x-small"
                          variant="text"
                          color="primary"
                        />
                      </template>

                      <v-list>
                        <v-list-item
                          v-for="task in getUnmappedTasks(req.id)"
                          :key="task.id"
                          @click="mapTask(req.id, task.id)"
                        >
                          <v-list-item-title class="text-caption">{{ task.name }}</v-list-item-title>
                        </v-list-item>
                      </v-list>
                    </v-menu>
                  </div>
                </td>

                <td>
                  <v-icon
                    :color="isRequirementMapped(req.id) ? 'success' : 'error'"
                    size="small"
                  >
                    {{ isRequirementMapped(req.id) ? 'mdi-check-circle' : 'mdi-alert-circle' }}
                  </v-icon>
                </td>
              </tr>
            </tbody>
          </v-table>
        </div>

        <!-- Actions -->
        <v-card-actions class="mt-4">
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
const loading = ref(false);
const autoGenerating = ref(false);
const autoMapping = ref(false);
const deletingRequirementId = ref<string | null>(null);
const matrixData = ref<MatrixData | null>(null);

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
  gap: 1rem;
}

.rtm-table {
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  overflow: hidden;
}

.unmapped-row {
  background-color: rgba(244, 67, 54, 0.05);
}

.rtm-table tr {
  border-bottom: 1px solid #f5f5f5;
}

.rtm-table td {
  padding: 0.75rem;
}

.rtm-table thead {
  background-color: #f5f5f5;
  font-weight: 600;
}
</style>
