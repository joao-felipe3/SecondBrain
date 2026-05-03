import { defineStore } from 'pinia'
import { useApi } from '../composables/api/useApi'
import type { Task } from '~/models/Task'

function isRequestAborted(error: any) {
  return (
    error?.code === 'ERR_CANCELED' ||
    error?.name === 'CanceledError' ||
    error?.message?.includes?.('aborted')
  )
}

let loadTasksPromise: Promise<void> | null = null

export const useTaskStore = defineStore('task', {
  state: () => ({
    tasks: [] as Task[],
    isLoading: false,
  }),

  getters: {
    activeTasks: (state) => state.tasks.filter(t => !t.isConcluded),
    
    completedTasks: (state) => state.tasks.filter(t => t.isConcluded),
    
    lateTasks: (state) => state.tasks.filter(t => t.late && !t.isConcluded),
    
    getTaskById: (state) => (id: string) => 
      state.tasks.find(t => t._id === id),
    
    tasksByProject: (state) => (projectId: string) => 
      state.tasks.filter(t => t.project === projectId),

    getMicroTasksForProject: (state) => (projectId: string) =>
      state.tasks.filter(
        t => t.project === projectId && !!t.microTaskType,
      ),

    /**
     * Sprint 2: Get completion percentage for a micro-task's checklist
     */
    getChecklistProgress: (state) => (taskId: string) => {
      const task = state.tasks.find(t => t._id === taskId)
      if (!task || !Array.isArray(task.checklist) || task.checklist.length === 0) {
        return 0
      }

      const completed = task.checklist.filter((item: any) => item.completed).length
      return Math.round((completed / task.checklist.length) * 100)
    },

    /**
     * Get tasks filtered by status and optionally by project, sorted by kanban order and priority
     */
    getTasksByStatus: (state) => (status: 'todo' | 'doing' | 'review' | 'done', projectId?: string) => {
      let filtered = state.tasks.filter(t => t.status === status)

      if (projectId) {
        filtered = filtered.filter(t => t.project === projectId)
      }

      // Sort by kanbanOrder (if present), then by priority, then by createdAt
      return filtered.sort((a, b) => {
        if (a.kanbanOrder !== undefined && b.kanbanOrder !== undefined) {
          return a.kanbanOrder - b.kanbanOrder
        }
        const priorityA = a.priority || 0
        const priorityB = b.priority || 0
        if (priorityA !== priorityB) return priorityB - priorityA
        const dateA = new Date(a.createdAt || 0).getTime()
        const dateB = new Date(b.createdAt || 0).getTime()
        return dateB - dateA
      })
    },

    /**
     * Get ancestor chain (lineage) of a task by walking up parent references
     */
    getLineage: (state) => (taskId: string) => {
      const lineage: Task[] = []
      let current = state.tasks.find(t => t._id === taskId)

      while (current) {
        lineage.unshift(current)
        if (!current.parentTaskId) break
        current = state.tasks.find(t => t._id === current?.parentTaskId)
      }

      return lineage
    },
  },

  actions: {
    async loadTasks() {
      if (loadTasksPromise) {
        return loadTasksPromise
      }

      this.isLoading = true
      loadTasksPromise = (async () => {
        try {
          const { get } = useApi('/tasks')
          const { data, error } = await get()

          if (!error) {
            this.tasks = data
          } else if (!isRequestAborted(error)) {
            console.error('Erro ao carregar tarefas:', error)
          }
        } finally {
          this.isLoading = false
          loadTasksPromise = null
        }
      })()

      return loadTasksPromise
    },

    async createTask(newTask: Partial<Task>) {
      const { post } = useApi('/tasks')
      const { data, error } = await post(newTask)
      
      if (!error && data) {
        this.tasks.push(data)
        return data
      } else {
        console.error('Erro ao criar tarefa:', error)
        return null
      }
    },

    async createMicroTask(newTask: Partial<Task>) {
      const { post } = useApi('/tasks/micro')
      const { data, error } = await post(newTask)

      if (!error && data) {
        this.tasks.push(data)
        return data
      }

      console.error('Erro ao criar micro-tarefa:', error)
      return null
    },

    async updateMicroTaskChecklist(id: string, checklist: Task['checklist']) {
      const { post } = useApi(`/tasks/${id}/checklist`)
      const { data, error } = await post({ checklist })

      if (!error && data) {
        const index = this.tasks.findIndex(t => t._id === id)
        if (index !== -1) {
          this.tasks[index] = data
        }
        return data
      }

      console.error('Erro ao atualizar checklist da micro-tarefa:', error)
      return null
    },

    /**
     * Sprint 2: Update a single checklist item by index
     */
    async updateMicroTaskChecklistItem(taskId: string, itemIndex: number, completed: boolean) {
      const { patch } = useApi(`/tasks/${taskId}/checklist/${itemIndex}`)
      const { data, error } = await patch({ completed })

      if (!error && data) {
        const taskIndex = this.tasks.findIndex(t => t._id === taskId)
        if (taskIndex !== -1) {
          this.tasks[taskIndex] = data
        }
        return data
      }

      console.error('Erro ao atualizar item do checklist:', error)
      return null
    },

    /**
     * Sprint 2: Update full checklist with new items
     */
    async updateMicroTaskChecklistFull(id: string, checklist: Task['checklist']) {
      const { post } = useApi(`/tasks/${id}/checklist`)
      const { data, error } = await post({ checklist })

      if (!error && data) {
        const index = this.tasks.findIndex(t => t._id === id)
        if (index !== -1) {
          this.tasks[index] = data
        }
        return data
      }

      console.error('Erro ao atualizar checklist completo:', error)
      return null
    },

    async updateTask(id: string, updatedData: Partial<Task>) {
      const { patch } = useApi(`/tasks/${id}`)
      const { data, error } = await patch(updatedData)
      
      if (!error && data) {
        const index = this.tasks.findIndex(t => t._id === id)
        if (index !== -1) {
          this.tasks[index] = data
        }
        return data
      } else {
        console.error('Erro ao atualizar tarefa:', error)
        return null
      }
    },

    async deleteTask(id: string) {
      const { remove } = useApi(`/tasks/${id}`)
      const { error } = await remove()
      
      if (!error) {
        this.tasks = this.tasks.filter(t => t._id !== id)
        return true
      } else {
        console.error('Erro ao remover tarefa:', error)
        return false
      }
    },

    async concludeTask(id: string) {
      const { patch } = useApi(`/tasks/${id}/conclude`)
      const { data, error } = await patch()
      
      if (!error && data) {
        const index = this.tasks.findIndex(t => t._id === id)
        if (index !== -1) {
          this.tasks[index] = data
        }
        return data
      } else {
        console.error('Erro ao concluir tarefa:', error)
        return null
      }
    },

    async incrementPomodoro(id: string) {
      const { patch } = useApi(`/tasks/${id}/increment-pomodoro`)
      const { data, error } = await patch()
      
      if (!error && data) {
        const index = this.tasks.findIndex(t => t._id === id)
        if (index !== -1) {
          this.tasks[index] = data
        }
        return data
      } else {
        console.error('Erro ao incrementar pomodoro:', error)
        return null
      }
    },

    removeTaskById(id: string) {
      this.tasks = this.tasks.filter(t => t._id !== id)
    },

    /**
     * Sprint 4: Move task to new Kanban status
     * If status='done': calls PATCH /tasks/:id/conclude (with checklist validation)
     * Otherwise: calls PATCH /tasks/:id/status
     */
    async setTaskStatus(id: string, toStatus: 'todo' | 'doing' | 'review' | 'done') {
      try {
        let data: Task | null = null
        let error: any = null

        if (toStatus === 'done') {
          // Moving to done = concluding the task
          const { patch } = useApi(`/tasks/${id}/conclude`)
          const result = await patch()
          data = result.data
          error = result.error
        } else {
          // Moving to other status
          const { patch } = useApi(`/tasks/${id}/status`)
          const result = await patch({ status: toStatus })
          data = result.data
          error = result.error
        }

        if (!error && data) {
          const index = this.tasks.findIndex(t => t._id === id)
          if (index !== -1) {
            this.tasks[index] = data
          }
          return { success: true, data }
        } else {
          // Try to extract detailed message from axios error if present
          const detailed = error?.response?.data?.message || error?.message || 'Unknown error'
          console.error('Erro ao mover tarefa para status:', detailed, error)
          return { success: false, error: detailed }
        }
      } catch (err: any) {
        const detailed = err?.response?.data?.message || err?.message || 'Unknown error'
        console.error('Erro ao setTaskStatus:', detailed, err)
        return { success: false, error: detailed }
      }
    },

    /**
     * Alias for setTaskStatus with better naming semantics
     */
    async moveTaskToStatus(id: string, toStatus: 'todo' | 'doing' | 'review' | 'done') {
      return this.setTaskStatus(id, toStatus)
    },
  }
})
