<template>
  <div class="checklist-embedded">
    <!-- Compact checklist display -->
    <div class="checklist-header" @click="openModal">
      <div class="progress-info">
        <span class="progress-label">{{ completedCount }}/{{ totalCount }} completo</span>
        <span class="progress-percentage">{{ completionPercentage }}%</span>
      </div>
    </div>

    <!-- Progress bar -->
    <div class="progress-bar-container" @click="openModal">
      <div
        class="progress-bar-fill"
        :style="{ width: `${completionPercentage}%`, backgroundColor: progressColor }"
      />
    </div>

    <!-- Action button -->
    <button class="edit-button" @click="openModal" :disabled="disabled">
      Editar Checklist
    </button>

    <!-- Modal with full editor -->
    <div v-if="showModal" class="modal-overlay" @click.self="closeModal">
      <div class="modal-content">
        <div class="modal-header">
          <h2>Editar Checklist</h2>
          <button class="close-btn" @click="closeModal">×</button>
        </div>

        <div class="modal-body">
          <!-- Checklist items in modal -->
          <div v-if="allItems.length > 0" class="checklist-items-list">
            <div
              v-for="(item, index) in allItems"
              :key="index"
              class="checklist-item-row"
            >
              <input
                type="checkbox"
                class="item-checkbox"
                :checked="item.completed"
                @change="toggleItem(index)"
                :disabled="isLoading"
              />
              <input
                type="text"
                class="item-text"
                :value="item.item"
                @change="(e) => updateItemText(index, (e.target as HTMLInputElement).value)"
                :disabled="isLoading"
              />
              <button
                class="item-delete"
                @click="removeItem(index)"
                :disabled="isLoading || allItems.length <= 3"
                title="Mínimo 3 itens"
              >
                🗑️
              </button>
            </div>
          </div>

          <!-- Add new item button -->
          <button
            v-if="allItems.length < 10"
            class="add-item-btn"
            @click="addItem"
            :disabled="isLoading"
          >
            + Adicionar Item
          </button>

          <!-- Progress display -->
          <div class="modal-progress">
            <div class="progress-stats">
              <span>{{ completedCount }}/{{ totalCount }} itens completos</span>
              <span class="progress-bar-inline">
                <span
                  class="progress-fill-inline"
                  :style="{ width: `${completionPercentage}%` }"
                />
              </span>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn-cancel" @click="closeModal" :disabled="isLoading">Cancelar</button>
          <button class="btn-save" @click="saveChecklist" :disabled="isSaveDisabled">
            {{ isLoading ? 'Salvando...' : 'Salvar' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';

export interface ChecklistItem {
  item: string;
  completed: boolean;
  order?: number;
}

interface Props {
  checklist?: ChecklistItem[];
  taskId: string;
  onUpdate?: (checklist: ChecklistItem[]) => Promise<void>;
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  checklist: () => [],
  disabled: false,
});

// Local state
const showModal = ref(false);
const allItems = ref<ChecklistItem[]>([]);
const isLoading = ref(false);

// Computed properties
const completedCount = computed(() => {
  return allItems.value.filter((item) => item.completed).length;
});

const totalCount = computed(() => {
  return allItems.value.length || 0;
});

const completionPercentage = computed(() => {
  if (totalCount.value === 0) return 0;
  return Math.round((completedCount.value / totalCount.value) * 100);
});

const progressColor = computed(() => {
  if (completionPercentage.value === 0) return '#ef4444'; // red
  if (completionPercentage.value < 50) return '#f97316'; // orange
  if (completionPercentage.value < 100) return '#eab308'; // yellow
  return '#22c55e'; // green (100%)
});

const isSaveDisabled = computed(() => {
  return isLoading.value || totalCount.value < 3 || totalCount.value > 10;
});

// Methods
const openModal = () => {
  if (!props.disabled) {
    // Clone items from prop
    allItems.value = (props.checklist || []).map((item) => ({
      ...item,
      completed: item.completed || false,
    }));
    showModal.value = true;
  }
};

const closeModal = () => {
  showModal.value = false;
  // Reset to original state
  allItems.value = [];
};

const toggleItem = (index: number) => {
  if (allItems.value[index]) {
    allItems.value[index].completed = !allItems.value[index].completed;
  }
};

const updateItemText = (index: number, newText: string) => {
  if (allItems.value[index]) {
    allItems.value[index].item = newText.trim();
  }
};

const removeItem = (index: number) => {
  if (allItems.value.length > 3) {
    allItems.value.splice(index, 1);
  }
};

const addItem = () => {
  if (allItems.value.length < 10) {
    allItems.value.push({
      item: '',
      completed: false,
      order: allItems.value.length,
    });
  }
};

const saveChecklist = async () => {
  // Validate structure
  const validItems = allItems.value.filter((item) => item.item.trim());
  if (validItems.length < 3 || validItems.length > 10) {
    alert('Checklist deve ter entre 3 e 10 itens válidos');
    return;
  }

  // Prepare payload with order
  const payload: ChecklistItem[] = validItems.map((item, index) => ({
    ...item,
    order: index,
  }));

  isLoading.value = true;
  try {
    if (props.onUpdate) {
      await props.onUpdate(payload);
    }
    closeModal();
  } catch (error) {
    console.error('Erro ao salvar checklist:', error);
    alert('Erro ao salvar checklist. Tente novamente.');
  } finally {
    isLoading.value = false;
  }
};
</script>

<style scoped lang="scss">
.checklist-embedded {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  background: #f5f5f5;
  border-radius: 8px;
  cursor: pointer;

  &.disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .checklist-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;

    .progress-info {
      display: flex;
      gap: 8px;
      align-items: center;
      font-size: 14px;

      .progress-label {
        font-weight: 500;
        color: #333;
      }

      .progress-percentage {
        font-size: 12px;
        color: #666;
        background: white;
        padding: 2px 6px;
        border-radius: 4px;
      }
    }
  }

  .progress-bar-container {
    width: 100%;
    height: 6px;
    background: #ddd;
    border-radius: 3px;
    overflow: hidden;
    transition: all 0.2s ease;

    &:hover {
      height: 8px;
    }

    .progress-bar-fill {
      height: 100%;
      transition: width 0.3s ease;
    }
  }

  .edit-button {
    padding: 6px 12px;
    font-size: 12px;
    font-weight: 500;
    color: white;
    background: #3b82f6;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    transition: background 0.2s ease;

    &:hover:not(:disabled) {
      background: #2563eb;
    }

    &:disabled {
      background: #ccc;
      cursor: not-allowed;
    }
  }
}

// Modal styles
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;

  .modal-content {
    background: white;
    border-radius: 12px;
    width: 90%;
    max-width: 600px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);

    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 20px;
      border-bottom: 1px solid #eee;

      h2 {
        margin: 0;
        font-size: 18px;
        font-weight: 600;
      }

      .close-btn {
        background: none;
        border: none;
        font-size: 24px;
        cursor: pointer;
        color: #666;

        &:hover {
          color: #333;
        }
      }
    }

    .modal-body {
      flex: 1;
      overflow-y: auto;
      padding: 20px;

      .checklist-items-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
        margin-bottom: 16px;

        .checklist-item-row {
          display: flex;
          align-items: center;
          gap: 10px;

          .item-checkbox {
            flex-shrink: 0;
            width: 18px;
            height: 18px;
            cursor: pointer;
            border: 1px solid #ccc;
            border-radius: 4px;
            background: transparent;

            &:checked {
              background: #22c55e;
              border-color: #22c55e;
              color: white;
            }
          }

          .item-text {
            flex: 1;
            padding: 8px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 14px;

            &:disabled {
              background: #f5f5f5;
              color: #999;
            }

            &:checked ~ & {
              text-decoration: line-through;
              color: #999;
            }
          }

          .item-delete {
            flex-shrink: 0;
            background: none;
            border: none;
            cursor: pointer;
            font-size: 16px;
            padding: 4px;

            &:hover:not(:disabled) {
              opacity: 0.7;
            }

            &:disabled {
              cursor: not-allowed;
              opacity: 0.3;
            }
          }
        }
      }

      .add-item-btn {
        width: 100%;
        padding: 10px;
        margin-bottom: 16px;
        font-size: 14px;
        font-weight: 500;
        color: #3b82f6;
        background: #eff6ff;
        border: 1px dashed #3b82f6;
        border-radius: 4px;
        cursor: pointer;
        transition: all 0.2s ease;

        &:hover:not(:disabled) {
          background: #dbeafe;
        }

        &:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      }

      .modal-progress {
        background: #f9fafb;
        padding: 12px;
        border-radius: 8px;

        .progress-stats {
          display: flex;
          flex-direction: column;
          gap: 8px;
          font-size: 13px;

          .progress-bar-inline {
            display: flex;
            width: 100%;
            height: 8px;
            background: #ddd;
            border-radius: 4px;
            overflow: hidden;

            .progress-fill-inline {
              height: 100%;
              background: currentColor;
              transition: width 0.3s ease;
            }
          }
        }
      }
    }

    .modal-footer {
      display: flex;
      gap: 12px;
      padding: 16px 20px;
      border-top: 1px solid #eee;

      .btn-cancel,
      .btn-save {
        flex: 1;
        padding: 10px;
        font-size: 14px;
        font-weight: 500;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.2s ease;

        &:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      }

      .btn-cancel {
        background: #f5f5f5;
        color: #333;

        &:hover:not(:disabled) {
          background: #eeeeee;
        }
      }

      .btn-save {
        background: #22c55e;
        color: white;

        &:hover:not(:disabled) {
          background: #16a34a;
        }
      }
    }
  }
}

// Responsive adjustments
@media (max-width: 640px) {
  .modal-overlay .modal-content {
    width: 95%;
    max-height: 90vh;

    .modal-header,
    .modal-body,
    .modal-footer {
      padding: 16px;
    }

    .modal-body .checklist-items-list {
      gap: 10px;

      .checklist-item-row {
        gap: 8px;

        .item-text {
          font-size: 13px;
          padding: 6px;
        }
      }
    }
  }
}
</style>
