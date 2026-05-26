import { Test, TestingModule } from '@nestjs/testing';
import { ProjectsController } from '@src/projects/projects.controller';
import { getModelToken } from '@nestjs/mongoose';
import { ProjectsService } from '@src/projects/projects.service';
import { PlanningService } from '@src/projects/planning/planning.service';
import { WBSService } from '@src/projects/wbs/wbs.service';
import { WbsValidationService } from '@src/projects/wbs/services/wbs-validation.service';
import { TaskConversionService } from '@src/projects/wbs/services/task-conversion.service';
import { AuditService } from '@src/projects/wbs/services/audit.service';
import { TasksService } from '@src/tasks/tasks.service';
import { LeafTasksBufferService } from '@src/projects/leaf-tasks-buffer.service';

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
