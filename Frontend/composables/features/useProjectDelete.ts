import { ref } from 'vue'
import type { Project } from '~/models/Project'

export function useProjectDelete() {
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
      const response = await fetch(
        `http://localhost:3000/projects/${projectId}?deleteTasks=${deleteTasks}`,
        { method: 'DELETE' }
      )

      if (!response.ok) {
        throw new Error('Failed to delete project')
      }

      const result = await response.json()
      console.log(result.message)

      if (onSuccess && projectId) {
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
