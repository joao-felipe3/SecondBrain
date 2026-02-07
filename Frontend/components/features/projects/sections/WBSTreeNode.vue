<template>
  <div class="wbs-node" :style="{ paddingLeft: `${depth * 0.01}rem` }">
    <div 
      :class="['node-row', { 'is-leaf': isLeaf, 'is-invalid': !validation.valid }]"
      @click="toggleExpand"
    >
      <!-- Expand/Collapse icon -->
      <v-icon
        v-if="!isLeaf"
        :class="['expand-toggle', { rotated: expanded }]"
        size="16"
      >
        mdi-chevron-right
      </v-icon>
      <span v-else class="leaf-dot">•</span>

      <!-- Validation icon -->
      <v-tooltip :text="validation.reason || 'Válido (8-80h)'" location="top">
        <template #activator="{ props: tooltipProps }">
          <v-icon 
            v-bind="tooltipProps"
            :color="validationColor"
            size="16"
            class="validation-icon"
          >
            {{ validationIcon }}
          </v-icon>
        </template>
      </v-tooltip>

      <!-- Node name -->
      <span class="node-name">{{ node.name }}</span>

      <!-- Hours badge -->
      <v-chip
        :color="validationColor"
        size="x-small"
        variant="tonal"
        class="hours-chip"
      >
        {{ node.estimatedHours }}h
      </v-chip>

      <!-- Suggest decomposition button for invalid nodes -->
      <v-btn
        v-if="isLeaf && !validation.valid"
        size="x-small"
        variant="text"
        color="warning"
        icon="mdi-auto-fix"
        class="fix-btn"
        @click.stop="$emit('suggest-decomposition', node)"
      />
    </div>

    <!-- Description (if expanded and has description) -->
    <div v-if="expanded && node.description" class="node-description" :style="{ paddingLeft: `${depth * 0.8 + 2}rem` }">
      {{ node.description }}
    </div>

    <!-- Children -->
    <transition-group name="tree-expand" tag="div">
      <WBSTreeNode
        v-if="expanded && node.children?.length"
        v-for="(child, index) in node.children"
        :key="index"
        :node="child"
        :depth="depth + 1"
        @suggest-decomposition="$emit('suggest-decomposition', $event)"
      />
    </transition-group>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { WBSNode } from './WBSTreeView.vue'

const props = defineProps<{
  node: WBSNode
  depth: number
}>()

defineEmits<{
  (e: 'suggest-decomposition', node: WBSNode): void
}>()

const expanded = ref(true) // Start expanded by default

const isLeaf = computed(() => !props.node.children || props.node.children.length === 0)

const validation = computed(() => {
  if (!isLeaf.value) return { valid: true }

  if (props.node.estimatedHours < 8) {
    return {
      valid: false,
      reason: `Muito pequeno: ${props.node.estimatedHours}h (mínimo 8h)`,
    }
  }
  if (props.node.estimatedHours > 80) {
    return {
      valid: false,
      reason: `Muito grande: ${props.node.estimatedHours}h (máximo 80h)`,
    }
  }
  return { valid: true, reason: undefined }
})

const validationColor = computed(() => {
  if (!isLeaf.value) return 'grey'
  return validation.value.valid ? 'success' : 'warning'
})

const validationIcon = computed(() => {
  if (!isLeaf.value) return 'mdi-folder-outline'
  return validation.value.valid ? 'mdi-check-circle-outline' : 'mdi-alert-outline'
})

function toggleExpand() {
  if (!isLeaf.value) {
    expanded.value = !expanded.value
  }
}
</script>

<style scoped>
.wbs-node {
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  overflow: hidden;
}

.node-row {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.3rem 0.5rem;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.15s;
  min-height: 1.8rem;
  max-width: 100%;
  overflow: hidden;
}

.node-row:hover {
  background: rgba(0, 0, 0, 0.04);
}

.node-row.is-invalid {
  background: rgba(255, 152, 0, 0.06);
}

.node-row.is-invalid:hover {
  background: rgba(255, 152, 0, 0.12);
}

.expand-toggle {
  transition: transform 0.2s;
  flex-shrink: 0;
}

.expand-toggle.rotated {
  transform: rotate(90deg);
}

.leaf-dot {
  width: 16px;
  text-align: center;
  font-size: 1.2rem;
  color: #94a3b8;
  flex-shrink: 0;
}

.validation-icon {
  flex-shrink: 0;
}

.node-name {
  flex: 1 1 auto;
  font-size: 0.8rem;
  color: #1e293b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
  max-width: 100%;
}

.hours-chip {
  flex-shrink: 0;
  font-size: 0.65rem !important;
}

.fix-btn {
  flex-shrink: 0;
  margin-left: 0.15rem;
}

.node-description {
  font-size: 0.7rem;
  color: #64748b;
  padding: 0.1rem 0.5rem 0.3rem;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  word-break: break-word;
}

.tree-expand-enter-active,
.tree-expand-leave-active {
  transition: all 0.2s ease;
}

.tree-expand-enter-from,
.tree-expand-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
