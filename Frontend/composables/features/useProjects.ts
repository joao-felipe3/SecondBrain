import { ref, computed, onMounted } from 'vue'
import { useApiResource } from '~/composables/api/useApi'
import type { Project } from '~/models/Project'

export function useProjects() {
  const projects = ref<Project[]>([])
  const api = useApiResource('/projects')
  const isLoading = ref(false)

  const projectColors = computed(() => 
    (projects.value || []).map(project => project.color)
  )

  async function loadProjects() {
    isLoading.value = true
    const { data, error } = await api.list()
    
    if (error) {
      console.error('Failed to load projects', error)
    } else if (data) {
      projects.value = Array.isArray(data) ? data : []
      await loadTaskCounts()
    }
    
    isLoading.value = false
  }

  async function loadTaskCounts() {
    for (const project of projects.value) {
      try {
        const response = await fetch(`http://localhost:3000/projects/${project._id}/tasks`)
        const tasks = await response.json()
        project.taskCount = tasks.length
      } catch (error) {
        console.error(`Failed to load task count for project ${project._id}`, error)
        project.taskCount = 0
      }
    }
  }

  function updateProject(updated: Project) {
    if (!updated) return
    const id = updated._id ?? updated.id
    const idx = projects.value.findIndex(p => (p._id ?? p.id) === id)
    
    if (idx >= 0) {
      projects.value[idx] = { ...projects.value[idx], ...updated }
    } else {
      projects.value.push(updated)
    }
  }

  function removeProject(removed: Project) {
    if (!removed) return
    const id = removed._id ?? removed.id
    projects.value = projects.value.filter(p => (p._id ?? p.id) !== id)
  }

  function removeProjectById(projectId: string) {
    projects.value = projects.value.filter(p => p._id !== projectId)
  }

  onMounted(async () => {
    await loadProjects()
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
