import { defineStore } from 'pinia'
import { useApi } from '~/composables/api/useApi'
import type { Task } from '~/models/Task'

function isRecurringTemplate(task: Partial<Task> | null | undefined): boolean {
  // Template recorrente: possui recurringRule, mas NÃO é uma ocorrência.
  // O backend cria template (isRecurringInstance: false) + ocorrência (isRecurringInstance: true).
  // O template não deve aparecer no Kanban para não duplicar papers.
  return Boolean(task?.recurringRule) && task?.isRecurringInstance === false && !task?.parentRecurringId
}

function cleanPayload<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .map((v) => cleanPayload(v))
      .filter((v) => v !== null && v !== undefined) as any
  }

  if (value && typeof value === 'object') {
    const out: any = {}
    for (const [key, v] of Object.entries(value as any)) {
      if (v === null || v === undefined) continue
      out[key] = cleanPayload(v)
    }
    return out
  }

  return value
}

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
    habitsDashboard: null as null | {
      totalHabits: number
      activeHabits: number
      averageAderencePercent: number
      streaksOver7Days: number
      dueTodayCount: number
      dueTodayHabits: Array<{
        id: string
        name: string
        deadline: string | Date | null
      }>
      habits: Array<{
        id: string
        name: string
        status: string
        currentStreak: number
        longestStreak: number
        aderencePercent: number
        lastCompletedDate: string | Date | null
        deadline: string | Date | null
      }>
    },
    isHabitsLoading: false,
  }),

  getters: {
    activeTasks: (state) => state.tasks.filter(t => !isRecurringTemplate(t) && !t.isConcluded),
    
    completedTasks: (state) => state.tasks.filter(t => !isRecurringTemplate(t) && t.isConcluded),
    
    lateTasks: (state) => state.tasks.filter(t => !isRecurringTemplate(t) && t.late && !t.isConcluded),
    
    getTaskById: (state) => (id: string) => 
      state.tasks.find(t => t._id === id),
    
    tasksByProject: (state) => (projectId: string) => 
      state.tasks.filter(t => !isRecurringTemplate(t) && t.project === projectId),

    getMicroTasksForProject: (state) => (projectId: string) =>
      state.tasks.filter(
        t => !isRecurringTemplate(t) && t.project === projectId && !!t.microTaskType,
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
      let filtered = state.tasks.filter(t => !isRecurringTemplate(t) && t.status === status)

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

    recurringTasks: (state) =>
      state.tasks.filter((task) =>
        !isRecurringTemplate(task) &&
        Boolean(task.recurringRule || task.parentRecurringId || task.microTaskType === 'habit'),
      ),

    habitDashboardHabits: (state) =>
      state.habitsDashboard?.habits || [],

    /**
     * Return habits optionally filtered by project or other simple filters
     */
    getHabits: (state) => (filters?: { projectId?: string }) => {
      let list = state.tasks.filter((t) =>
        !isRecurringTemplate(t) &&
        (t.microTaskType === 'habit' || Boolean(t.recurringRule) || Boolean(t.parentRecurringId)),
      )
      if (filters?.projectId) {
        list = list.filter((t) => t.project === filters.projectId)
      }
      return list
    },

    /**
     * Return streak data for a recurring series from the dashboard if available
     */
    getStreakForHabit: (state) => (parentRecurringId: string) => {
      if (!state.habitsDashboard || !Array.isArray(state.habitsDashboard.habits)) {
        return { currentStreak: 0, longestStreak: 0, aderencePercent: 0 }
      }
      const found = state.habitsDashboard.habits.find(h => String(h.id) === String(parentRecurringId))
      if (!found) return { currentStreak: 0, longestStreak: 0, aderencePercent: 0 }
      return {
        currentStreak: found.currentStreak || 0,
        longestStreak: found.longestStreak || 0,
        aderencePercent: found.aderencePercent || 0,
      }
    },

    /**
     * Habits sorted by streak (descending)
     */
    getHabitsByStreak: (state) => () => {
      const list = state.habitsDashboard?.habits ? state.habitsDashboard.habits.slice() : []
      return list.sort((a, b) => (b.currentStreak || 0) - (a.currentStreak || 0))
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

    async loadHabitsDashboard(projectId?: string) {
      this.isHabitsLoading = true

      try {
        const resource = projectId
          ? `/habits/dashboard?projectId=${encodeURIComponent(projectId)}`
          : '/habits/dashboard'

        const { get } = useApi(resource)
        const { data, error } = await get()

        if (!error && data) {
          this.habitsDashboard = data
          return data
        }

        if (!isRequestAborted(error)) {
          console.error('Erro ao carregar dashboard de hábitos:', error)
        }

        return null
      } finally {
        this.isHabitsLoading = false
      }
    },

    async createTask(newTask: Partial<Task>) {
      const { post } = useApi('/tasks')
      const payload: any = cleanPayload({
        ...newTask,
        pomodorosPlanned:
          newTask.pomodorosPlanned === null || newTask.pomodorosPlanned === undefined
            ? 1
            : newTask.pomodorosPlanned,
      })

      const { data, error } = await post(payload)
      
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
      const payload: any = cleanPayload({
        ...newTask,
        pomodorosPlanned:
          newTask.pomodorosPlanned === null || newTask.pomodorosPlanned === undefined
            ? 1
            : newTask.pomodorosPlanned,
      })
      const { data, error } = await post(payload)

      if (!error && data) {
        this.tasks.push(data)
        return data
      }

      console.error('Erro ao criar micro-tarefa:', error)
      return null
    },

    async createHabit(newTask: Partial<Task>) {
      const payload: Partial<Task> = {
        ...newTask,
        microTaskType: 'habit',
        recurringRule: newTask.recurringRule || {
          frequency: 'daily',
          interval: 1,
          daysOfWeek: [],
          exceptions: [],
        },
      }

      const { post } = useApi('/tasks/habit/create')
      const cleaned: any = cleanPayload({
        ...payload,
        pomodorosPlanned:
          payload.pomodorosPlanned === null || payload.pomodorosPlanned === undefined
            ? 1
            : payload.pomodorosPlanned,
      })
      const { data, error } = await post(cleaned)

      if (!error && data) {
        this.tasks.push(data)
        return data
      }

      console.error('Erro ao criar hábito:', error)
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

    async skipRecurringTask(id: string) {
      const { post } = useApi(`/tasks/${id}/skip`)
      const { data, error } = await post({})

      if (!error && data) {
        const index = this.tasks.findIndex(t => t._id === id)
        if (index !== -1) {
          this.tasks[index] = data
        }

        if (this.habitsDashboard?.habits) {
          const dashboardHabit = this.habitsDashboard.habits.find((habit) => habit.id === id)
          if (dashboardHabit) {
            dashboardHabit.status = data.status || dashboardHabit.status
            dashboardHabit.currentStreak = Math.max(0, dashboardHabit.currentStreak)
          }
        }

        return { success: true, data }
      }

      console.error('Erro ao pular hábito:', error)
      return { success: false, error: error?.response?.data?.message || error?.message || 'Unknown error' }
    },

    async updateRecurringRule(id: string, recurringRule: Task['recurringRule']) {
      const { patch } = useApi(`/tasks/${id}/recurring-rule`)
      const { data, error } = await patch({ recurringRule })

      if (!error && data) {
        const index = this.tasks.findIndex(t => t._id === id)
        if (index !== -1) {
          this.tasks[index] = data
        }

        return { success: true, data }
      }

      console.error('Erro ao atualizar regra recorrente:', error)
      return { success: false, error: error?.response?.data?.message || error?.message || 'Unknown error' }
    },

    /**
     * Completa um hábito recorrente:
     * 1. Move o status para "done"
     * 2. Gera próxima ocorrência (se configurado no backend)
     * 3. Atualiza streak e aderência
     */
    async handleRecurringCompletion(id: string) {
      // Primeiro, mover para status "done"
      const moveResult = await this.setTaskStatus(id, 'done')
      if (!moveResult.success) {
        return moveResult
      }

      // Se moveu com sucesso, tentar gerar próxima ocorrência
      const { post } = useApi(`/tasks/${id}/generate-next-occurrence`)
      const { data: nextOccurrence, error } = await post({})

      if (!error && nextOccurrence) {
        // Adicionar próxima ocorrência à lista de tasks
        this.tasks.push(nextOccurrence)

        // Atualizar aderência no dashboard se existir
        if (this.habitsDashboard?.habits) {
          const dashboardHabit = this.habitsDashboard.habits.find(
            (habit) => habit.id === id || habit.id === nextOccurrence.parentRecurringId
          )
          if (dashboardHabit && nextOccurrence.streakData) {
            dashboardHabit.currentStreak = nextOccurrence.streakData.currentStreak || 0
            dashboardHabit.aderencePercent = nextOccurrence.streakData.aderencePercent || 0
          }
        }

        return { success: true, data: { completed: moveResult.data, nextOccurrence } }
      }

      // Se não conseguiu gerar próxima, ainda assim a conclusão foi bem-sucedida
      console.warn('Não foi possível gerar próxima ocorrência:', error?.message)
      return { success: true, data: moveResult.data }
    },

    async deleteRecurringSeries(parentRecurringId: string) {
      const { remove } = useApi(`/tasks/${parentRecurringId}?confirm=true`)
      const { error } = await remove()

      if (!error) {
        this.tasks = this.tasks.filter(
          (task) => task._id !== parentRecurringId && task.parentRecurringId !== parentRecurringId,
        )

        if (this.habitsDashboard?.habits) {
          this.habitsDashboard.habits = this.habitsDashboard.habits.filter((habit) => habit.id !== parentRecurringId)
        }

        return { success: true }
      }

      console.error('Erro ao remover série recorrente:', error)
      return { success: false, error: error?.response?.data?.message || error?.message || 'Unknown error' }
    },
  }
})
