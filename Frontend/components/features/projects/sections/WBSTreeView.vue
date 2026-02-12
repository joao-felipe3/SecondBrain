<template>
  <div class="wbs-tree">
    <div v-if="nodes.length === 0" class="empty-state">
      <v-icon size="48" color="grey-lighten-1">mdi-file-tree-outline</v-icon>
      <p class="text-body-2 text-medium-emphasis mt-2">Nenhuma WBS gerada ainda</p>
    </div>

    <div v-else>
      <WBSTreeNode
        v-for="(node, index) in nodes"
        :key="index"
        :node="node"
        :depth="0"
        :editing="editing"
        @suggest-decomposition="$emit('suggest-decomposition', $event)"
        @update-node="$emit('update-node', $event)"
        @delete-node="$emit('delete-node', $event)"
        @add-child="$emit('add-child', $event)"
        @move-node="$emit('move-node', $event)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import WBSTreeNode from './WBSTreeNode.vue'

export interface WBSNode {
  _id?: string
  name: string
  description?: string
  level: number
  parentId?: string
  estimatedHours: number
  order?: number
  children?: WBSNode[]
}

defineProps<{
  nodes: WBSNode[]
  editing?: boolean
}>()

defineEmits<{
  (e: 'suggest-decomposition', node: WBSNode): void
  (e: 'update-node', payload: { nodeId?: string | undefined; field: string; value: any }): void
  (e: 'delete-node', nodeId?: string | undefined): void
  (e: 'add-child', nodeId?: string | undefined): void
  (e: 'move-node', payload: { sourceId?: string; targetId?: string }): void
}>()
</script>

<style scoped>
.wbs-tree {
  width: 100%;
}

.empty-state {
  text-align: center;
  padding: 2rem;
}
</style>
