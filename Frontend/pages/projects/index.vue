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
          @delete-project="onDeleted"
        />
      </v-col>
      <v-col cols="6" class="d-flex flex-column align-start position-relative">
        <div style="width: 100%; padding-left: 5%;">
          <BookShelf class="bookshelf-squashed" :projectColors="projectColors" :hoveredProjectIndex="hoveredProjectIndex" />
        </div>
        <div class="book-container">
          <Book class="book-bottom" />
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
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'

import ProjectPanel from '../../components/ProjectPanel.vue'
import Book from '../../components/Svg/Book.vue'
import BookShelf from '../../components/Svg/BookShelf.vue'
import BookModal from '../../components/BookModal.vue'
import { useApiResource } from '~/composables/useApi'
import type { Project } from '~/composables/useProjectEditing'

// Estado para controlar qual projeto está em hover
const hoveredProjectIndex = ref(-1)

// Estado para controlar o modal
const isModalOpen = ref(false)
const selectedProject = ref<Project | null>(null)
const startInEdit = ref(false)

// Lista real de projetos buscada do backend
const projects = ref<Project[]>([])
const api = useApiResource('/projects')

onMounted(async () => {
  const { data, error } = await api.list()
  if (error) {
    console.error('Failed to load projects', error)
  } else if (data) {
    projects.value = Array.isArray(data) ? data : []
  }
})

// Função para lidar com hover de projetos
const onProjectHover = (projectIndex: number) => {
  hoveredProjectIndex.value = projectIndex
}

// Função para lidar com clique de projetos
const onProjectClick = (project: Project) => {
  selectedProject.value = project
  startInEdit.value = false
  isModalOpen.value = true
}

const onCreateProject = () => {
  // Minimal blank project draft; BookModal composable will handle editing state
  selectedProject.value = {
    _id: undefined,
    name: '',
    description: '',
    color: '#D2B48C',
    startDate: new Date().toISOString().slice(0,10),
    deadline: new Date().toISOString().slice(0,10),
    totalHoursWorked: 0,
    plannedHours: 0,
    shortTermGoal: '',
    midTermGoal: '',
    longTermGoal: '',
    status: 'pending',
    progressPercentage: 0,
    experience: 0,
    reward: 0
  }
  startInEdit.value = true
  isModalOpen.value = true
}

// Função para fechar o modal
const closeModal = () => {
  isModalOpen.value = false
  selectedProject.value = null
  startInEdit.value = false
}

// Atualizações/remoções vindas do modal
const onUpdated = (updated: Project) => {
  if (!updated) return
  const id = updated._id ?? updated.id
  const idx = projects.value.findIndex(p => (p._id ?? p.id) === id)
  if (idx >= 0) {
    projects.value[idx] = { ...projects.value[idx], ...updated }
  } else {
    projects.value.push(updated)
  }
  // opcional: fechar após salvar
  closeModal()
}

const onDeleted = (removed: Project) => {
  if (!removed) return
  const id = removed._id ?? removed.id
  projects.value = projects.value.filter(p => (p._id ?? p.id) !== id)
  closeModal()
}

// Extrair as cores dos projetos
const projectColors = computed(() => 
  (projects.value || []).map(project => project.color)
)

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
