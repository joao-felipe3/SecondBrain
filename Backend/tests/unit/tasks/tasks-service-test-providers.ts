import { TasksInputService } from '../../../src/tasks/services/tasks/input.service';
import { TasksMetricsService } from '../../../src/tasks/services/tasks/metrics.service';
import { TasksRecurringService } from '../../../src/tasks/services/tasks/recurring.service';
import { TasksAiSuggestionsService } from '../../../src/tasks/services/tasks/ai-suggestions.service';
import { TasksHabitsService } from '../../../src/tasks/services/tasks/habits.service';
import { TasksHierarchyService } from '../../../src/tasks/services/tasks/hierarchy.service';
import { TasksChecklistService } from '../../../src/tasks/services/tasks/checklist.service';
import { TasksCompletionService } from '../../../src/tasks/services/tasks/completion.service';
import { TasksPertService } from '../../../src/tasks/services/tasks/tasks-pert.service';
import { TasksWriteService } from '../../../src/tasks/services/tasks/write.service';

type TasksServiceTestDeps = {
  taskModel: any;
  projectModel: any;
  projectsService: any;
  geminiService: any;
  checklistService: any;
  pertService: any;
  evmService: any;
  alertsService: any;
  deviationDetectionService: any;
};

export function createTasksServiceTestProviders(deps: TasksServiceTestDeps) {
  const inputService = new TasksInputService();
  const metricsService = new TasksMetricsService();
  const recurringService = new TasksRecurringService(deps.taskModel, deps.projectsService);
  let completionService!: TasksCompletionService;
  let writeService!: TasksWriteService;

  return [
    { provide: TasksInputService, useValue: inputService },
    { provide: TasksMetricsService, useValue: metricsService },
    {
      provide: TasksRecurringService,
      useValue: recurringService,
    },
    {
      provide: TasksAiSuggestionsService,
      useValue: new TasksAiSuggestionsService(deps.taskModel, deps.geminiService),
    },
    {
      provide: TasksHabitsService,
      useValue: new TasksHabitsService(deps.taskModel),
    },
    {
      provide: TasksHierarchyService,
      useValue: new TasksHierarchyService(deps.taskModel),
    },
    {
      provide: TasksChecklistService,
      useValue: new TasksChecklistService(
        deps.taskModel,
        deps.checklistService,
        inputService,
        deps.geminiService,
      ),
    },
    {
      provide: TasksCompletionService,
      useFactory: () => {
        completionService = new TasksCompletionService(
          deps.taskModel,
          deps.projectsService,
          deps.evmService,
          metricsService,
          deps.deviationDetectionService,
          deps.alertsService,
          recurringService,
          writeService,
        );

        return completionService;
      },
    },
    {
      provide: TasksPertService,
      useValue: new TasksPertService(deps.taskModel, deps.pertService, metricsService),
    },
    {
      provide: TasksWriteService,
      useFactory: () => {
        writeService = new TasksWriteService(
          deps.taskModel,
          deps.projectModel,
          deps.projectsService,
          metricsService,
          inputService,
          new TasksChecklistService(
            deps.taskModel,
            deps.checklistService,
            inputService,
            deps.geminiService,
          ),
          deps.checklistService,
          completionService,
        );

        (recurringService as any).tasksWriteService = writeService;
        (completionService as any).tasksWriteService = writeService;

        return writeService;
      },
    },
  ];
}
