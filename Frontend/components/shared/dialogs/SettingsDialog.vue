<template>
  <v-dialog v-model="dialog" max-width="400px" @update:model-value="onDialogChange">
    <template #activator="{ props: activatorProps }">
      <slot name="activator" :props="activatorProps" :open="openDialog" :is-silenced="isSilenced">
        <v-btn
          icon="mdi-bell"
          variant="text"
          size="small"
          v-bind="activatorProps"
          @click="openDialog"
          class="notification-btn"
        >
          <v-icon
            v-if="!isSilenced"
            size="small"
            class="bell-icon"
          >mdi-bell</v-icon>
          <v-icon
            v-else
            size="small"
            class="bell-icon-muted"
          >mdi-bell-off</v-icon>
        </v-btn>
      </slot>
    </template>

    <v-card class="settings-card">
      <v-card-title class="d-flex align-center ga-2">
        <v-icon>mdi-cog</v-icon>
        Configurações de Notificações
      </v-card-title>

      <v-card-text class="pa-6">
        <div class="settings-section">
          <v-checkbox
            v-model="localSettings.silenceNotifications"
            label="Silenciar notificações"
            description="Desabilita todas as notificações de hábitos e tarefas"
            @update:model-value="onSettingsChange"
          />
        </div>

        <v-divider class="my-4" />

        <div class="settings-section">
          <v-checkbox
            v-model="localSettings.soundEnabled"
            label="Habilitar som"
            description="Toca som ao receber notificações"
            :disabled="localSettings.silenceNotifications"
            @update:model-value="onSettingsChange"
          />
        </div>

        <v-divider class="my-4" />

        <div class="settings-section">
          <label class="text-body2 text-medium-emphasis">
            Notificar
            <strong>{{ localSettings.notificationTimeBeforeDueMinutes }}</strong>
            minutos antes do prazo
          </label>
          <v-slider
            v-model="localSettings.notificationTimeBeforeDueMinutes"
            :min="0"
            :max="1440"
            :step="10"
            :disabled="localSettings.silenceNotifications"
            @update:model-value="onSettingsChange"
            class="mt-2"
          />
        </div>

        <v-divider class="my-4" />

        <div class="settings-section">
          <v-checkbox
            v-model="localSettings.darkMode"
            label="Modo escuro"
            description="Ativa tema escuro da aplicação"
            @update:model-value="onSettingsChange"
          />
        </div>
      </v-card-text>

      <v-card-actions class="pa-4">
        <v-spacer />
        <v-btn
          variant="tonal"
          @click="dialog = false"
        >
          Fechar
        </v-btn>
        <v-btn
          color="primary"
          @click="saveSettings"
          :loading="saving"
        >
          Salvar
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup>
import { ref, reactive, watch, onMounted } from 'vue'
import { useSettings } from '~/composables/useSettings'

const props = defineProps({
  userId: {
    type: String,
    required: true,
  },
})

const emit = defineEmits(['settings-updated'])

const { settings, fetchSettings, updateSettings } = useSettings()
const dialog = ref(false)
const saving = ref(false)
const localSettings = reactive({
  silenceNotifications: false,
  darkMode: false,
  soundEnabled: true,
  notificationTimeBeforeDueMinutes: 10,
})

const isSilenced = ref(false)

onMounted(async () => {
  await fetchSettings(props.userId)
  if (settings.value) {
    Object.assign(localSettings, settings.value)
    isSilenced.value = settings.value.silenceNotifications
  }
})

const openDialog = () => {
  dialog.value = true
}

const onDialogChange = (value) => {
  if (!value) {
    dialog.value = false
  }
}

const onSettingsChange = () => {
  // Validar dependências
  if (localSettings.silenceNotifications) {
    localSettings.soundEnabled = false
  }
}

const saveSettings = async () => {
  saving.value = true
  try {
    const updated = await updateSettings(props.userId, localSettings)
    isSilenced.value = updated.silenceNotifications
    emit('settings-updated', updated)
    dialog.value = false
  } catch (error) {
    console.error('Erro ao salvar configurações:', error)
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.notification-btn {
  position: relative;
}

.bell-icon {
  color: var(--v-primary-base);
}

.bell-icon-muted {
  color: var(--v-error-base);
}

.settings-card {
  border-radius: 8px;
}

.settings-section {
  margin-bottom: 8px;
}
</style>
