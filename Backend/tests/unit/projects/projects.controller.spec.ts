import { Test, TestingModule } from '@nestjs/testing';
import { ProjectsController } from '../../../src/projects/projects.controller';
import { getModelToken } from '@nestjs/mongoose';
import { ProjectsService } from '../../../src/projects/projects.service';
import { PlanningService } from '../../../src/projects/services/strategy';
import {
  WBSService,
  WbsValidationService,
  TaskConversionService,
  AuditService,
} from '../../../src/projects/services/wbs';
import { TasksService } from '../../../src/tasks/tasks.service';
import { LeafTasksBufferService } from '../../../src/projects/services/execution';

describe('ProjectsController', () => {
  let controller: ProjectsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProjectsController],
      providers: [
        { provide: ProjectsService, useValue: {} },
        { provide: PlanningService, useValue: {} },
        { provide: WBSService, useValue: {} },
        { provide: WbsValidationService, useValue: {} },
        { provide: TaskConversionService, useValue: {} },
        { provide: AuditService, useValue: {} },
        { provide: TasksService, useValue: {} },
        { provide: LeafTasksBufferService, useValue: {} },
        { provide: getModelToken('Task'), useValue: {} },
      ],
    }).compile();

    controller = module.get<ProjectsController>(ProjectsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
