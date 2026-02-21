<template>
  <v-card-text class="progress-header pa-4 pb-3">
    <div class="d-flex align-center justify-space-between mb-3">
      <div>
        <div class="text-subtitle-2">Progresso: {{ currentIndex }} / {{ totalLeafs }}</div>
        <div class="text-caption text-medium-emphasis">
          {{ accumulatedHours.toFixed(1) }}h geradas de {{ totalBudgetHours.toFixed(1) }}h
        </div>
      </div>
      <v-chip :color="statusColor" size="small" variant="tonal">
        {{ statusText }}
      </v-chip>
    </div>

    <v-progress-linear
      :model-value="progressPercentage"
      :color="statusColor"
      height="8"
      rounded
    />
  </v-card-text>
</template>

<script setup lang="ts">
defineProps({
  currentIndex:      { type: Number, required: true },
  totalLeafs:        { type: Number, required: true },
  accumulatedHours:  { type: Number, required: true },
  totalBudgetHours:  { type: Number, required: true },
  progressPercentage:{ type: Number, required: true },
  statusColor:       { type: String, required: true },
  statusText:        { type: String, required: true },
})
</script>

<style scoped>
.progress-header {
  background: rgba(var(--v-theme-surface), 1);
  position: sticky;
  top: 0;
  z-index: 5;
  border-bottom: 1px solid rgba(var(--v-border-color), 0.12);
}
</style>
