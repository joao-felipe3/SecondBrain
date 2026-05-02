import { ref } from 'vue'
import type { Project } from '~/models/Project'

export function useProjectModal() {
  const isModalOpen = ref(false)
  const selectedProject = ref<Project | null>(null)
  const startInEdit = ref(false)
  const focusedSlide = ref(0)

  function openModal(project: Project, editMode = false, slideIndex = 0) {
    selectedProject.value = project
    startInEdit.value = editMode
    focusedSlide.value = slideIndex
    isModalOpen.value = true
  }

  function closeModal() {
    isModalOpen.value = false
    selectedProject.value = null
    startInEdit.value = false
  }

  function createNewProject() {
    const newProject: Project = {
      _id: undefined,
      name: '',
      description: '',
      color: '#D2B48C',
      startDate: new Date().toISOString().slice(0, 10),
      deadline: new Date().toISOString().slice(0, 10),
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
    openModal(newProject, true)
  }

  return {
    isModalOpen,
    selectedProject,
    startInEdit,
    focusedSlide,
    openModal,
    closeModal,
    createNewProject
  }
}
