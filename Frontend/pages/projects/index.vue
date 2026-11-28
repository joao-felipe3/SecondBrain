<template>
  <div class="projects-page-viewport diegetic-stone-wall">
    <!-- Retorno ao saguão ancorado na cena (sem barra de navegação, como as demais telas diegéticas) -->
    <NuxtLink to="/" class="diegetic-btn-back projects-back" title="Retornar ao Saguão">
      <span class="btn-icon">🏛️</span>
      <span class="btn-text">Retornar ao Saguão</span>
    </NuxtLink>

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

      <!-- Versão Desktop: a sala da biblioteca é o palco; as baias recebem os tomos -->
      <!-- O palco vai para o body: fica acima do layout (que captura cliques) e abaixo da navegação lateral -->
      <Teleport v-if="!isMobile" to="body">
        <div class="library-canvas">
          <!-- Palco com a proporção da imagem, ampliado para cobrir toda a tela (como o saguão) -->
          <div class="library-stage">
            <img class="library-bg" src="/imagens/Projects-expandido.webp" alt="" aria-hidden="true" />
            <!-- Luz viva da sala (janela, lanterna, tochas e velas): entre a imagem e as capas -->
            <LibraryLights />
            <GrimoireBayShelf
              :projects="projects"
              @select-project="onProjectClick"
              @create-project="onCreateProject"
              @project-hover="onProjectHover"
            />
          </div>
          <button
            type="button"
            class="drawer-toggle"
            :aria-expanded="drawerOpen ? 'true' : 'false'"
            aria-controls="projects-drawer"
            @click="drawerOpen = !drawerOpen"
          >
            📜 Lista de tomos
          </button>
        </div>
      </Teleport>
    </main>

    <!-- Lista de tomos (painel de pergaminho), aberta sob demanda no desktop -->
    <aside
      v-if="!isMobile"
      id="projects-drawer"
      class="projects-drawer"
      :class="{ 'is-open': drawerOpen }"
      :aria-hidden="!drawerOpen"
      :inert="!drawerOpen"
    >
      <button
        type="button"
        class="drawer-close"
        aria-label="Fechar lista de tomos"
        @click="drawerOpen = false"
      >
        ✕
      </button>
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
    </aside>

    <!-- Livro em tela cheia: etapas do planejamento como páginas -->
    <GrimoireBookViewer
      :isOpen="isViewerOpen"
      :project="viewerProject"
      :initialChapter="viewerChapter"
      :origin="viewerOrigin"
      @close="closeViewer"
      @open-editor="onOpenEditor"
    />

    <!-- Modal de edição (criar, editar, excluir, configurações) -->
    <BookModal
      :isOpen="isModalOpen"
      :project="selectedProject"
      :startInEdit="startInEdit"
      :focusedSlide="focusedSlide"
      :instant="instantOpen"
      @close="closeModal"
      @updated="onUpdated"
      @refreshed="onRefreshed"
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
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';

// Tela em tela cheia, sem o layout padrão (navegação lateral e cabeçalho)
definePageMeta({ layout: false });
import { useRoute } from '#imports';
import ProjectPanel from '../../components/features/projects/ProjectPanel.vue';
import GrimoireBayShelf from '../../components/features/projects/GrimoireBayShelf.vue';
import GrimoireGridMobile from '../../components/features/projects/GrimoireGridMobile.vue';
import GrimoireBookViewer from '../../components/features/projects/GrimoireBookViewer.vue';
import BookModal from '../../components/features/projects/BookModal.vue';
import LibraryLights from '../../components/features/projects/LibraryLights.vue';
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
  instantOpen,
  openModal,
  closeModal,
  createNewProject,
} = useProjectModal();
const { showDeleteDialog, projectToDelete, requestDelete, confirmDelete } = useProjectDelete();

// Local state
const hoveredProject = ref<any>(null);

// Lista de tomos (gaveta lateral no desktop)
const drawerOpen = ref(false);

// Livro em tela cheia (seleção na estante)
const isViewerOpen = ref(false);
const viewerSource = ref<Project | null>(null);
const viewerChapter = ref(0);
// Posição da capa clicada, de onde o livro sai na abertura
const viewerOrigin = ref<DOMRect | null>(null);
// Usa a versão mais recente do store (após salvar no modal de edição)
const viewerProject = computed<Project | null>(() => {
  const source = viewerSource.value;
  if (!source) return null;
  const id = String(source._id ?? source.id ?? '');
  return projects.value.find((p: Project) => String(p._id ?? p.id ?? '') === id) ?? source;
});

// Event handlers
const onProjectHover = (project: any) => {
  hoveredProject.value = project;
};

const onProjectClick = (project: Project, origin: DOMRect | null = null) => {
  viewerSource.value = project;
  viewerChapter.value = 0;
  viewerOrigin.value = origin;
  isViewerOpen.value = true;
};

const closeViewer = () => {
  isViewerOpen.value = false;
};

// Edição: fecha o livro e abre o modal na etapa de origem
const onOpenEditor = (chapter: number) => {
  const project = viewerProject.value;
  isViewerOpen.value = false;
  if (project) {
    // O livro já estava aberto na visualização: o modal abre direto, sem animação de entrada
    openModal(project, false, chapter, true);
  }
};

const onCreateProject = () => {
  createNewProject();
};

const onUpdated = (updated: Project) => {
  updateProject(updated);
  closeModal();
};

// Recarga com o livro aberto (WBS salva, ondas planejadas, objetivo SMART): só atualiza a lista.
const onRefreshed = (updated: Project) => {
  updateProject(updated);
  // Mantém o livro aberto com os dados novos (ex.: prazo ajustado pelo planejamento em ondas).
  const openId = (selectedProject.value as any)?._id;
  if (openId && openId === (updated as any)?._id) selectedProject.value = updated;
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
  position: relative;
  background: linear-gradient(180deg, rgba(20, 15, 12, 0.82) 0%, rgba(10, 8, 6, 0.6) 100%);
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
  /* Espaço para o botão de retorno fixo no canto */
  padding-top: 4.5rem;
  box-sizing: border-box;
}
/* Tela inteira, como o saguão: a sala é ampliada até cobrir o viewport (sem faixas).
   Fica no body, acima do layout e abaixo da navegação lateral e do cabeçalho. */

.library-canvas {
  position: fixed;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  background: #0d0806;
}

/* Palco com a proporção 16:9 da imagem: as baias usam porcentagens deste retângulo */
.library-stage {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: max(100vw, calc(100dvh * 16 / 9));
  aspect-ratio: 16 / 9;
}

.library-bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: fill;
  pointer-events: none;
  user-select: none;
}

/* Retorno ao saguão: canto superior esquerdo, sobre a cena */
.projects-back {
  position: fixed;
  top: 16px;
  left: 16px;
  z-index: 6;
}

.drawer-toggle {
  /* Logo abaixo do botão de retorno, no canto superior esquerdo */
  position: fixed;
  top: 72px;
  left: 16px;
  z-index: 5;
  padding: 0.4rem 0.85rem;
  border-radius: 4px;
  border: 1px solid hsl(45, 90%, 55%);
  background: linear-gradient(180deg, hsl(43, 85%, 45%) 0%, hsl(35, 75%, 28%) 100%);
  color: #fff;
  font-family: var(--font-guild-title, 'Cinzel', serif);
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
}

/* Gaveta com a lista de tomos (painel de pergaminho) */
.projects-drawer {
  position: fixed;
  top: 72px;
  left: 0;
  bottom: 0;
  z-index: 30;
  width: min(460px, 92vw);
  padding: 1rem;
  box-sizing: border-box;
  overflow-y: auto;
  background: rgba(10, 8, 6, 0.94);
  box-shadow: 8px 0 24px rgba(0, 0, 0, 0.6);
  transform: translateX(-105%);
  transition: transform 0.35s ease;
}

.projects-drawer.is-open {
  transform: translateX(0);
}

.drawer-close {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  z-index: 1;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: none;
  background: rgba(60, 35, 15, 0.9);
  color: #fff;
  cursor: pointer;
}

/* Celular: a mesma sala como fundo atenuado atrás da grade de tomos */
.mobile-projects-wrapper {
  background:
    linear-gradient(180deg, rgba(10, 6, 4, 0.72) 0%, rgba(10, 6, 4, 0.9) 100%),
    url('/imagens/Projects-expandido.webp') center / cover no-repeat;
}

@media (prefers-reduced-motion: reduce) {
  .projects-drawer {
    transition: none;
  }
}
</style>
