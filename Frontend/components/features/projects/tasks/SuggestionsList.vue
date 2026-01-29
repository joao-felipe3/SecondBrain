<template>
  <div class="suggestions-state">
    <div class="suggestions-preview">
      <div class="preview-header">
        <div class="preview-info">
          <p class="preview-subtitle">{{ suggestions.length }} tarefas prontas para revisão</p>
        </div>
      </div>

      <div class="preview-header-actions">
        <v-btn
          size="small"
          color="primary"
          variant="outlined"
          @click="emit('reset')"
        >
          <v-icon size="18">mdi-refresh</v-icon>
          Nova Sugestão
        </v-btn>
      </div>

      <div class="preview-list">
        <table class="preview-table" role="table">
          <tbody>
            <tr
              v-for="(suggestion, index) in suggestions"
              :key="index"
              :class="{ selected: suggestion.selected }"
              class="preview-row"
              @click="onRowClick(suggestion, index, $event)"
            >
              <td class="preview-checkbox-cell">
                <v-checkbox
                  v-model="suggestion.selected"
                  hide-details
                  density="compact"
                  color="primary"
                />
              </td>
              <td class="preview-name-cell">{{ suggestion.name }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="suggestions-actions">
      <v-btn
        color="error"
        variant="outlined"
        prepend-icon="mdi-close"
        @click="emit('discard')"
      >
        Descartar Sugestões
      </v-btn>
      <v-btn
        color="success"
        variant="elevated"
        prepend-icon="mdi-check"
        @click="emit('add')"
        :disabled="selectedCount === 0"
        :loading="adding"
      >
        Adicionar {{ selectedCount }} Tarefa(s)
      </v-btn>
    </div>

    <v-alert v-if="error" type="error" density="compact" class="mt-3">
      {{ error }}
    </v-alert>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface Suggestion {
  name: string
  deadline: string
  pomodoros: number
  priority: number
  difficulty: number
  selected: boolean
}

const props = defineProps<{
  suggestions: Suggestion[]
  adding: boolean
  error: string | null
}>()

const emit = defineEmits<{
  (e: 'reset'): void
  (e: 'discard'): void
  (e: 'add'): void
  (e: 'open-carousel', index: number): void
}>()

const selectedCount = computed(() => props.suggestions.filter(s => s.selected).length)

function onRowClick(suggestion: Suggestion, index: number, e: MouseEvent) {
  const target = e.target as HTMLElement
  if (target && typeof target.closest === 'function' && target.closest('.preview-checkbox-cell')) {
    return
  }
  emit('open-carousel', index)
}
</script>

<style scoped>
.suggestions-state {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  flex: 1;
  width: 100%;
  max-width: 100%;
  overflow: hidden;
  box-sizing: border-box;
}

.suggestions-preview {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 1rem;
  max-width: 100%;
  box-sizing: border-box;
}

.preview-header {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding-bottom: 0.75rem;
  border-bottom: 2px solid #e2e8f0;
}

.preview-header-actions {
  display: flex;
  justify-content: center;
  align-items: center;
}

.preview-info {
  flex: 1;
}

.preview-subtitle {
  margin: 0;
  font-size: 0.875rem;
  color: #64748b;
}

.preview-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-height: 200px;
  overflow-y: auto;
  padding-right: 0.25rem;
}

.preview-table {
  width: 100%;
  border-collapse: collapse;
}

.preview-row {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: white;
  cursor: pointer;
}

.preview-row.selected {
  background: #eff6ff;
  border-color: #3b82f6;
}

.preview-row td {
  padding: 0.5rem 0.75rem;
  vertical-align: middle;
}

.preview-checkbox-cell {
  width: 48px;
  padding-left: 0.5rem;
}

.preview-name-cell {
  overflow-wrap: anywhere;
  word-wrap: break-word;
  white-space: normal;
  color: #334155;
  font-weight: 500;
  font-size: 0.78rem;
  line-height: 1.2;
}

.suggestions-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
  padding-top: 1rem;
  border-top: 1px solid #e2e8f0;
  max-width: 100%;
}

.suggestions-actions .v-btn {
  font-size: 0.5rem;
  min-width: 0;
  white-space: normal;
  height: auto;
  padding: 0.5rem;
}
</style>
