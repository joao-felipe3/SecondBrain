<template>
  <v-col cols="3" class="py-1 d-flex flex-column justify-center task-sidebar">
    <div class="bells-row">
      <SettingsDialog :user-id="userId">
        <template #activator="{ props, open }">
          <v-btn
            v-bind="props"
            class="habit-reminder-bell"
            variant="tonal"
            color="brown-darken-2"
            icon
            size="large"
            :aria-label="dueTodayCount > 0 ? `${dueTodayCount} hábitos com lembrete hoje` : 'Lembretes de hábitos'"
            :title="dueTodayCount > 0 ? `${dueTodayCount} hábitos com lembrete hoje` : 'Lembretes de hábitos'"
            @click="open"
          >
            <v-badge color="error" :content="dueTodayCount" :model-value="dueTodayCount > 0" offset-x="2" offset-y="2">
              <v-icon icon="mdi-bell-outline" size="28" />
            </v-badge>
          </v-btn>
        </template>
      </SettingsDialog>

      <v-menu location="right" :close-on-content-click="false">
        <template #activator="{ props }">
          <v-btn
            v-bind="props"
            class="alerts-bell"
            variant="tonal"
            color="brown-darken-2"
            icon
            size="large"
            aria-label="Alertas"
            title="Alertas"
          >
            <v-badge
              color="error"
              :content="unreadCount"
              :model-value="unreadCount > 0"
              offset-x="2"
              offset-y="2"
            >
              <v-icon icon="mdi-bell-alert-outline" size="28" />
            </v-badge>
          </v-btn>
        </template>

        <v-card class="alerts-panel" elevation="6">
          <v-card-title class="alerts-title">Alerts</v-card-title>
          <v-divider />

          <v-card-text class="alerts-content">
            <div v-if="alerts.length === 0" class="alerts-empty">No alerts</div>
            <v-list v-else density="compact" class="alerts-list">
              <v-list-item
                v-for="alert in alerts"
                :key="alert._id"
                class="alerts-item"
                @click="handleRead(alert._id)"
              >
                <v-list-item-title>
                  <span :class="['alert-type', `alert-${alert.type}`]">{{ alert.type }}</span>
                  {{ alert.message }}
                </v-list-item-title>
                <v-list-item-subtitle v-if="alert.recommendation">
                  {{ alert.recommendation }}
                </v-list-item-subtitle>
                <v-list-item-subtitle class="alerts-time">
                  {{ formatDate(alert.createdAt) }}
                </v-list-item-subtitle>
              </v-list-item>
            </v-list>
          </v-card-text>
        </v-card>
      </v-menu>
    </div>


    <TaskFiltersPanel
      :projects="projects"
      :project-filter="projectFilter"
      :type-filter="typeFilter"
      :priority-filter="priorityFilter"
      @update:project-filter="$emit('update:projectFilter', $event)"
      @update:type-filter="$emit('update:typeFilter', $event)"
      @update:priority-filter="$emit('update:priorityFilter', $event)"
    />

  </v-col>
</template>

<script setup>
  import TaskProjectList from '../widgets/ProjectList.vue'
  import TaskFiltersPanel from '../widgets/FiltersPanel.vue'
  import TaskCalendar from '../widgets/Calendar.vue'
  import WoodPanel from '../../../ui/panels/WoodPanel.vue'
  import { computed, onMounted } from 'vue'
  import { useAlertsStore } from '~/stores/alerts'
  import SettingsDialog from '../../../shared/dialogs/SettingsDialog.vue'
  
  const props = defineProps({
    projects: Array,
    projectFilter: String,
    typeFilter: String,
    priorityFilter: String,
    dueTodayCount: {
      type: Number,
      default: 0,
    },
  })

  const alertsStore = useAlertsStore()
  const alerts = computed(() => alertsStore.alerts)
  const unreadCount = computed(() => alertsStore.unreadCount)

  const userId = computed(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('userId') || 'default-user'
    }
    return 'default-user'
  })

  function formatDate(value) {
    if (!value) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    return date.toLocaleString()
  }

  async function handleRead(id) {
    await alertsStore.markRead(id)
  }

  onMounted(async () => {
    await alertsStore.loadAlerts()
  })

  defineEmits([
    'update:projectFilter',
    'update:typeFilter',
    'update:priorityFilter',
    'request-habit-notifications',
  ])
</script>

<style scoped>
.task-sidebar {
  min-height: 60vh;
  overflow: visible;
  margin-left: -2%;
  margin-top: -3%;
  z-index: 2;
}

@media (max-width: 960px) {
  .task-sidebar {
    min-height: 100vh;
  }
}

@media (orientation: landscape) and (max-height: 600px) {
  .task-sidebar {
    max-height: 100vh;
    overflow-y: auto;
  }
}

.habit-reminder-bell {
  align-self: center;
  min-width: 64px;
  min-height: 64px;
  margin-bottom: 1rem;
  border: 2px solid rgba(212, 165, 116, 0.7);
  background: linear-gradient(135deg, rgba(253, 250, 243, 0.96), rgba(245, 237, 226, 0.96));
  box-shadow: 0 8px 20px rgba(61, 40, 23, 0.12);
}

.alerts-bell {
  align-self: center;
  min-width: 64px;
  min-height: 64px;
  margin-bottom: 1rem;
  border: 2px solid rgba(212, 165, 116, 0.7);
  background: linear-gradient(135deg, rgba(253, 250, 243, 0.96), rgba(245, 237, 226, 0.96));
  box-shadow: 0 8px 20px rgba(61, 40, 23, 0.12);
}

.bells-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-left: -3rem;
}


.alerts-panel {
  min-width: 320px;
  max-width: 420px;
}

.alerts-title {
  font-weight: 600;
}

.alerts-content {
  max-height: 360px;
  overflow: auto;
}

.alerts-empty {
  color: #5f5f5f;
  text-align: center;
  padding: 12px 0;
}

.alerts-item {
  cursor: pointer;
}

.alerts-time {
  font-size: 12px;
  opacity: 0.8;
}

.alert-type {
  display: inline-block;
  min-width: 72px;
  text-transform: uppercase;
  font-size: 11px;
  margin-right: 6px;
}

.alert-warning {
  color: #b36b00;
}

.alert-error {
  color: #a52828;
}

.alert-info {
  color: #2b5db3;
}
</style>
