<template>
  <div class="leaf-list-column">
    <div class="list-header">
      <h4 class="text-subtitle-2">📦 Pacotes</h4>
      <v-btn
        :icon="expanded ? 'mdi-chevron-down' : 'mdi-chevron-right'"
        size="x-small"
        variant="text"
        @click="expanded = !expanded"
      />
    </div>

    <v-expand-transition>
      <v-list v-show="expanded" density="compact" class="leaf-nodes-list">
        <v-list-item
          v-for="(leaf, idx) in leafNodes"
          :key="idx"
          :class="{
            'bg-primary-lighten-5': idx === currentIndex,
            'bg-success-lighten-5': idx < currentIndex,
          }"
        >
          <template #prepend>
            <v-icon
              :icon="
                idx < currentIndex
                  ? 'mdi-check-circle'
                  : idx === currentIndex
                  ? 'mdi-loading mdi-spin'
                  : 'mdi-circle-outline'
              "
              :color="
                idx < currentIndex
                  ? 'success'
                  : idx === currentIndex
                  ? 'primary'
                  : 'grey-lighten-1'
              "
              size="small"
            />
          </template>
          <v-list-item-title class="text-caption">{{ leaf.path }}</v-list-item-title>
          <v-list-item-subtitle class="text-caption">
            {{ leaf.node.estimatedHours }}h →
            {{ leaf.generatedTasks ? leaf.generatedTasks.length : '?' }} tasks
            {{ leaf.generatedHours ? `(${leaf.generatedHours.toFixed(1)}h)` : '' }}
          </v-list-item-subtitle>
        </v-list-item>
      </v-list>
    </v-expand-transition>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { PropType } from 'vue'
import type { LeafNode } from '~/composables/features/useConversionHelpers'

defineProps({
  leafNodes:    { type: Array as PropType<LeafNode[]>, required: true },
  currentIndex: { type: Number, required: true },
})

const expanded = ref(true)
</script>

<style scoped>
.leaf-list-column {
  display: flex;
  flex-direction: column;
}

.list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 0.5rem;
  margin-bottom: 0.5rem;
  border-bottom: 1px solid rgba(var(--v-border-color), 0.12);
}

.list-header h4 {
  margin: 0;
}

.leaf-nodes-list {
  border: 1px solid rgba(var(--v-border-color), 0.12);
  border-radius: 4px;
  padding: 0.5rem;
  background: rgba(var(--v-theme-surface-variant), 0.02);
  max-height: 600px;
  overflow-y: auto;
}
</style>
