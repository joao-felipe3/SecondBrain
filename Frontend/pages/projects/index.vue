<template>
    <v-row dense class="gap-x-2 ml-n6" style="min-height: 100vh;">
      <v-col cols="6" class="d-flex align-center justify-center" style="min-height: 100vh;">
        <ProjectPanel
          title="Projects"
          :titleOffset="'-10%'"
          :contentStyle="{ minHeight: '70vh' }"
          :projects="projects"
          @project-hover="onProjectHover"
          @project-click="onProjectClick"
          @create-project="onCreateProject"
          @request-delete="onRequestDelete"
        />
      </v-col>
      <v-col cols="6" class="d-flex flex-column align-start position-relative">
        <div style="width: 100%; padding-left: 5%;">
          <ClientOnly>
            <BookShelf class="bookshelf-squashed" :projectColors="projectColors" :hoveredProjectIndex="hoveredProjectIndex" />
          </ClientOnly>
        </div>
        <div class="book-container">
          <ClientOnly>
            <Book class="book-bottom" />
          </ClientOnly>
        </div>
      </v-col>
    </v-row>
    
    <!-- Modal do livro -->
    <BookModal 
      :isOpen="isModalOpen"
      :project="selectedProject"
      :startInEdit="startInEdit"
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
</template>

<script setup lang="ts">
import { ref } from 'vue'
import ProjectPanel from '../../components/features/projects/ProjectPanel.vue'
import Book from '../../components/ui/svg/Book.vue'
import BookShelf from '../../components/ui/svg/BookShelf.vue'
import BookModal from '../../components/features/projects/BookModal.vue'
import DeleteProjectDialog from '../../components/shared/dialogs/DeleteProjectDialog.vue'
import { useProjects } from '~/composables/features/useProjects'
import { useProjectModal } from '~/composables/features/useProjectModal'
import { useProjectDelete } from '~/composables/features/useProjectDelete'
import type { Project } from '~/composables/features/useProjectEditing'

// Composables
const { projects, projectColors, updateProject, removeProject, removeProjectById } = useProjects()
const { isModalOpen, selectedProject, startInEdit, openModal, closeModal, createNewProject } = useProjectModal()
const { showDeleteDialog, projectToDelete, requestDelete, confirmDelete } = useProjectDelete()

// Local state
const hoveredProjectIndex = ref(-1)

// Event handlers
const onProjectHover = (projectIndex: number) => {
  hoveredProjectIndex.value = projectIndex
}

const onProjectClick = (project: Project) => {
  openModal(project, false)
}

const onCreateProject = () => {
  createNewProject()
}

const onUpdated = (updated: Project) => {
  updateProject(updated)
  closeModal()
}

const onDeleted = (removed: Project) => {
  removeProject(removed)
  closeModal()
}

const onRequestDelete = (project: Project) => {
  requestDelete(project)
}

const onConfirmDelete = async (deleteTasks: boolean) => {
  await confirmDelete(deleteTasks, (projectId) => {
    removeProjectById(projectId)
  })
}

</script>

<style scoped>
.bookshelf-squashed {
  width: 90%;
  height: 44vh;
  /* Força o SVG a ignorar proporções originais */
  display: block;
}

.bookshelf-squashed svg {
  width: 100% !important;
  height: 100% !important;
}

.book-container {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  padding-left: 5%;
  padding-right: 5%;
  /* Invade um pouco o espaço do BookShelf */
  bottom: -2vh;
}

.book-bottom {
  width: 100%;
  height: 100%;
  /* Remove qualquer margem */
  margin: 0;
}

.book-bottom svg {
  width: 100% !important;
  height: 100% !important;
}
</style>
