<template>
  <v-card 
    class="mb-1 detail-card" 
    elevation="0" 
    :color="color"
    @click="toggle"
    style="cursor: pointer;"
  >
    <v-card-text style="padding: 0.75rem;">
      <!-- Preview do conteúdo (primeiras 2 linhas) -->
      <div v-if="!expanded && !risks" class="preview-content">
        <div class="content-with-icon">
          <p :class="['smart-content', { expanded }]">
            <span class="smart-label">{{ title }}:</span> {{ previewText }}
          </p>
          <v-icon :class="['expand-icon', { rotated: expanded }]" size="small">
            mdi-chevron-down
          </v-icon>
        </div>
      </div>

      <!-- Conteúdo completo (expandido) -->
      <div v-if="expanded && !risks" class="full-content">
        <div class="content-with-icon">
          <p :class="['smart-content', { expanded }]">
            <span class="smart-label">{{ title }}:</span> {{ content }}
          </p>
          <v-icon :class="['expand-icon', { rotated: expanded }]" size="small">
            mdi-chevron-down
          </v-icon>
        </div>
      </div>

      <!-- Para riscos (lista) -->
      <div v-if="risks">
        <div class="risks-header">
          <p class="smart-label-risks">{{ title }}</p>
          <v-icon :class="['expand-icon', { rotated: expanded }]" size="small">
            mdi-chevron-down
          </v-icon>
        </div>
        <div v-if="!expanded" class="preview-content">
          <ul class="risks-list">
            <li v-for="(risk, index) in previewRisks" :key="index">{{ risk }}</li>
          </ul>
        </div>

        <div v-else class="full-content">
          <ul :class="['risks-list', { expanded }]">
            <li v-for="(risk, index) in risks" :key="index">{{ risk }}</li>
          </ul>
        </div>
      </div>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

const props = defineProps<{
  title: string
  content?: string
  risks?: string[]
  color?: string
}>()

const expanded = ref(false)

// Calcula o texto de preview (aproximadamente 2 linhas = ~120 caracteres)
const previewText = computed(() => {
  if (!props.content) return ''
  const maxLength = 50
  if (props.content.length <= maxLength) return props.content
  return props.content.substring(0, maxLength).trim() + '...'
})

const hasMore = computed(() => {
  return props.content && props.content.length > 50
})

// Preview dos riscos (primeiros 2)
const previewRisks = computed(() => {
  return props.risks?.slice(0, 1) || []
})

function toggle() {
  expanded.value = !expanded.value
}
</script>

<style scoped>
.detail-card {
  transition: all 0.3s ease;
  user-select: none;
}

.detail-card:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.smart-label {
  font-weight: 600;
  color: #1e293b;
}

.smart-label-risks {
  font-weight: 600;
  font-size: 0.75rem;
  color: #1e293b;
  margin: 0;
}

.smart-content {
  margin: 0;
  color: #475569;
  font-size: 0.75rem;
  line-height: 1.5;
  word-wrap: break-word;
  overflow-wrap: break-word;
}

.smart-content.expanded {
  font-size: 0.9rem;
}

.risks-list.expanded {
  font-size: 0.9rem;
}

.preview-content,
.full-content {
  position: relative;
}

.content-with-icon {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
}

.content-with-icon p {
  flex: 1;
}

.expand-icon {
  flex-shrink: 0;
  transition: transform 0.3s ease;
  margin-top: 0.1rem;
}

.expand-icon.rotated {
  transform: rotate(180deg);
}

.risks-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.risks-header p {
  flex: 1;
}

.risks-list {
  margin: 0;
  padding-left: 1.5rem;
  color: #475569;
  font-size: 0.75rem;
}

.risks-list li {
  margin-bottom: 0.5rem;
  line-height: 1.5;
}
</style>
