import { computed, onMounted } from 'vue'
import { useProjectStore } from '~/stores/project'

export function useProjects() {
  const projectStore = useProjectStore()

  const projects = computed(() => projectStore.projects)
  const projectColors = computed(() => projectStore.projectColors)
  const isLoading = computed(() => projectStore.isLoading)

  async function loadProjects() {
    await projectStore.loadProjects()
  }

  function updateProject(updated: any) {
    projectStore.addOrUpdateProject(updated)
  }

  function removeProject(removed: any) {
    const id = removed._id ?? removed.id
    if (id) {
      projectStore.removeProjectById(id)
    }
  }

  function removeProjectById(projectId: string) {
    projectStore.removeProjectById(projectId)
  }

  onMounted(async () => {
    if (projectStore.projects.length === 0) {
      await loadProjects()
    }
  })

  return {
    projects,
    projectColors,
    isLoading,
    loadProjects,
    updateProject,
    removeProject,
    removeProjectById
  }
}
