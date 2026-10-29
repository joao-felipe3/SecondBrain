<template>
  <div class="grimoire-grid-mobile">
    <!-- Header do Diário de Arquivos Mobile -->
    <div class="grid-header">
      <div class="header-info">
        <h2 class="grid-title">📚 Tomos de Projetos</h2>
        <span class="grid-count">{{ projects.length }} disponíveis</span>
      </div>
      <button class="create-project-btn" @click="$emit('create-project')">
        <span>+ Novo Tomo</span>
      </button>
    </div>

    <!-- Grade Responsiva de Livros -->
    <div class="books-scroll-grid">
      <div v-for="project in projects" :key="project._id || project.id" class="book-item-wrapper">
        <UiGrimoireBook
          :title="project.name"
          :color="project.color || '#8b4513'"
          :task-count="project.taskCount ?? 0"
          :progress="project.progress ?? 0"
          :interactive="true"
          @click="$emit('select-project', project)"
        />
      </div>

      <!-- Card Fantasma para Criar Projeto -->
      <div class="new-book-card" @click="$emit('create-project')">
        <span class="new-book-icon">✨</span>
        <span class="new-book-label">Adicionar Novo Projeto</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import UiGrimoireBook from '../../ui/diegetic/UiGrimoireBook.vue';

defineProps<{
  projects: any[];
}>();

defineEmits<{
  (e: 'select-project', project: any): void;
  (e: 'create-project'): void;
}>();
</script>

<style scoped>
.grimoire-grid-mobile {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  padding: 1rem;
  box-sizing: border-box;
}

.grid-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.25rem;
}

.grid-title {
  font-family: var(--font-guild-title, 'Cinzel', serif);
  font-size: 1.15rem;
  color: hsl(38, 65%, 85%);
  margin: 0;
}

.grid-count {
  font-size: 0.75rem;
  color: hsl(35, 30%, 65%);
}

.create-project-btn {
  background: linear-gradient(180deg, hsl(43, 85%, 45%) 0%, hsl(35, 75%, 28%) 100%);
  border: 1px solid hsl(45, 90%, 55%);
  color: #fff;
  padding: 0.4rem 0.8rem;
  border-radius: 4px;
  font-family: var(--font-guild-title, 'Cinzel', serif);
  font-size: 0.75rem;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
}

.books-scroll-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 1.25rem;
  overflow-y: auto;
  padding-bottom: 2rem;
  justify-items: center;
}

.book-item-wrapper {
  display: flex;
  justify-content: center;
}

.new-book-card {
  width: 140px;
  height: 200px;
  border: 2px dashed hsl(35, 40%, 35%);
  border-radius: 4px 8px 8px 4px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  background: rgba(0, 0, 0, 0.25);
  cursor: pointer;
  color: hsl(38, 45%, 70%);
  font-family: var(--font-guild-title, 'Cinzel', serif);
  text-align: center;
  padding: 0.75rem;
  box-sizing: border-box;
  transition: all 0.2s ease;
}

.new-book-card:hover {
  border-color: hsl(45, 80%, 55%);
  color: #fff;
  background: rgba(234, 179, 8, 0.1);
  transform: translateY(-4px);
}

.new-book-icon {
  font-size: 1.5rem;
}

.new-book-label {
  font-size: 0.75rem;
  font-weight: 600;
}
</style>
