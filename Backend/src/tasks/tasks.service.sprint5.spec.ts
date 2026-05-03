import { Test, TestingModule } from '@nestjs/testing'
import { getModelToken } from '@nestjs/mongoose'
import { Types } from 'mongoose'
import { TasksService } from './tasks.service'
import { ProjectsService } from '../projects/projects.service'
import { GeminiService } from './gemini.service'
import { EVMService } from '../projects/services/evm.service'
import { PertService } from './services/pert.service'
import { ChecklistService } from './checklist.service'

describe('TasksService - Sprint 5: Recorrência', () => {
  let service: TasksService
  let taskModel: any

  beforeEach(async () => {
    taskModel = {
      findById: jest.fn(),
      findByIdAndUpdate: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      findByIdAndDelete: jest.fn(),
      insertMany: jest.fn(),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: getModelToken('Task'), useValue: taskModel },
        { provide: getModelToken('Project'), useValue: {} },
        { provide: getModelToken('TaskCompletionFeedback'), useValue: { create: jest.fn(), findOne: jest.fn() } },
        { provide: ProjectsService, useValue: { recalculateProjectStats: jest.fn(), incrementHoursWorked: jest.fn() } },
        { provide: GeminiService, useValue: { generateChecklistForTask: jest.fn(), generateChecklistWithHistory: jest.fn(), suggestPertEstimates: jest.fn(), generateCompletionFeedback: jest.fn() } },
        { provide: EVMService, useValue: { recordProgress: jest.fn() } },
        { provide: ChecklistService, useValue: { validateChecklistStructure: jest.fn(), findSimilarTasksInProject: jest.fn(), enrichHistoryContext: jest.fn(), calculateCompletionPercentage: jest.fn(), validateChecklistCompletion: jest.fn() } },
        { provide: PertService, useValue: { calculatePertMetrics: jest.fn() } },
      ],
    }).compile()

    service = module.get<TasksService>(TasksService)
  })

  it('createRecurringMicroTask should create template and first occurrence', async () => {
    const template = { _id: new Types.ObjectId(), recurringRule: { frequency: 'daily', interval: 1 } }
    const occurrence = { _id: new Types.ObjectId(), parentRecurringId: template._id }

    jest.spyOn(service, 'createRecurringTemplate').mockResolvedValue(template as any)
    jest.spyOn(service, 'generateNextOccurrence').mockResolvedValue(occurrence as any)

    const result = await service.createRecurringMicroTask({
      name: 'Daily habit',
      description: 'Test recurring flow',
      project: new Types.ObjectId(),
      microTaskType: 'habit',
      pomodorosPlanned: 1,
      deadline: new Date('2026-04-20T10:00:00.000Z'),
      isConcluded: false,
      late: false,
      recurrency: 'daily',
      notification: new Date('2026-04-20T09:00:00.000Z'),
      recurringRule: { frequency: 'daily', interval: 1 },
    } as any)

    expect(result).toBe(occurrence)
    expect(service.createRecurringTemplate).toHaveBeenCalledTimes(1)
    expect(service.generateNextOccurrence).toHaveBeenCalledWith(template)
  })

  it('handleTaskSkipped should mark occurrence skipped and create next one when recurring', async () => {
    const taskId = new Types.ObjectId().toString()
    const currentTask = {
      _id: taskId,
      recurringRule: { frequency: 'daily', interval: 1 },
      deadline: new Date('2026-04-20T10:00:00.000Z'),
      createdAt: new Date('2026-04-20T08:00:00.000Z'),
    }
    const updatedTask = {
      ...currentTask,
      recurringState: 'skipped',
      isConcluded: true,
      status: 'done',
    }

    ;(service.findOne as any) = jest.fn().mockResolvedValue(currentTask)
    taskModel.findByIdAndUpdate.mockReturnValue({ exec: jest.fn().mockResolvedValue(updatedTask) })
    jest.spyOn(service, 'generateNextOccurrence').mockResolvedValue({ _id: new Types.ObjectId() } as any)

    const result = await service.handleTaskSkipped(taskId)

    expect(result.recurringState).toBe('skipped')
    expect(service.generateNextOccurrence).toHaveBeenCalled()
  })

  it('getStreakData should aggregate completed/skipped occurrences', async () => {
    const parentRecurringId = new Types.ObjectId().toString()
    const tasks = [
      { _id: new Types.ObjectId(), recurringState: 'completed', deadline: new Date('2026-04-20T10:00:00.000Z') },
      { _id: new Types.ObjectId(), recurringState: 'skipped', deadline: new Date('2026-04-21T10:00:00.000Z') },
      { _id: new Types.ObjectId(), recurringState: 'completed', deadline: new Date('2026-04-22T10:00:00.000Z') },
    ]

    taskModel.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(tasks),
      }),
    })

    const streak = await service.getStreakData(parentRecurringId)

    expect(streak.currentStreak).toBe(3)
    expect(streak.longestStreak).toBe(3)
    expect(streak.aderencePercent).toBe(100)
    expect(streak.lastCompletedDate).toBeInstanceOf(Date)
  })

  it('getHabitsDashboard should summarize habits and streaks', async () => {
    const habitId = new Types.ObjectId().toString()
    taskModel.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue([
          { _id: habitId, name: 'Habit 1', status: 'todo', parentRecurringId: habitId },
        ]),
      }),
    })
    jest.spyOn(service, 'getStreakData').mockResolvedValue({
      currentStreak: 1,
      longestStreak: 1,
      aderencePercent: 100,
      lastCompletedDate: new Date('2026-04-20T10:00:00.000Z'),
    })

    const dashboard = await service.getHabitsDashboard()

    expect(dashboard.totalHabits).toBe(1)
    expect(dashboard.activeHabits).toBe(1)
    expect(dashboard.averageAderencePercent).toBe(100)
    expect(dashboard.habits[0].name).toBe('Habit 1')
  })

  it('calculateNextRecurringDate should support weekly with daysOfWeek', () => {
    const result = (service as any).calculateNextRecurringDate(
      new Date('2026-04-20T10:00:00.000Z'), // Monday
      { frequency: 'weekly', interval: 1, daysOfWeek: [3, 5] }, // Wednesday, Friday
    )

    expect(result).toBeInstanceOf(Date)
    expect(result.getUTCDay()).toBe(3)
  })

  it('calculateNextRecurringDate should support biweekly', () => {
    const result = (service as any).calculateNextRecurringDate(
      new Date('2026-04-20T10:00:00.000Z'),
      { frequency: 'biweekly', interval: 1 },
    )

    expect(result).toBeInstanceOf(Date)
    expect(result.toISOString()).toContain('2026-05-04')
  })

  it('calculateNextRecurringDate should support monthly', () => {
    const result = (service as any).calculateNextRecurringDate(
      new Date('2026-04-20T10:00:00.000Z'),
      { frequency: 'monthly', interval: 1 },
    )

    expect(result).toBeInstanceOf(Date)
    expect(result.toISOString()).toContain('2026-05-20')
  })

  it('calculateNextRecurringDate should support custom interval', () => {
    const result = (service as any).calculateNextRecurringDate(
      new Date('2026-04-20T10:00:00.000Z'),
      { frequency: 'custom', interval: 3 },
    )

    expect(result).toBeInstanceOf(Date)
    expect(result.toISOString()).toContain('2026-04-23')
  })

  it('calculateNextRecurringDate should return null when endDate is exceeded', () => {
    const result = (service as any).calculateNextRecurringDate(
      new Date('2026-04-20T10:00:00.000Z'),
      { frequency: 'daily', interval: 1, endDate: new Date('2026-04-20T23:59:59.999Z') },
    )

    expect(result).toBeNull()
  })

  it('calculateNextRecurringDate should skip exception dates', () => {
    const result = (service as any).calculateNextRecurringDate(
      new Date('2026-04-20T10:00:00.000Z'),
      {
        frequency: 'daily',
        interval: 1,
        exceptions: [
          { date: new Date('2026-04-21T00:00:00.000Z'), reason: 'holiday' },
        ],
      },
    )

    expect(result).toBeInstanceOf(Date)
    expect(result.toISOString()).toContain('2026-04-22')
  })

  it('handleTaskDeferred should update only current occurrence deadline', async () => {
    const taskId = new Types.ObjectId().toString()
    const newDeadline = new Date('2026-04-25T10:00:00.000Z')
    const task = { _id: taskId }
    const updated = { _id: taskId, deadline: newDeadline }

    taskModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(task) })
    taskModel.findByIdAndUpdate.mockReturnValue({ exec: jest.fn().mockResolvedValue(updated) })

    const result = await service.handleTaskDeferred(taskId, newDeadline)

    expect(result.deadline).toEqual(newDeadline)
    expect(taskModel.findByIdAndUpdate).toHaveBeenCalled()
  })
})
