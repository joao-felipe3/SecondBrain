import { ref } from 'vue'
import { useProjectStore } from '~/stores/project'
import type { Project } from '~/models/Project'

export function useProjectDelete() {
  const projectStore = useProjectStore()
  const showDeleteDialog = ref(false)
  const projectToDelete = ref<Project | null>(null)

  function requestDelete(project: Project) {
    projectToDelete.value = project
    showDeleteDialog.value = true
  }

  async function confirmDelete(deleteTasks: boolean, onSuccess?: (projectId: string) => void) {
    if (!projectToDelete.value) return

    try {
      const projectId = projectToDelete.value._id
      if (!projectId) return

      await projectStore.deleteProject(projectId, deleteTasks)

      if (onSuccess) {
        onSuccess(projectId)
      }

      projectToDelete.value = null
    } catch (error) {
      console.error('Error deleting project:', error)
    }
  }

  return {
    showDeleteDialog,
    projectToDelete,
    requestDelete,
    confirmDelete
  }
}
