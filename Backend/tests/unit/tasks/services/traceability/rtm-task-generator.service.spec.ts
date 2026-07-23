import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { RTMTaskGeneratorService } from '../../../../../src/tasks/services/traceability/rtm-task-generator.service';
import { GeminiService } from '../../../../../src/ai/services/core/gemini.service';
import { TasksService } from '../../../../../src/tasks/tasks.service';
import { RTMValidationService } from '../../../../../src/tasks/services/traceability/rtm-validation.service';
import { Requirement as RequirementSchema } from '../../../../../src/tasks/schemas/requirement.schema';

describe('RTMTaskGeneratorService', () => {
  let service: RTMTaskGeneratorService;
  let requirementModelMock: any;
  let geminiServiceMock: any;
  let tasksServiceMock: any;
  let validationServiceMock: any;

  const validObjectId = '507f1f77bcf86cd799439011';

  beforeEach(async () => {
    requirementModelMock = {
      find: jest.fn().mockResolvedValue([
        { _id: validObjectId, projectId: validObjectId, title: 'Ação Órfã 1', description: 'Descrição da ação', kind: 'action' },
      ]),
      updateOne: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({}),
    };

    geminiServiceMock = {
      generateContent: jest.fn().mockResolvedValue(
        JSON.stringify([{ requirementId: 'r-1', name: 'Nova Tarefa', description: 'Desc' }]),
      ),
    };

    tasksServiceMock = {
      create: jest.fn().mockResolvedValue({ _id: 't-1' }),
      createMany: jest.fn().mockResolvedValue([{ _id: 't-1' }]),
    };

    validationServiceMock = {
      validateRTM: jest.fn().mockResolvedValue({
        coverage: { coverageRate: 50 },
        unmappedRequirements: [validObjectId],
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RTMTaskGeneratorService,
        { provide: getModelToken(RequirementSchema.name), useValue: requirementModelMock },
        { provide: GeminiService, useValue: geminiServiceMock },
        { provide: TasksService, useValue: tasksServiceMock },
        { provide: RTMValidationService, useValue: validationServiceMock },
      ],
    }).compile();

    service = module.get<RTMTaskGeneratorService>(RTMTaskGeneratorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateTasksForUnmappedRequirements', () => {
    it('deve gerar tarefas para ações órfãs da jornada', async () => {
      const result = await service.generateTasksForUnmappedRequirements(validObjectId);

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(tasksServiceMock.create).toHaveBeenCalled();
    });
  });
});
