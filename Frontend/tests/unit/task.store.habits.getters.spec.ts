import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useTaskStore } from '~/stores/task'

vi.mock('~/composables/api/useApi', () => {
  return {
    useApi: () => ({
      post: async () => ({ data: null, error: null }),
      patch: async () => ({ data: null, error: null }),
      remove: async () => ({ error: null }),
      get: async () => ({ data: null, error: null }),
    }),
  }
})

describe('Task Store - habit getters', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('getHabits should return recurring/habit tasks and filter by project', () => {
    const store = useTaskStore()

    store.tasks = [
      { _id: 't1', name: 'Normal', project: 'p1', microTaskType: 'task' } as any,
      { _id: 'h1', name: 'Habit', project: 'p1', microTaskType: 'habit' } as any,
      { _id: 'r1', name: 'Recurring instance', project: 'p2', parentRecurringId: 'series-1' } as any,
      { _id: 'tpl', name: 'Recurring template', project: 'p1', recurringRule: { frequency: 'daily', interval: 1 } } as any,
    ]

    const all = store.getHabits()
    expect(all.map((t: any) => t._id).sort()).toEqual(['h1', 'r1', 'tpl'].sort())

    const onlyP1 = store.getHabits({ projectId: 'p1' })
    expect(onlyP1.map((t: any) => t._id).sort()).toEqual(['h1', 'tpl'].sort())
  })

  it('getStreakForHabit should return dashboard streak data when present', () => {
    const store = useTaskStore()

    store.habitsDashboard = {
      totalHabits: 1,
      activeHabits: 1,
      averageAderencePercent: 80,
      streaksOver7Days: 1,
      dueTodayCount: 0,
      dueTodayHabits: [],
      habits: [
        {
          id: 'series-1',
          name: 'Series',
          status: 'todo',
          currentStreak: 3,
          longestStreak: 9,
          aderencePercent: 75,
          lastCompletedDate: null,
          deadline: null,
        },
      ],
    }

    expect(store.getStreakForHabit('series-1')).toEqual({
      currentStreak: 3,
      longestStreak: 9,
      aderencePercent: 75,
    })

    expect(store.getStreakForHabit('missing')).toEqual({
      currentStreak: 0,
      longestStreak: 0,
      aderencePercent: 0,
    })
  })

  it('getHabitsByStreak should sort dashboard habits descending', () => {
    const store = useTaskStore()

    store.habitsDashboard = {
      totalHabits: 2,
      activeHabits: 2,
      averageAderencePercent: 0,
      streaksOver7Days: 0,
      dueTodayCount: 0,
      dueTodayHabits: [],
      habits: [
        {
          id: 'a',
          name: 'A',
          status: 'todo',
          currentStreak: 2,
          longestStreak: 2,
          aderencePercent: 0,
          lastCompletedDate: null,
          deadline: null,
        },
        {
          id: 'b',
          name: 'B',
          status: 'todo',
          currentStreak: 10,
          longestStreak: 10,
          aderencePercent: 0,
          lastCompletedDate: null,
          deadline: null,
        },
      ],
    }

    const sorted = store.getHabitsByStreak()
    expect(sorted.map((h: any) => h.id)).toEqual(['b', 'a'])
  })
})
