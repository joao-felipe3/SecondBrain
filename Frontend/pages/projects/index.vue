<template>
  <div class="projects-page-viewport diegetic-stone-wall">
    <!-- BARRA SUPERIOR DIEGÉTICA DE NAVEGAÇÃO -->
    <header class="diegetic-header-bar">
      <NuxtLink to="/" class="diegetic-btn-back">
        <span class="btn-icon">🏛️</span>
        <span class="btn-text">Retornar ao Saguão</span>
      </NuxtLink>

      <div class="header-title-container">
        <h1 class="header-main-title">📜 Sala de Arquivos & Grimórios</h1>
        <p class="header-subtitle">
          Biblioteca de projetos estratégicos, tomos da guilda e gestão de missões
        </p>
      </div>

      <div class="header-status-badge">
        <span class="status-count">{{ projects.length }} Tomos</span>
      </div>
    </header>

    <!-- CONTEÚDO PRINCIPAL (DESKTOP E MOBILE) -->
    <main class="projects-main-content">
      <!-- Versão Mobile: Grade de Grimórios Direta -->
      <div v-if="isMobile" class="mobile-projects-wrapper">
        <GrimoireGridMobile
          :projects="projects"
          @select-project="onProjectClick"
          @create-project="onCreateProject"
        />
      </div>

      <!-- Versão Desktop: Painel de Pergaminho à esquerda e Estante de Grimórios à direita -->
      <v-row v-else dense class="fill-height px-4">
        <v-col cols="12" md="5" class="d-flex align-center justify-center">
          <ProjectPanel
            title="Projects"
            :titleOffset="'-10%'"
            :contentStyle="{ minHeight: '75vh' }"
            :projects="projects"
            @project-hover="onProjectHover"
            @project-click="onProjectClick"
            @create-project="onCreateProject"
            @request-delete="onRequestDelete"
          />
        </v-col>

        <v-col cols="12" md="7" class="d-flex flex-column justify-center py-4">
          <GrimoireShelf
            :projects="projects"
            @select-project="onProjectClick"
            @create-project="onCreateProject"
            @project-hover="onProjectHover"
          />
        </v-col>
      </v-row>
    </main>

    <!-- Modal do livro com abas de WBS, SMART, PERT, etc. -->
    <BookModal
      :isOpen="isModalOpen"
      :project="selectedProject"
      :startInEdit="startInEdit"
      :focusedSlide="focusedSlide"
      @close="closeModal"
      @updated="onUpdated"
      @deleted="onDeleted"
    />

    <!-- Delete Confirmation Dialog -->
    <DeleteProjectDialog
      v-model="showDeleteDialog"
      :projectName="projectToDelete?.name || ''"
      :taskCount="projectToDelete?.taskCount || 0"
      @confirm="onConfirmDelete"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import { useRoute } from '#imports';
import ProjectPanel from '../../components/features/projects/ProjectPanel.vue';
import GrimoireShelf from '../../components/features/projects/GrimoireShelf.vue';
import GrimoireGridMobile from '../../components/features/projects/GrimoireGridMobile.vue';
import BookModal from '../../components/features/projects/BookModal.vue';
import DeleteProjectDialog from '../../components/shared/dialogs/DeleteProjectDialog.vue';
import { useProjects } from '~/composables/features/useProjects';
import { useProjectModal } from '~/composables/features/useProjectModal';
import { useProjectDelete } from '~/composables/features/useProjectDelete';
import type { Project } from '~/models/Project';

// Responsive
const MOBILE_BREAKPOINT = 960;
const isMobile = ref(false);

function checkMobile() {
  if (typeof window !== 'undefined') {
    isMobile.value = window.innerWidth < MOBILE_BREAKPOINT;
  }
}

onMounted(() => {
  checkMobile();
  window.addEventListener('resize', checkMobile);

  // Open project modal if URL contains projectId & focus
  const route = useRoute();
  const q = route.query;
  const projectId = String(q.projectId || '');
  const focus = String(q.focus || '');

  // Map focus to slide index: project=0, objective=1, wbs=2
  const focusMap: Record<string, number> = {
    project: 0,
    objective: 1,
    wbs: 2,
  };
  const slideIndex = focusMap[focus] ?? 0;

  if (projectId) {
    const unwatch = watch(projects, async (newVal) => {
      if (newVal && newVal.length) {
        const p = newVal.find((pr: any) => String(pr._id ?? pr.id) === projectId);
        if (p) {
          try {
            const mod = await import('~/composables/api');
            const { useApi } = mod as typeof import('~/composables/api');
            const api = useApi(`/projects/${projectId}`);
            const { data, error } = await api.get();
            if (!error && data) {
              openModal(data, false, slideIndex);
            } else {
              openModal(p, false, slideIndex);
            }
          } catch (err) {
            openModal(p, false, slideIndex);
          }
        }
        unwatch();
      }
    });
  }
});

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', checkMobile);
  }
});

// Composables
const { projects, updateProject, removeProject, removeProjectById } = useProjects();
const {
  isModalOpen,
  selectedProject,
  startInEdit,
  focusedSlide,
  openModal,
  closeModal,
  createNewProject,
} = useProjectModal();
const { showDeleteDialog, projectToDelete, requestDelete, confirmDelete } = useProjectDelete();

// Local state
const hoveredProject = ref<any>(null);

// Event handlers
const onProjectHover = (project: any) => {
  hoveredProject.value = project;
};

const onProjectClick = (project: Project) => {
  openModal(project, false);
};

const onCreateProject = () => {
  createNewProject();
};

const onUpdated = (updated: Project) => {
  updateProject(updated);
  closeModal();
};

const onDeleted = (removed: Project) => {
  removeProject(removed);
  closeModal();
};

const onRequestDelete = (project: Project) => {
  requestDelete(project);
};

const onConfirmDelete = async (deleteTasks: boolean) => {
  await confirmDelete(deleteTasks, (projectId) => {
    removeProjectById(projectId);
  });
};
</script>

<style scoped>
.projects-page-viewport {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.diegetic-header-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1.5rem;
  background: linear-gradient(180deg, rgba(20, 15, 12, 0.95) 0%, rgba(10, 8, 6, 0.85) 100%);
  border-bottom: 2px solid hsl(25, 30%, 25%);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
  z-index: 20;
}

.header-title-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.header-main-title {
  font-family: var(--font-guild-title, 'Cinzel', serif);
  font-size: 1.25rem;
  color: hsl(38, 65%, 85%);
  margin: 0;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.8);
}

.header-subtitle {
  font-size: 0.75rem;
  color: hsl(35, 30%, 65%);
  margin: 0;
}

.header-status-badge {
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid hsl(35, 40%, 30%);
  padding: 0.35rem 0.75rem;
  border-radius: 4px;
}

.status-count {
  font-family: var(--font-guild-title, 'Cinzel', serif);
  font-size: 0.8rem;
  color: #fef08a;
  font-weight: 700;
}

.projects-main-content {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  padding: 1rem 0;
}

.mobile-projects-wrapper {
  width: 100%;
  height: 100%;
}
</style>
