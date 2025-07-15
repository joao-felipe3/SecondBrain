import { defineStore } from 'pinia'
import { useApi } from '../composables/useApi'

export const useTaskStore = defineStore('task', {
  state: () => ({
    tasks: [] as any[], // ou defina uma interface Task
  }),

  actions: {
    async loadTasks() {
      const { get } = useApi('/tasks')
      const { data, error } = await get()
      if (!error) this.tasks = data
      else console.error('Erro ao carregar tarefas:', error)
    },

    async createTask(newTask: any) {
      const { post } = useApi('/tasks')
      const { data, error } = await post(newTask)
      if (!error && data) this.tasks.push(data)
      else console.error('Erro ao criar tarefa:', error)
    },

    async updateTask(id: string, updatedData: any) {
      const { patch } = useApi(`/tasks/${id}`)
      const { data, error } = await patch(updatedData)
      if (!error && data) {
        const index = this.tasks.findIndex(t => t.id === id)
        if (index !== -1) this.tasks[index] = data
      } else {
        console.error('Erro ao atualizar tarefa:', error)
      }
    },

    async deleteTask(id: string) {
      const { remove } = useApi(`/tasks/${id}`)
      const { error } = await remove()
      if (!error) this.tasks = this.tasks.filter(t => t.id !== id)
      else console.error('Erro ao remover tarefa:', error)
    },

    async concludeTask(id: string) {
      const { patch } = useApi(`/tasks/${id}/conclude`)
      const { data, error } = await patch()
      if (!error && data) {
        const index = this.tasks.findIndex(t => t.id === id)
        if (index !== -1) this.tasks[index] = data
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
        const index = this.tasks.findIndex(t => t.id === id)
        if (index !== -1) this.tasks[index] = data
        return data
      } else {
        console.error('Erro ao incrementar pomodoro:', error)
        return null
      }
    }
  }
})
