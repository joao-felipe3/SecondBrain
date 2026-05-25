import { Test, TestingModule } from '@nestjs/testing';
import { ProjectsController } from './projects.controller';
import { getModelToken } from '@nestjs/mongoose';
import { ProjectsService } from './projects.service';
import { PlanningService } from './planning/planning.service';
import { WBSService } from './wbs/wbs.service';
import { WbsValidationService } from './wbs/services/wbs-validation.service';
import { TaskConversionService } from './wbs/services/task-conversion.service';
import { AuditService } from './wbs/services/audit.service';
import { TasksService } from '../tasks/tasks.service';
import { LeafTasksBufferService } from './leaf-tasks-buffer.service';

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
