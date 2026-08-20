import { Model } from 'mongoose';
import { TasksInputService } from '../../../../src/tasks/services/workflow/input.service';
import { TasksMetricsService } from '../../../../src/tasks/services/analysis/metrics.service';
import { TasksRecurringService } from '../../../../src/tasks/services/workflow/recurring.service';
import { TasksAiSuggestionsService } from '../../../../src/tasks/services/intelligence/ai-suggestions.service';
import { TasksAiSuggestionsLoopRunner } from '../../../../src/tasks/services/intelligence/ai-suggestions-runner.service';
import { TasksHabitsService } from '../../../../src/tasks/services/monitoring/habits.service';
import { TasksHierarchyService } from '../../../../src/tasks/services/dependencies/hierarchy.service';
import { ChecklistOperationsService } from '../../../../src/tasks/services/intelligence/checklist-operations.service';
import { TasksCompletionService } from '../../../../src/tasks/services/workflow/completion.service';
import { TasksPertService } from '../../../../src/tasks/services/analysis/pert.service';
import { TasksWriteService } from '../../../../src/tasks/services/workflow/write.service';
import { TaskDocument } from '../../../../src/tasks/schemas/task.schema';
import { ProjectDocument } from '../../../../src/projects/schemas/project.schema';
import { ProjectStatsService } from '../../../../src/projects/services/execution/project-stats.service';
import { GeminiService } from '../../../../src/ai/services/core/gemini.service';
import { ChecklistService } from '../../../../src/tasks/services/intelligence/checklist.service';
import { PertService } from '../../../../src/tasks/services/analysis/pert.service';
import { EVMProgressService } from '../../../../src/projects/services/evm/evm-progress.service';
import { AlertsService } from '../../../../src/tasks/services/monitoring/alerts.service';
import { DeviationDetectionService } from '../../../../src/tasks/services/monitoring/deviation-detection.service';

type TasksServiceTestDeps = {
  taskModel: unknown;
  projectModel: unknown;
  projectStatsService?: unknown;
  geminiService: unknown;
  checklistService: unknown;
  pertService: unknown;
  evmProgressService: unknown;
  alertsService: unknown;
  deviationDetectionService: unknown;
};

export function createTasksServiceTestProviders(deps: TasksServiceTestDeps) {
  const taskModel = deps.taskModel as Model<TaskDocument>;
  const projectModel = deps.projectModel as Model<ProjectDocument>;
  const projectStatsService = (deps.projectStatsService || {
    recalculateProjectStats: jest.fn(),
    incrementHoursWorked: jest.fn(),
  }) as ProjectStatsService;
  const geminiService = deps.geminiService as GeminiService;
  const checklistService = deps.checklistService as ChecklistService;
  const pertService = deps.pertService as PertService;
  const evmProgressService = deps.evmProgressService as EVMProgressService;
  const alertsService = deps.alertsService as AlertsService;
  const deviationDetectionService = deps.deviationDetectionService as DeviationDetectionService;

  const inputService = new TasksInputService();
  const metricsService = new TasksMetricsService();
  const recurringService = new TasksRecurringService(taskModel, projectStatsService);
  let completionService!: TasksCompletionService;
  let writeService!: TasksWriteService;

  const taskRepositoryMock = {
    findAll: jest.fn().mockImplementation(() => Promise.resolve([])),
    findById: jest.fn().mockImplementation((id: string) => {
      const tm = taskModel as unknown as {
        findById: (i: string) => { exec?: () => Promise<unknown> };
      };
      if (tm && typeof tm.findById === 'function') {
        const queryObj = tm.findById(id);
        if (queryObj && typeof queryObj.exec === 'function') {
          return queryObj.exec();
        }
        return Promise.resolve(queryObj);
      }
      return Promise.resolve(null);
    }),
    findByProjectId: jest.fn().mockImplementation((projectId: string) => {
      const tm = taskModel as unknown as {
        find: (q: Record<string, unknown>) => { exec?: () => Promise<unknown> };
      };
      if (tm && typeof tm.find === 'function') {
        const queryObj = tm.find({ project: projectId });
        if (queryObj && typeof queryObj.exec === 'function') {
          return queryObj.exec();
        }
        return Promise.resolve(queryObj);
      }
      return Promise.resolve([]);
    }),
    save: jest.fn().mockImplementation((task: unknown) => Promise.resolve(task)),
    delete: jest.fn().mockImplementation(() => Promise.resolve()),
  };

  return [
    { provide: 'TaskRepository', useValue: taskRepositoryMock },
    { provide: TasksInputService, useValue: inputService },
    { provide: TasksMetricsService, useValue: metricsService },
    {
      provide: TasksRecurringService,
      useValue: recurringService,
    },
    {
      provide: TasksAiSuggestionsLoopRunner,
      useValue: new TasksAiSuggestionsLoopRunner(taskModel, geminiService as any),
    },
    {
      provide: TasksAiSuggestionsService,
      useValue: new TasksAiSuggestionsService(
        taskModel,
        geminiService as any,
        new TasksAiSuggestionsLoopRunner(taskModel, geminiService as any),
      ),
    },
    {
      provide: TasksHabitsService,
      useValue: new TasksHabitsService(taskModel),
    },
    {
      provide: TasksHierarchyService,
      useValue: new TasksHierarchyService(taskModel),
    },
    {
      provide: ChecklistOperationsService,
      useValue: new ChecklistOperationsService(
        taskModel,
        checklistService,
        inputService,
        geminiService as any,
      ),
    },
    {
      provide: TasksCompletionService,
      useFactory: () => {
        completionService = new TasksCompletionService(
          taskModel,
          projectStatsService,
          evmProgressService,
          metricsService,
          deviationDetectionService,
          alertsService,
          recurringService,
          writeService,
        );

        return completionService;
      },
    },
    {
      provide: TasksPertService,
      useValue: new TasksPertService(taskModel, pertService, metricsService),
    },
    {
      provide: TasksWriteService,
      useFactory: () => {
        writeService = new TasksWriteService(
          taskModel,
          projectModel,
          projectStatsService,
          metricsService,
          inputService,
          new ChecklistOperationsService(
            taskModel,
            checklistService,
            inputService,
            geminiService as any,
          ),
        );

        (recurringService as unknown as { tasksWriteService: TasksWriteService }).tasksWriteService =
          writeService;
        (completionService as unknown as { tasksWriteService: TasksWriteService }).tasksWriteService =
          writeService;

        return writeService;
      },
    },
  ];
}
