import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { TasksService } from './tasks.service';
import { ProjectsService } from '../projects/projects.service';
import { GeminiService } from './gemini.service';

describe('TasksService', () => {
  let service: TasksService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: getModelToken('Task'), useValue: {} },
        { provide: getModelToken('Project'), useValue: {} },
        { provide: ProjectsService, useValue: { recalculateProjectStats: jest.fn() } },
        { provide: GeminiService, useValue: { generateContent: jest.fn() } },
      ],
    }).compile();

    service = module.get<TasksService>(TasksService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
