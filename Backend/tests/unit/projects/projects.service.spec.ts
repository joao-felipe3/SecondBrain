import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ProjectsService } from '../../../src/projects/projects.service';
import { ProjectsXMatrixService } from '../../../src/projects/services/strategy';
import { GanttService, PertDiagramService } from '../../../src/projects/services/visualization';
import { ProjectStatsService } from '../../../src/projects/services/execution';

describe('ProjectsService', () => {
  let service: ProjectsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectsService,
        { provide: getModelToken('Project'), useValue: {} },
        { provide: getModelToken('Task'), useValue: {} },
        {
          provide: ProjectsXMatrixService,
          useValue: { createXMatrix: jest.fn(), getSavedXMatrix: jest.fn() },
        },
        {
          provide: GanttService,
          useValue: { getGanttData: jest.fn() },
        },
        {
          provide: PertDiagramService,
          useValue: { getPertDiagramData: jest.fn() },
        },
        {
          provide: ProjectStatsService,
          useValue: { recalculateProjectStats: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<ProjectsService>(ProjectsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
