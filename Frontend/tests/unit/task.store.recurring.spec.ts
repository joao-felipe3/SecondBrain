import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useTaskStore } from '~/stores/task'

const apiHandlers = vi.hoisted(() => {
  return {
    post: vi.fn(),
    patch: vi.fn(),
    remove: vi.fn(),
    get: vi.fn(),
  }
})

vi.mock('~/composables/api/useApi', () => {
  return {
    useApi: (path: string) => {
      return {
        post: (body?: any) => apiHandlers.post(path, body),
        patch: (body?: any) => apiHandlers.patch(path, body),
        remove: () => apiHandlers.remove(path),
        get: () => apiHandlers.get(path),
      }
    },
  }
})

describe('Task Store - recurring actions', () => {
  beforeEach(() => {
    setActivePinia(createPinia())

    apiHandlers.post.mockReset()
    apiHandlers.patch.mockReset()
    apiHandlers.remove.mockReset()
    apiHandlers.get.mockReset()
  })

  it('skipRecurringTask should update task and dashboard status', async () => {
    const store = useTaskStore()

    // Seed a fake habit occurrence
    const habit = { _id: 'h1', name: 'Habit 1', status: 'todo', microTaskType: 'habit' }
    store.tasks = [habit]
    store.habitsDashboard = {
      totalHabits: 1,
      activeHabits: 1,
      averageAderencePercent: 0,
      streaksOver7Days: 0,
      dueTodayCount: 0,
      dueTodayHabits: [],
      habits: [
        {
          id: 'h1',
          name: 'Habit 1',
          status: 'todo',
          currentStreak: 2,
          longestStreak: 10,
          aderencePercent: 90,
          lastCompletedDate: null,
          deadline: null,
        },
      ],
    }

    apiHandlers.post.mockImplementation(async (path: string) => {
      if (path === '/tasks/h1/skip') {
        return { data: { ...habit, status: 'done', recurringState: 'skipped', isConcluded: true }, error: null }
      }
      return { data: null, error: new Error(`Unhandled POST ${path}`) }
    })

    const result = await store.skipRecurringTask('h1')

    expect(result.success).toBe(true)
    expect(store.tasks[0].status).toBe('done')
    expect(store.habitsDashboard?.habits[0].status).toBe('done')
    expect(apiHandlers.post).toHaveBeenCalledWith('/tasks/h1/skip', {})
  })

  it('handleRecurringCompletion should conclude and push next occurrence', async () => {
    const store = useTaskStore()

    // Seed a fake habit occurrence
    const habit = {
      _id: 'h-complete',
      name: 'Habit Complete',
      status: 'todo',
      microTaskType: 'habit',
      parentRecurringId: 'series-1',
    }
    store.tasks = [habit]
    store.habitsDashboard = {
      totalHabits: 1,
      activeHabits: 1,
      averageAderencePercent: 0,
      streaksOver7Days: 0,
      dueTodayCount: 0,
      dueTodayHabits: [],
      habits: [
        {
          id: 'series-1',
          name: 'Habit Series',
          status: 'todo',
          currentStreak: 1,
          longestStreak: 1,
          aderencePercent: 50,
          lastCompletedDate: null,
          deadline: null,
        },
      ],
    }

    // Spy on setTaskStatus to simulate success
    const spySet = vi.spyOn(store, 'setTaskStatus')
    spySet.mockResolvedValue({ success: true, data: { ...habit, status: 'done' } })

    const nextOccurrence = {
      _id: 'h-next',
      name: 'Habit Complete',
      status: 'todo',
      microTaskType: 'habit',
      parentRecurringId: 'series-1',
      streakData: { currentStreak: 2, aderencePercent: 60 },
    }

    apiHandlers.post.mockImplementation(async (path: string) => {
      if (path === '/tasks/h-complete/generate-next-occurrence') {
        return { data: nextOccurrence, error: null }
      }
      return { data: null, error: new Error(`Unhandled POST ${path}`) }
    })

    // Call the action
    const res = await store.handleRecurringCompletion('h-complete')

    expect(res.success).toBe(true)
    expect(spySet).toHaveBeenCalledWith('h-complete', 'done')
    expect(apiHandlers.post).toHaveBeenCalledWith('/tasks/h-complete/generate-next-occurrence', {})
    expect(store.tasks.some((t: any) => t._id === 'h-next')).toBe(true)
    expect(store.habitsDashboard?.habits[0].currentStreak).toBe(2)
    expect(store.habitsDashboard?.habits[0].aderencePercent).toBe(60)
  })
})
