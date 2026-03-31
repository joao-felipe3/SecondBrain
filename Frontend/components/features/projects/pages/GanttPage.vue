<template>
  <v-sheet class="gantt-full-page" elevation="0" color="transparent" @click.stop>
    <v-card elevation="1" class="control-bar mb-3">
      <v-card-text class="d-flex align-center flex-wrap ga-3 py-3">
        <h3 class="page-title ma-0">Gantt</h3>

        <v-chip size="small" color="primary" variant="tonal">
          {{ ganttTasks.length }} tarefas
        </v-chip>

        <v-switch
          v-model="includeCompleted"
          label="Incluir concluidas"
          density="compact"
          hide-details
          inset
          @update:model-value="reload"
        />

        <v-btn
          color="primary"
          size="small"
          prepend-icon="mdi-refresh"
          :loading="loading"
          @click="reload"
        >
          Atualizar
        </v-btn>
      </v-card-text>
    </v-card>

    <v-alert v-if="error" type="error" variant="tonal" density="compact" class="mb-3">
      {{ error }}
    </v-alert>

    <v-expansion-panels v-if="alerts.length" variant="accordion" class="mb-3">
      <v-expansion-panel>
        <v-expansion-panel-title>Alertas da analise</v-expansion-panel-title>
        <v-expansion-panel-text>
          <div v-for="(item, index) in alerts" :key="`alert-${index}`" class="text-caption mb-1">
            - {{ item }}
          </div>
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>

    <v-skeleton-loader v-if="loading" type="image" class="chart-shell" />

    <div v-else-if="isMobile">
      <v-card elevation="1" class="chart-shell">
        <v-card-title class="text-subtitle-2">Lista Compacta (mobile)</v-card-title>
        <v-card-text>
          <v-table density="compact">
            <thead>
              <tr>
                <th>Tarefa</th>
                <th class="text-right">Dur.</th>
                <th class="text-right">Prog.</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="task in ganttTasks" :key="task.id">
                <td>{{ task.name }}</td>
                <td class="text-right">{{ task.durationHours.toFixed(1) }}h</td>
                <td class="text-right">{{ Math.round(task.progress) }}%</td>
              </tr>
            </tbody>
          </v-table>
        </v-card-text>
      </v-card>
    </div>

    <GanttChartVisualization
      v-else
      :tasks="ganttTasks"
      :dependencies="dependencies"
      :critical-path="criticalPath"
      class="chart-shell"
    />
  </v-sheet>
</template>

<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import type { Project } from '~/models/Project'
import { useDisplay } from 'vuetify'
import { useGanttData } from '~/composables/features/useGanttData'
import GanttChartVisualization from '../visualization/GanttChartVisualization.vue'

const props = defineProps<{
  project: Project | Record<string, any> | null
  editing?: boolean
}>()

const projectId = computed(() => {
  return (props.project as any)?._id || (props.project as any)?.id || ''
})

const { mobile } = useDisplay()
const isMobile = computed(() => mobile.value)

const {
  loading,
  error,
  includeCompleted,
  ganttTasks,
  dependencies,
  criticalPath,
  alerts,
  load,
} = useGanttData(() => String(projectId.value || ''))

const reload = async () => {
  await load()
}

onMounted(reload)

watch(projectId, () => {
  reload()
})
</script>

<style scoped>
.gantt-full-page {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.control-bar {
  border: 1px solid rgba(0, 0, 0, 0.06);
}

.chart-shell {
  flex: 1;
  min-height: 0;
}

.page-title {
  font-size: 1.05rem;
  font-weight: 700;
}
</style>
