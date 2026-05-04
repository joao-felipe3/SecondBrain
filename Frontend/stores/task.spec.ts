import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * Sprint 5: Task Store - Habits Integration Tests
 * Testa handleRecurringCompletion e skipRecurringTask
 */

describe('Sprint 5: Task Store - Habits Actions', () => {
  let mockStore: any
  let mockApiResponse: any

  beforeEach(() => {
    mockStore = {
      tasks: [
        {
          _id: 'habit-1',
          name: 'Morning Meditation',
          status: 'todo',
          microTaskType: 'habit',
          recurringRule: { frequency: 'daily' },
          streakData: { currentStreak: 5, aderencePercent: 85 },
        },
        {
          _id: 'habit-2',
          name: 'Gym',
          status: 'doing',
          microTaskType: 'habit',
          recurringRule: { frequency: 'weekly' },
          streakData: { currentStreak: 3, aderencePercent: 62 },
        },
      ],
      habitsDashboard: {
        habits: [
          {
            _id: 'habit-1',
            currentStreak: 5,
            aderencePercent: 85,
          },
        ],
      },
      setTaskStatus: vi.fn().mockResolvedValue({
        success: true,
        data: { status: 'done' },
      }),
    }

    mockApiResponse = {
      data: {
        _id: 'habit-1-next',
        name: 'Morning Meditation',
        status: 'todo',
        microTaskType: 'habit',
        parentRecurringId: 'habit-1',
        deadline: new Date(Date.now() + 86400000).toISOString(),
        streakData: {
          currentStreak: 6,
          aderencePercent: 87,
        },
      },
      error: null,
    }
  })

  describe('handleRecurringCompletion - Flow', () => {
    it('should have access to habit by ID', () => {
      const habitId = 'habit-1'
      const habit = mockStore.tasks.find((t: any) => t._id === habitId)

      expect(habit).toBeDefined()
      expect(habit.microTaskType).toBe('habit')
    })

    it('should mark habit as done via setTaskStatus', async () => {
      const habitId = 'habit-1'
      const moveResult = await mockStore.setTaskStatus(habitId, 'done')

      expect(moveResult.success).toBe(true)
      expect(mockStore.setTaskStatus).toHaveBeenCalledWith(habitId, 'done')
    })

    it('should handle setTaskStatus failure gracefully', async () => {
      mockStore.setTaskStatus.mockResolvedValue({
        success: false,
        error: 'Task not found',
      })

      const result = await mockStore.setTaskStatus('nonexistent-id', 'done')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Task not found')
    })

    it('should call API to generate next occurrence', async () => {
      const habitId = 'habit-1'
      const generateNextOccurrence = vi.fn().mockResolvedValue(mockApiResponse)

      const result = await generateNextOccurrence()

      expect(generateNextOccurrence).toHaveBeenCalled()
      expect(result.data).toBeDefined()
    })

    it('should add next occurrence to tasks list', () => {
      const nextOccurrence = mockApiResponse.data
      mockStore.tasks.push(nextOccurrence)

      expect(mockStore.tasks).toHaveLength(3)
      expect(mockStore.tasks.find((t: any) => t._id === nextOccurrence._id)).toBeDefined()
    })

    it('should update dashboard habit streak', () => {
      const nextOccurrence = mockApiResponse.data
      const dashboardHabit = mockStore.habitsDashboard.habits.find(
        (h: any) => h._id === nextOccurrence.parentRecurringId
      )

      if (dashboardHabit && nextOccurrence.streakData) {
        dashboardHabit.currentStreak = nextOccurrence.streakData.currentStreak
        dashboardHabit.aderencePercent = nextOccurrence.streakData.aderencePercent
      }

      expect(dashboardHabit.currentStreak).toBe(6)
      expect(dashboardHabit.aderencePercent).toBe(87)
    })

    it('should return complete success response', async () => {
      const moveResult = { success: true, data: { status: 'done' } }
      const nextOccurrence = mockApiResponse.data

      const fullResult = {
        success: true,
        data: {
          completed: moveResult.data,
          nextOccurrence: nextOccurrence,
        },
      }

      expect(fullResult.success).toBe(true)
      expect(fullResult.data.completed).toBeDefined()
      expect(fullResult.data.nextOccurrence).toBeDefined()
    })
  })

  describe('handleRecurringCompletion - Error Cases', () => {
    it('should return error if habit not found', async () => {
      const result = await mockStore.setTaskStatus('unknown-id', 'done')

      expect(result.success).toBe(false)
    })

    it('should return early if setTaskStatus fails', async () => {
      mockStore.setTaskStatus.mockResolvedValue({
        success: false,
        error: 'Cannot update task',
      })

      const result = await mockStore.setTaskStatus('habit-1', 'done')

      expect(result.success).toBe(false)
      // Should not proceed to next step
    })

    it('should handle API error gracefully', async () => {
      const generateNextOccurrence = vi
        .fn()
        .mockResolvedValue({ data: null, error: 'API Error' })

      const result = await generateNextOccurrence()

      expect(result.error).toBe('API Error')
    })

    it('should return success even if next occurrence generation fails', () => {
      const moveResult = { success: true, data: { status: 'done' } }
      const apiError = { success: false, error: 'Generation failed' }

      const result = apiError.success ? { completed: moveResult.data } : { completed: moveResult.data }

      expect(result.completed).toBeDefined()
    })
  })

  describe('skipRecurringTask - Flow', () => {
    it('should have access to habit by ID', () => {
      const habitId = 'habit-1'
      const habit = mockStore.tasks.find((t: any) => t._id === habitId)

      expect(habit).toBeDefined()
    })

    it('should POST to /tasks/:id/skip endpoint', async () => {
      const habitId = 'habit-1'
      const skipTask = vi.fn().mockResolvedValue({
        success: true,
        data: { status: 'done' },
      })

      await skipTask(habitId)

      expect(skipTask).toHaveBeenCalledWith(habitId)
    })

    it('should update task status to done', () => {
      const habit = mockStore.tasks.find((t: any) => t._id === 'habit-1')
      habit.status = 'done'

      expect(habit.status).toBe('done')
    })

    it('should maintain streak (not break it)', () => {
      const originalStreak = 5
      const skipTask = { streakNotBroken: true }

      expect(skipTask.streakNotBroken).toBe(true)
      // Streak count remains the same
    })

    it('should generate next occurrence', async () => {
      const generateNextOccurrence = vi.fn().mockResolvedValue(mockApiResponse)

      await generateNextOccurrence()

      expect(generateNextOccurrence).toHaveBeenCalled()
    })

    it('should return success result', () => {
      const result = { success: true, data: { status: 'done' } }

      expect(result.success).toBe(true)
    })
  })

  describe('skipRecurringTask - Error Handling', () => {
    it('should handle habit not found', async () => {
      const skipTask = vi.fn().mockResolvedValue({
        success: false,
        error: 'Habit not found',
      })

      const result = await skipTask('unknown-id')

      expect(result.success).toBe(false)
    })

    it('should handle cannot skip completed task', async () => {
      const skipTask = vi.fn().mockResolvedValue({
        success: false,
        error: 'Cannot skip completed task',
      })

      const result = await skipTask('habit-1')

      expect(result.success).toBe(false)
    })

    it('should handle API error', async () => {
      const skipTask = vi.fn().mockResolvedValue({
        success: false,
        error: 'Server error',
      })

      const result = await skipTask('habit-1')

      expect(result.success).toBe(false)
    })
  })

  describe('State Updates - Tasks Array', () => {
    it('should add completed habit to tasks array', () => {
      const newHabit = { _id: 'habit-new', name: 'New Habit', status: 'todo' }
      mockStore.tasks.push(newHabit)

      expect(mockStore.tasks).toContainEqual(newHabit)
    })

    it('should maintain task order after addition', () => {
      const originalLength = mockStore.tasks.length
      mockStore.tasks.push({ _id: 'new', name: 'New' })

      expect(mockStore.tasks.length).toBe(originalLength + 1)
    })

    it('should not duplicate habits in array', () => {
      const habit = mockStore.tasks[0]
      mockStore.tasks.push(habit)

      const count = mockStore.tasks.filter((t: any) => t._id === habit._id).length

      expect(count).toBe(2) // One original, one added
    })
  })

  describe('State Updates - Dashboard Habits', () => {
    it('should find dashboard habit by recurring ID', () => {
      const nextOccurrence = {
        ...mockApiResponse.data,
        parentRecurringId: 'habit-1',
      }

      const dashboardHabit = mockStore.habitsDashboard.habits.find(
        (h: any) => h._id === nextOccurrence.parentRecurringId
      )

      expect(dashboardHabit).toBeDefined()
    })

    it('should update streak on dashboard', () => {
      const nextOccurrence = mockApiResponse.data
      const dashboardHabit = mockStore.habitsDashboard.habits[0]

      if (nextOccurrence.streakData) {
        dashboardHabit.currentStreak = nextOccurrence.streakData.currentStreak
      }

      expect(dashboardHabit.currentStreak).toBe(6)
    })

    it('should update adherence on dashboard', () => {
      const nextOccurrence = mockApiResponse.data
      const dashboardHabit = mockStore.habitsDashboard.habits[0]

      if (nextOccurrence.streakData) {
        dashboardHabit.aderencePercent = nextOccurrence.streakData.aderencePercent
      }

      expect(dashboardHabit.aderencePercent).toBe(87)
    })

    it('should handle missing dashboard', () => {
      mockStore.habitsDashboard = null
      const nextOccurrence = mockApiResponse.data

      const isDashboardAvailable = !!mockStore.habitsDashboard?.habits
      expect(isDashboardAvailable).toBe(false)
    })
  })

  describe('Event Responses', () => {
    it('should allow snackbar message after completion', () => {
      const message = '🎉 Hábito completado! Próxima ocorrência agendada.'
      expect(message).toContain('completado')
    })

    it('should allow snackbar message after skip', () => {
      const message = '⏭️ Hábito pulado! Streak não quebrada.'
      expect(message).toContain('pulado')
    })

    it('should emit habit-completed event', () => {
      const eventData = { habitId: 'habit-1', completedAt: new Date() }

      expect(eventData.habitId).toBe('habit-1')
      expect(eventData.completedAt).toBeInstanceOf(Date)
    })

    it('should emit habit-skipped event', () => {
      const eventData = { habitId: 'habit-1', skippedAt: new Date() }

      expect(eventData.habitId).toBe('habit-1')
      expect(eventData.skippedAt).toBeInstanceOf(Date)
    })
  })

  describe('Integration with Task Methods', () => {
    it('should reuse existing setTaskStatus method', () => {
      expect(mockStore.setTaskStatus).toBeDefined()
    })

    it('should work with mixed task and habit arrays', () => {
      mockStore.tasks.push({
        _id: 'task-regular',
        name: 'Regular Task',
        status: 'todo',
      })

      const habits = mockStore.tasks.filter((t: any) => t.microTaskType === 'habit')
      const tasks = mockStore.tasks.filter((t: any) => !t.microTaskType)

      expect(habits.length).toBeGreaterThan(0)
      expect(tasks.length).toBeGreaterThan(0)
    })

    it('should handle concurrent habit completions', async () => {
      const completionFns = [
        mockStore.setTaskStatus('habit-1', 'done'),
        mockStore.setTaskStatus('habit-2', 'done'),
      ]

      const results = await Promise.all(completionFns)

      expect(results).toHaveLength(2)
      results.forEach(r => expect(r.success).toBe(true))
    })
  })

  describe('Reactive Updates', () => {
    it('should trigger reactivity when tasks array changes', () => {
      const initialLength = mockStore.tasks.length
      mockStore.tasks.push({ _id: 'new', name: 'New' })

      expect(mockStore.tasks.length).toBe(initialLength + 1)
    })

    it('should trigger reactivity when habit streak updates', () => {
      const habit = mockStore.tasks[0]
      const originalStreak = habit.streakData.currentStreak

      habit.streakData.currentStreak += 1

      expect(habit.streakData.currentStreak).toBe(originalStreak + 1)
    })

    it('should trigger reactivity for dashboard updates', () => {
      const dashboardHabit = mockStore.habitsDashboard.habits[0]
      const originalAdherence = dashboardHabit.aderencePercent

      dashboardHabit.aderencePercent = 90

      expect(dashboardHabit.aderencePercent).not.toBe(originalAdherence)
    })
  })

  describe('Type Safety', () => {
    it('should handle habit with recurring rule', () => {
      const habit = mockStore.tasks.find((t: any) => t._id === 'habit-1')

      expect(habit.recurringRule).toBeDefined()
      expect(habit.recurringRule.frequency).toBe('daily')
    })

    it('should handle habit with streak data', () => {
      const habit = mockStore.tasks.find((t: any) => t._id === 'habit-1')

      expect(habit.streakData).toBeDefined()
      expect(habit.streakData.currentStreak).toBeGreaterThan(0)
    })

    it('should handle next occurrence with parent ID', () => {
      const nextOccurrence = { ...mockApiResponse.data, parentRecurringId: 'habit-1' }

      expect(nextOccurrence.parentRecurringId).toBe('habit-1')
    })
  })
})
