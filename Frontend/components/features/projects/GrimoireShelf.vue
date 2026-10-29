<template>
  <div class="grimoire-shelf-container">
    <div class="shelf-header">
      <div class="shelf-title-box">
        <span class="rune-icon">📖</span>
        <h3 class="shelf-title">Estante dos Tomos & Arquivos</h3>
      </div>
      <button class="add-book-btn" @click="$emit('create-project')">
        <span>+ Novo Projeto</span>
      </button>
    </div>

    <!-- Prateleiras com livros -->
    <div class="shelf-rows-wrapper">
      <div v-for="(shelfBooks, sIdx) in chunkedProjects" :key="sIdx" class="diegetic-shelf-row">
        <div
          v-for="project in shelfBooks"
          :key="project._id || project.id"
          class="book-wrapper"
          @mouseenter="$emit('project-hover', project)"
        >
          <UiGrimoireBook
            :title="project.name"
            :color="project.color || '#8b4513'"
            :task-count="project.taskCount ?? 0"
            :progress="project.progress ?? 0"
            :is-locked="project.isLocked || false"
            :interactive="true"
            @click="$emit('select-project', project)"
          />
        </div>

        <!-- Se for a última prateleira, adiciona botão de novo livro se couber -->
        <div
          v-if="sIdx === chunkedProjects.length - 1"
          class="shelf-add-slot"
          @click="$emit('create-project')"
        >
          <div class="empty-book-outline">
            <span class="plus-icon">+</span>
            <span class="plus-text">Adicionar Tomo</span>
          </div>
        </div>
      </div>

      <!-- Prateleira vazia se não houver projetos -->
      <div v-if="projects.length === 0" class="diegetic-shelf-row">
        <div class="shelf-add-slot" @click="$emit('create-project')">
          <div class="empty-book-outline">
            <span class="plus-icon">+</span>
            <span class="plus-text">Iniciar Primeiro Projeto</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import UiGrimoireBook from '../../ui/diegetic/UiGrimoireBook.vue';

const props = withDefaults(
  defineProps<{
    projects: any[];
  }>(),
  {
    projects: () => [],
  },
);

defineEmits<{
  (e: 'select-project', project: any): void;
  (e: 'create-project'): void;
  (e: 'project-hover', project: any): void;
}>();

// Divide os projetos em prateleiras de até 5 livros cada
const chunkedProjects = computed(() => {
  const chunks: any[][] = [];
  const chunkSize = 5;
  for (let i = 0; i < props.projects.length; i += chunkSize) {
    chunks.push(props.projects.slice(i, i + chunkSize));
  }
  return chunks;
});
</script>

<style scoped>
.grimoire-shelf-container {
  display: flex;
  flex-direction: column;
  width: 100%;
  background: rgba(18, 14, 12, 0.85);
  border: 4px solid hsl(25, 30%, 18%);
  border-radius: 8px;
  box-shadow:
    inset 0 0 40px rgba(0, 0, 0, 0.8),
    0 12px 32px rgba(0, 0, 0, 0.7);
  padding: 1.25rem;
  box-sizing: border-box;
}

.shelf-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 2px solid hsl(25, 30%, 25%);
  padding-bottom: 0.75rem;
  margin-bottom: 1rem;
}

.shelf-title-box {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.rune-icon {
  font-size: 1.25rem;
}

.shelf-title {
  font-family: var(--font-guild-title, 'Cinzel', serif);
  font-size: 1.2rem;
  color: hsl(38, 65%, 85%);
  margin: 0;
}

.add-book-btn {
  background: linear-gradient(180deg, hsl(43, 85%, 45%) 0%, hsl(35, 75%, 28%) 100%);
  border: 1px solid hsl(45, 90%, 55%);
  color: #fff;
  padding: 0.4rem 0.85rem;
  border-radius: 4px;
  font-family: var(--font-guild-title, 'Cinzel', serif);
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
  transition: all 0.2s ease;
}

.add-book-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(234, 179, 8, 0.4);
}

.shelf-rows-wrapper {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.book-wrapper {
  display: flex;
  align-items: flex-end;
}

.shelf-add-slot {
  display: flex;
  align-items: flex-end;
  cursor: pointer;
}

.empty-book-outline {
  width: 140px;
  height: 200px;
  border: 2px dashed hsl(35, 40%, 35%);
  border-radius: 4px 8px 8px 4px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  background: rgba(0, 0, 0, 0.2);
  color: hsl(38, 45%, 65%);
  font-family: var(--font-guild-title, 'Cinzel', serif);
  text-align: center;
  padding: 0.5rem;
  box-sizing: border-box;
  transition: all 0.2s ease;
}

.empty-book-outline:hover {
  border-color: hsl(45, 80%, 55%);
  color: #fef08a;
  background: rgba(234, 179, 8, 0.1);
  transform: translateY(-4px);
}

.plus-icon {
  font-size: 1.75rem;
  line-height: 1;
}

.plus-text {
  font-size: 0.75rem;
  font-weight: 600;
}
</style>
