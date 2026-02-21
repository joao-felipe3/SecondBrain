<template>
  <div class="leaf-details-column">
    <div v-if="currentLeaf && currentGeneratedResult">
      <div class="leaf-header">
        <h3 class="text-subtitle-1 mb-1">{{ currentLeaf.node.name }}</h3>
        <p class="text-caption text-medium-emphasis">{{ currentLeaf.path }}</p>
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
          <br />
          <strong>Diferença:</strong>
          <span :class="differenceClass">
            {{ (currentGeneratedResult.generatedHours - currentLeaf.node.estimatedHours) >= 0 ? '+' : '' }}
            {{ (currentGeneratedResult.generatedHours - currentLeaf.node.estimatedHours).toFixed(1) }}h
            ({{ differencePercentage.toFixed(0) }}%)
          </span>
          <div v-if="differencePercentage > 20" class="mt-2 font-weight-bold">
            ⚠️ Discrepância detectada
          </div>
        </div>
      </v-alert>

      <h4 class="text-subtitle-2 mt-4 mb-2">
        ✅ Micro-tarefas Geradas ({{ currentGeneratedResult.tasks?.length || 0 }})
      </h4>

      <div class="tasks-preview-container">
        <div
          v-if="!currentGeneratedResult.tasks || currentGeneratedResult.tasks.length === 0"
          class="text-caption text-medium-emphasis pa-3"
        >
          Nenhuma tarefa gerada
        </div>
        <v-slide-y-transition group>
          <div
            v-for="(task, idx) in currentGeneratedResult.tasks"
            :key="`task-${idx}`"
            class="task-item"
            @click="emit('task-clicked', task)"
          >
            <div class="task-header">
              <div class="task-title">
                <v-icon :icon="`mdi-${getTaskTypeIcon(task.microTaskType)}`" size="small" class="mr-2" />
                <span class="font-weight-medium">{{ task.name }}</span>
              </div>
              <v-chip size="x-small" :color="getPriorityColor(task.priority)" variant="tonal">
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
</template>

<script setup lang="ts">
import type { PropType } from 'vue'
import type { LeafNode } from '~/composables/features/useConversionHelpers'
import { useConversionHelpers } from '~/composables/features/useConversionHelpers'

defineProps({
  currentLeaf:           { type: Object as PropType<LeafNode | null>, default: null },
  currentGeneratedResult:{ type: Object as PropType<any | null>, default: null },
  differencePercentage:  { type: Number, required: true },
  differenceClass:       { type: String, required: true },
  budgetAlertType:       { type: String, required: true },
})

const emit = defineEmits<{
  'task-clicked': [task: any]
}>()

const { getPriorityColor, getTaskTypeIcon } = useConversionHelpers()
</script>

<style scoped>
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
  cursor: pointer;
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
