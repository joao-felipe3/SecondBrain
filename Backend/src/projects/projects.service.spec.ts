import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ProjectsService } from './projects.service';
import { ProjectWave } from './schemas/project-wave.schema';
import { CPMService } from '../tasks/services/cpm.service';
import { ProjectsXMatrixService } from './services/projects-x-matrix.service';

describe('ProjectsService', () => {
  let service: ProjectsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectsService,
        { provide: getModelToken('Project'), useValue: {} },
        { provide: getModelToken('Task'), useValue: {} },
        { provide: getModelToken(ProjectWave.name), useValue: {} },
        { provide: CPMService, useValue: { getDependencies: jest.fn(), calculateCriticalPath: jest.fn(), normalizeRelationship: jest.fn() } },
        { provide: ProjectsXMatrixService, useValue: { createXMatrix: jest.fn(), getSavedXMatrix: jest.fn() } },
      ],
    }).compile();

    service = module.get<ProjectsService>(ProjectsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
