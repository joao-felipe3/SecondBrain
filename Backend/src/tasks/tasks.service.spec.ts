import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { TasksService } from './tasks.service';
import { ProjectsService } from '../projects/projects.service';
import { GeminiService } from './gemini.service';
import { EVMService } from '../projects/services/evm.service';
import { PertService } from './services/pert.service';

describe('TasksService', () => {
  let service: TasksService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: getModelToken('Task'), useValue: {} },
        { provide: getModelToken('Project'), useValue: {} },
        { provide: ProjectsService, useValue: { recalculateProjectStats: jest.fn() } },
        {
          provide: GeminiService,
          useValue: {
            generateContent: jest.fn(),
            generateChecklistForTask: jest.fn().mockResolvedValue(['Preparar contexto', 'Executar tarefa', 'Validar entrega']),
          },
        },
        { provide: EVMService, useValue: { recordProgress: jest.fn() } },
        { provide: PertService, useValue: { calculatePertMetrics: jest.fn() } },
      ],
    }).compile();

    service = module.get<TasksService>(TasksService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
