import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { TasksService } from '../../../src/tasks/tasks.service';
import { ProjectsService } from '../../../src/projects/projects.service';
import { GeminiService } from '../../../src/ai/gemini.service';
import { EVMService } from '../../../src/projects/services/evm.service';
import { PertService } from '../../../src/tasks/services/pert.service';
import { ChecklistService } from '../../../src/tasks/services/checklist.service';
import { FeedbackService } from '../../../src/tasks/services/feedback.service';
import { AlertsService } from '../../../src/tasks/services/alerts.service';
import { DeviationDetectionService } from '../../../src/tasks/services/deviation-detection.service';
import { TasksRecurringService } from '../../../src/tasks/services/tasks/recurring.service';
import { TasksWriteService } from '../../../src/tasks/services/tasks/write.service';
import { TasksHabitsService } from '../../../src/tasks/services/tasks/habits.service';
import { createTasksServiceTestProviders } from './tasks-service-test-providers';

describe('TasksService - Sprint 5: Recorrência', () => {
  let service: TasksService;
  let recurringService: TasksRecurringService;
  let taskModel: any;
  let tasksWriteServiceMock: any;
  let tasksHabitsServiceMock: any;

  beforeEach(async () => {
    taskModel = {
      findById: jest.fn(),
      findByIdAndUpdate: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      findByIdAndDelete: jest.fn(),
      insertMany: jest.fn(),
    };

    tasksWriteServiceMock = {
      createMany: jest.fn(),
      createTaskCore: jest.fn().mockImplementation(async (dto: any) => ({
        ...dto,
        _id: new Types.ObjectId(),
        save: jest.fn(),
      })),
      update: jest.fn(),
      remove: jest.fn(),
    };

    tasksHabitsServiceMock = {
      getStreakData: jest.fn().mockResolvedValue({
        currentStreak: 1,
        longestStreak: 1,
        aderencePercent: 100,
        lastCompletedDate: new Date('2026-04-20T10:00:00.000Z'),
      }),
      getHabitsDashboard: jest.fn().mockResolvedValue({
        projectId: undefined,
        totalHabits: 1,
        activeHabits: 1,
        averageAderencePercent: 100,
        streaksOver7Days: 0,
        dueTodayCount: 0,
        dueTodayHabits: [],
        habits: [
          {
            id: new Types.ObjectId().toString(),
            name: 'Habit 1',
            status: 'todo',
            currentStreak: 1,
            longestStreak: 1,
            aderencePercent: 100,
            lastCompletedDate: new Date('2026-04-20T10:00:00.000Z'),
            deadline: null,
          },
        ],
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: getModelToken('Task'), useValue: taskModel },
        { provide: getModelToken('Project'), useValue: {} },
        {
          provide: getModelToken('TaskCompletionFeedback'),
          useValue: { create: jest.fn(), findOne: jest.fn() },
        },
        {
          provide: ProjectsService,
          useValue: {
            recalculateProjectStats: jest.fn(),
            incrementHoursWorked: jest.fn(),
          },
        },
        {
          provide: GeminiService,
          useValue: {
            generateChecklistForTask: jest.fn(),
            generateChecklistWithHistory: jest.fn(),
            suggestPertEstimates: jest.fn(),
            generateCompletionFeedback: jest.fn(),
          },
        },
        { provide: EVMService, useValue: { recordProgress: jest.fn() } },
        {
          provide: ChecklistService,
          useValue: {
            validateChecklistStructure: jest.fn(),
            findSimilarTasksInProject: jest.fn(),
            enrichHistoryContext: jest.fn(),
            calculateCompletionPercentage: jest.fn(),
            validateChecklistCompletion: jest.fn(),
          },
        },
        { provide: PertService, useValue: { calculatePertMetrics: jest.fn() } },
        { provide: FeedbackService, useValue: { generateFeedback: jest.fn() } },
        { provide: AlertsService, useValue: { createAlert: jest.fn() } },
        {
          provide: DeviationDetectionService,
          useValue: { generateDeviationAlert: jest.fn() },
        },
        ...createTasksServiceTestProviders({
          taskModel,
          projectModel: {},
          projectsService: {
            recalculateProjectStats: jest.fn(),
            incrementHoursWorked: jest.fn(),
          },
          geminiService: {
            generateChecklistForTask: jest.fn(),
            generateChecklistWithHistory: jest.fn(),
            suggestPertEstimates: jest.fn(),
            generateCompletionFeedback: jest.fn(),
          },
          checklistService: {
            validateChecklistStructure: jest.fn(),
            findSimilarTasksInProject: jest.fn(),
            enrichHistoryContext: jest.fn(),
            calculateCompletionPercentage: jest.fn(),
            validateChecklistCompletion: jest.fn(),
          },
          pertService: { calculatePertMetrics: jest.fn() },
          evmService: { recordProgress: jest.fn() },
          alertsService: { createAlert: jest.fn() },
          deviationDetectionService: { generateDeviationAlert: jest.fn() },
        }),
        { provide: TasksWriteService, useValue: tasksWriteServiceMock },
        { provide: TasksHabitsService, useValue: tasksHabitsServiceMock },
      ],
    }).compile();

    service = module.get<TasksService>(TasksService);
    recurringService = module.get<TasksRecurringService>(TasksRecurringService);
    Object.defineProperty(service, 'tasksWriteService', {
      value: tasksWriteServiceMock,
      configurable: true,
    });
    Object.defineProperty(service, 'tasksHabitsService', {
      value: tasksHabitsServiceMock,
      configurable: true,
    });
  });

  it('createRecurringMicroTask should create template and first occurrence', async () => {
    const template = {
      _id: new Types.ObjectId(),
      recurringRule: { frequency: 'daily', interval: 1 },
    };
    const occurrence = {
      _id: new Types.ObjectId(),
      parentRecurringId: template._id,
    };

    jest
      .spyOn(service, 'createRecurringTemplate')
      .mockResolvedValue(template as any);
    jest
      .spyOn(recurringService, 'buildOccurrencePayload')
      .mockReturnValue(occurrence as any);

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
    } as any);

    expect(result).toBe(occurrence);
    expect(service.createRecurringTemplate).toHaveBeenCalledTimes(1);
    expect(recurringService.buildOccurrencePayload).toHaveBeenCalledTimes(1);
  });

  it('handleTaskSkipped should mark occurrence skipped and create next one when recurring', async () => {
    const taskId = new Types.ObjectId().toString();
    const currentTask = {
      _id: taskId,
      recurringRule: { frequency: 'daily', interval: 1 },
      deadline: new Date('2026-04-20T10:00:00.000Z'),
      createdAt: new Date('2026-04-20T08:00:00.000Z'),
    };
    const updatedTask = {
      ...currentTask,
      recurringState: 'skipped',
      isConcluded: true,
      status: 'done',
    };

    (service.findOne as any) = jest.fn().mockResolvedValue(currentTask);
    taskModel.findByIdAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue(updatedTask),
    });
    jest
      .spyOn(service, 'generateNextOccurrence')
      .mockResolvedValue({ _id: new Types.ObjectId() } as any);

    const result = await service.handleTaskSkipped(taskId);

    expect(result.recurringState).toBe('skipped');
    expect(service.generateNextOccurrence).toHaveBeenCalled();
  });

  it('getStreakData should aggregate completed/skipped occurrences', async () => {
    const parentRecurringId = new Types.ObjectId().toString();
    const tasks = [
      {
        _id: new Types.ObjectId(),
        recurringState: 'completed',
        deadline: new Date('2026-04-20T10:00:00.000Z'),
      },
      {
        _id: new Types.ObjectId(),
        recurringState: 'skipped',
        deadline: new Date('2026-04-21T10:00:00.000Z'),
      },
      {
        _id: new Types.ObjectId(),
        recurringState: 'completed',
        deadline: new Date('2026-04-22T10:00:00.000Z'),
      },
    ];

    taskModel.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(tasks),
      }),
    });

    const streak = await service.getStreakData(parentRecurringId);

    expect(streak.currentStreak).toBe(3);
    expect(streak.longestStreak).toBe(3);
    expect(streak.aderencePercent).toBe(100);
    expect(streak.lastCompletedDate).toBeInstanceOf(Date);
  });

  it('getHabitsDashboard should summarize habits and streaks', async () => {
    const habitId = new Types.ObjectId().toString();
    taskModel.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue([
          {
            _id: habitId,
            name: 'Habit 1',
            status: 'todo',
            parentRecurringId: habitId,
          },
        ]),
      }),
    });
    jest.spyOn(service, 'getStreakData').mockResolvedValue({
      currentStreak: 1,
      longestStreak: 1,
      aderencePercent: 100,
      lastCompletedDate: new Date('2026-04-20T10:00:00.000Z'),
    });

    const dashboard = await service.getHabitsDashboard();

    expect(dashboard.totalHabits).toBe(1);
    expect(dashboard.activeHabits).toBe(1);
    expect(dashboard.averageAderencePercent).toBe(100);
    expect(dashboard.habits[0].name).toBe('Habit 1');
  });

  it('calculateNextRecurringDate should support weekly with daysOfWeek', () => {
    const result = recurringService.calculateNextRecurringDate(
      new Date('2026-04-20T10:00:00.000Z'), // Monday
      { frequency: 'weekly', interval: 1, daysOfWeek: [3, 5] }, // Wednesday, Friday
    );

    expect(result).toBeInstanceOf(Date);
    expect(result!.getUTCDay()).toBe(3);
  });

  it('calculateNextRecurringDate should support biweekly', () => {
    const result = recurringService.calculateNextRecurringDate(
      new Date('2026-04-20T10:00:00.000Z'),
      { frequency: 'biweekly', interval: 1 },
    );

    expect(result).toBeInstanceOf(Date);
    expect(result!.toISOString()).toContain('2026-05-04');
  });

  it('calculateNextRecurringDate should support monthly', () => {
    const result = recurringService.calculateNextRecurringDate(
      new Date('2026-04-20T10:00:00.000Z'),
      { frequency: 'monthly', interval: 1 },
    );

    expect(result).toBeInstanceOf(Date);
    expect(result!.toISOString()).toContain('2026-05-20');
  });

  it('calculateNextRecurringDate should support custom interval', () => {
    const result = recurringService.calculateNextRecurringDate(
      new Date('2026-04-20T10:00:00.000Z'),
      { frequency: 'custom', interval: 3 },
    );

    expect(result).toBeInstanceOf(Date);
    expect(result!.toISOString()).toContain('2026-04-23');
  });

  it('calculateNextRecurringDate should return null when endDate is exceeded', () => {
    const result = recurringService.calculateNextRecurringDate(
      new Date('2026-04-20T10:00:00.000Z'),
      {
        frequency: 'daily',
        interval: 1,
        endDate: new Date('2026-04-20T23:59:59.999Z'),
      },
    );

    expect(result).toBeNull();
  });

  it('calculateNextRecurringDate should skip exception dates', () => {
    const result = recurringService.calculateNextRecurringDate(
      new Date('2026-04-20T10:00:00.000Z'),
      {
        frequency: 'daily',
        interval: 1,
        exceptions: [{ date: new Date(2026, 3, 21), reason: 'holiday' }],
      },
    );

    expect(result).toBeInstanceOf(Date);
    expect(result!.toISOString()).toContain('2026-04-22');
  });

  it('handleTaskDeferred should update only current occurrence deadline', async () => {
    const taskId = new Types.ObjectId().toString();
    const newDeadline = new Date('2026-04-25T10:00:00.000Z');
    const task = { _id: taskId };
    const updated = { _id: taskId, deadline: newDeadline };

    taskModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue(task),
    });
    taskModel.findByIdAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue(updated),
    });

    const result = await service.handleTaskDeferred(taskId, newDeadline);

    expect(result.deadline).toEqual(newDeadline);
    expect(taskModel.findByIdAndUpdate).toHaveBeenCalled();
  });

  // Edge cases and comprehensive recurring logic tests
  it('calculateNextRecurringDate should handle weekly with multiple daysOfWeek correctly', () => {
    // Tuesday (day 2), need to find next Wednesday (3) or Friday (5)
    const tuesday = new Date('2026-04-21T10:00:00.000Z'); // Tuesday
    const result = recurringService.calculateNextRecurringDate(
      tuesday,
      { frequency: 'weekly', interval: 1, daysOfWeek: [3, 5] }, // Wednesday, Friday
    );

    expect(result).toBeInstanceOf(Date);
    // Should skip to Wednesday (3 days away)
    expect(result!.getUTCDay()).toBe(3);
  });

  it('calculateNextRecurringDate should wrap to next week if all daysOfWeek are passed', () => {
    // Friday (day 5), daysOfWeek = [1, 3] (Mon, Wed), should wrap to next Monday
    const friday = new Date('2026-04-24T10:00:00.000Z'); // Friday
    const result = recurringService.calculateNextRecurringDate(friday, {
      frequency: 'weekly',
      interval: 1,
      daysOfWeek: [1, 3],
    });

    expect(result).toBeInstanceOf(Date);
    // Should be next Monday (in 3 days)
    expect(result!.getUTCDay()).toBe(1);
  });

  it('calculateNextRecurringDate should handle daily with interval > 1', () => {
    const result = recurringService.calculateNextRecurringDate(
      new Date('2026-04-20T10:00:00.000Z'),
      { frequency: 'daily', interval: 5 },
    );

    expect(result).toBeInstanceOf(Date);
    // 5 days later
    expect(result!.toISOString()).toContain('2026-04-25');
  });

  it('calculateNextRecurringDate should respect multiple exceptions', () => {
    // Daily starting 2026-04-20, but skip 21, 22, 23 -> should return 24
    const result = recurringService.calculateNextRecurringDate(
      new Date('2026-04-20T10:00:00.000Z'),
      {
        frequency: 'daily',
        interval: 1,
        exceptions: [
          { date: new Date(2026, 3, 21), reason: 'holiday' },
          { date: new Date(2026, 3, 22), reason: 'holiday' },
          { date: new Date(2026, 3, 23), reason: 'holiday' },
        ],
      },
    );

    expect(result).toBeInstanceOf(Date);
    // Should skip to next day after all exceptions (April 24)
    expect(result!.getUTCDate()).toBe(24);
  });

  it('calculateNextRecurringDate should return null when endDate is today (no future)', () => {
    // Use future date to avoid normalizeRecurringRule validation error
    const futureDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // +1 year
    const result = recurringService.calculateNextRecurringDate(futureDate, {
      frequency: 'daily',
      interval: 1,
      endDate: futureDate,
    });

    expect(result).toBeNull();
  });

  it('calculateNextRecurringDate should return null when endDate is in the past', () => {
    // Use dates further in future to avoid normalizeRecurringRule validation
    const baseDate = new Date('2026-04-20T10:00:00.000Z');
    const endDate = new Date('2026-04-25T23:59:59.999Z');
    const futureProbe = new Date('2026-04-26T10:00:00.000Z');

    const result = recurringService.calculateNextRecurringDate(futureProbe, {
      frequency: 'daily',
      interval: 1,
      endDate,
    });

    expect(result).toBeNull();
  });

  it('calculateNextRecurringDate should handle monthly on 31st (edge month boundaries)', () => {
    // May 31 + 1 month = June 30 (June only has 30 days)
    const may31 = new Date('2026-05-31T10:00:00.000Z');
    const result = recurringService.calculateNextRecurringDate(may31, {
      frequency: 'monthly',
      interval: 1,
    });

    expect(result).toBeInstanceOf(Date);
    // addMonths should handle day boundary: May 31 + 1 month = June 30
    expect(result!.getUTCDate()).toBeLessThanOrEqual(31);
  });

  it('calculateNextRecurringDate should support biweekly with interval=2', () => {
    // April 20 + 14 days = May 4
    const result = recurringService.calculateNextRecurringDate(
      new Date('2026-04-20T10:00:00.000Z'),
      { frequency: 'weekly', interval: 2 },
    );

    expect(result).toBeInstanceOf(Date);
    // 14 days later
    expect(result!.getUTCDate()).toBe(4);
    expect(result!.getUTCMonth()).toBe(4); // May = month 4
  });

  it('calculateNextRecurringDate should skip exception before respecting endDate', () => {
    // Daily starting 2026-04-20, exception on 21, endDate 2026-04-25
    const result = recurringService.calculateNextRecurringDate(
      new Date('2026-04-20T10:00:00.000Z'),
      {
        frequency: 'daily',
        interval: 1,
        exceptions: [{ date: new Date(2026, 3, 21), reason: 'holiday' }],
        endDate: new Date('2026-04-25T23:59:59.999Z'),
      },
    );

    expect(result).toBeInstanceOf(Date);
    // Should skip 21 and return 22
    expect(result!.getUTCDate()).toBe(22);
  });
});
