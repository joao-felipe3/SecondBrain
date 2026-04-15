import { defineStore } from 'pinia'
import { useApi } from '../composables/api/useApi'
import type { Task } from '~/models/Task'

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
  },

  actions: {
    async loadTasks() {
      this.isLoading = true
      const { get } = useApi('/tasks')
      const { data, error } = await get()
      
      if (!error) {
        this.tasks = data
      } else {
        console.error('Erro ao carregar tarefas:', error)
      }
      
      this.isLoading = false
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
  }
})
