<template>
  <div class="wbs-node" :style="{ paddingLeft: `${depth * 0.01}rem` }">
    <!-- Edit mode -->
    <div v-if="editing && isEditing" class="edit-mode">
      <div class="edit-fields">
        <v-text-field
          v-model="editData.name"
          label="Nome do pacote"
          density="compact"
          variant="outlined"
          size="small"
          class="mt-1"
          :rules="[(v: any) => !!v || 'Nome é obrigatório']"
        />
        
        <v-textarea
          v-model="editData.description"
          label="Descrição (opcional)"
          density="compact"
          variant="outlined"
          size="small"
          rows="2"
          class="mt-2"
        />
        
        <v-text-field
          v-model.number="editData.estimatedHours"
          label="Horas estimadas"
          type="number"
          density="compact"
          variant="outlined"
          size="small"
          class="mt-2"
          :rules="[(v: any) => (v >= 1 && v <= 200) || 'Entre 1 e 200 horas']"
        />
        
        <div class="edit-actions mt-2">
          <v-btn
            size="x-small"
            color="success"
            variant="tonal"
            prepend-icon="mdi-check"
            @click="saveEdit"
          >
            Salvar
          </v-btn>
          <v-btn
            size="x-small"
            color="default"
            variant="text"
            prepend-icon="mdi-close"
            @click="cancelEdit"
          >
            Cancelar
          </v-btn>
        </div>
      </div>
    </div>

    <!-- View mode -->
    <div 
      v-else
      :class="['node-row', { 'is-leaf': isLeaf, 'is-invalid': !validation.valid, 'is-dragging': isDragging, 'is-drag-over': isDragOver }]"
      :draggable="editing"
      @click="toggleExpand"
      @dragstart="handleDragStart"
      @dragover="handleDragOver"
      @dragleave="handleDragLeave"
      @drop="handleDrop"
      @dragend="handleDragEnd"
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

      <!-- Action buttons -->
      <div v-if="editing" class="edit-action-btns">
        <v-btn
          size="x-small"
          variant="text"
          color="primary"
          icon="mdi-pencil"
          class="edit-btn"
          @click.stop="startEdit"
        />
        <v-btn
          size="x-small"
          variant="text"
          color="info"
          icon="mdi-plus"
          class="add-child-btn"
          @click.stop="addChild"
        />
        <v-btn
          size="x-small"
          variant="text"
          color="error"
          icon="mdi-delete"
          class="delete-btn"
          @click.stop="deleteNode"
        />
      </div>

      <!-- Suggest decomposition button for invalid nodes -->
      <v-btn
        v-else-if="isLeaf && !validation.valid"
        size="x-small"
        variant="text"
        color="warning"
        icon="mdi-auto-fix"
        class="fix-btn"
        @click.stop="$emit('suggest-decomposition', node)"
      />
    </div>

    <!-- Description (if expanded and has description) -->
    <div v-if="expanded && node.description && !isEditing" class="node-description" :style="{ paddingLeft: `${depth * 0.8 + 2}rem` }">
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
        :editing="editing"
        @suggest-decomposition="$emit('suggest-decomposition', $event)"
        @update-node="$emit('update-node', $event)"
        @delete-node="$emit('delete-node', $event)"
        @add-child="$emit('add-child', $event)"
        @move-node="$emit('move-node', $event)"
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
  editing?: boolean
}>()

const emit = defineEmits<{
  (e: 'suggest-decomposition', node: WBSNode): void
  (e: 'update-node', payload: { nodeId?: string | undefined; field: string; value: any }): void
  (e: 'delete-node', nodeId?: string | undefined): void
  (e: 'add-child', nodeId?: string | undefined): void
  (e: 'move-node', payload: { sourceId?: string; targetId?: string }): void
}>()

const expanded = ref(true)
const isEditing = ref(false)
const isDragging = ref(false)
const isDragOver = ref(false)
const editData = ref({
  name: props.node.name,
  description: props.node.description || '',
  estimatedHours: props.node.estimatedHours,
})

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

function startEdit() {
  editData.value = {
    name: props.node.name,
    description: props.node.description || '',
    estimatedHours: props.node.estimatedHours,
  }
  isEditing.value = true
}

function saveEdit() {
  // Emit updates for each changed field
  if (editData.value.name !== props.node.name) {
    emit('update-node', { nodeId: props.node._id, field: 'name', value: editData.value.name })
  }
  if (editData.value.description !== (props.node.description || '')) {
    emit('update-node', { nodeId: props.node._id, field: 'description', value: editData.value.description })
  }
  if (editData.value.estimatedHours !== props.node.estimatedHours) {
    emit('update-node', { nodeId: props.node._id, field: 'estimatedHours', value: editData.value.estimatedHours })
  }
  isEditing.value = false
}

function cancelEdit() {
  isEditing.value = false
}

function deleteNode() {
  if (confirm('Tem certeza que quer deletar este pacote e todos os seus filhos?')) {
    emit('delete-node', props.node._id)
  }
}

function addChild() {
  emit('add-child', props.node._id)
}

function handleDragStart(event: DragEvent) {
  isDragging.value = true
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', props.node._id || '')
  }
}

function handleDragOver(event: DragEvent) {
  if (props.editing) {
    event.preventDefault()
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move'
    }
    isDragOver.value = true
  }
}

function handleDragLeave() {
  isDragOver.value = false
}

function handleDrop(event: DragEvent) {
  event.preventDefault()
  event.stopPropagation()
  isDragOver.value = false

  const sourceId = event.dataTransfer?.getData('text/plain')
  if (sourceId && sourceId !== props.node._id && props.editing) {
    emit('move-node', { sourceId, targetId: props.node._id })
  }
}

function handleDragEnd() {
  isDragging.value = false
  isDragOver.value = false
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

.node-row[draggable="true"] {
  cursor: move;
}

.node-row:hover {
  background: rgba(0, 0, 0, 0.04);
}

.node-row.is-dragging {
  opacity: 0.5;
  background: rgba(25, 118, 210, 0.1);
}

.node-row.is-drag-over {
  background: rgba(25, 118, 210, 0.15);
  border: 2px solid #1976d2;
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

.edit-mode {
  background: rgba(25, 118, 210, 0.05);
  border: 1px solid #1976d2;
  border-radius: 6px;
  padding: 0.75rem;
  margin: 0.25rem 0;
}

.edit-fields {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.edit-actions {
  display: flex;
  gap: 0.5rem;
}

.edit-action-btns {
  display: flex;
  gap: 0.1rem;
  flex-shrink: 0;
  margin-left: 0.15rem;
}

.edit-btn,
.add-child-btn,
.delete-btn {
  flex-shrink: 0;
  min-width: 24px !important;
  min-height: 24px !important;
  width: 24px;
  height: 24px;
  padding: 0 !important;
}
</style>
