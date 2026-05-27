import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { TasksController } from '../../../src/tasks/tasks.controller';
import { TasksService } from '../../../src/tasks/tasks.service';
import { CPMService } from '../../../src/tasks/services/cpm.service';
import { DependencyInferenceService } from '../../../src/tasks/services/dependency-inference.service';

describe('TasksController', () => {
  let controller: TasksController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TasksController],
      providers: [
        {
          provide: TasksService,
          useValue: {
            create: jest.fn(),
            createMicroTask: jest.fn(),
            createRecurringMicroTask: jest.fn(),
            findAll: jest.fn(),
            findMicroTask: jest.fn(),
            findOne: jest.fn(),
            update: jest.fn(),
            updateMicroTaskChecklist: jest.fn(),
            updateRecurringRule: jest.fn(),
            remove: jest.fn(),
            markAsConcluded: jest.fn(),
            incrementPomodorosDid: jest.fn(),
            generateAiSuggestions: jest.fn(),
            generateAiSuggestionsWithProgress: jest.fn(),
          },
        },
        {
          provide: CPMService,
          useValue: {
            upsertDependencies: jest.fn(),
          },
        },
        {
          provide: DependencyInferenceService,
          useValue: {
            inferHeuristicPhases: jest.fn().mockReturnValue([]),
            inferWithAi: jest.fn(async () => []),
          },
        },
      ],
    }).compile();

    controller = module.get<TasksController>(TasksController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
