import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { RTMMappingService } from '../../../../../src/tasks/services/traceability/rtm-mapping.service';
import { GeminiService } from '../../../../../src/ai/services/core/gemini.service';
import { RTMValidationService } from '../../../../../src/tasks/services/traceability/rtm-validation.service';
import { Requirement as RequirementSchema } from '../../../../../src/tasks/schemas/requirement.schema';

describe('RTMMappingService', () => {
  let service: RTMMappingService;
  let requirementModelMock: any;
  let geminiServiceMock: any;
  let validationServiceMock: any;

  const validObjectId = '507f1f77bcf86cd799439011';

  beforeEach(async () => {
    requirementModelMock = {
      find: jest.fn().mockResolvedValue([
        { _id: 'r-1', projectId: validObjectId, title: 'Ação 1', kind: 'action' },
      ]),
    };

    geminiServiceMock = {
      generateContent: jest.fn().mockResolvedValue(JSON.stringify([{ taskId: 't-1', actionId: 'r-1' }])),
    };

    validationServiceMock = {
      validateRTM: jest.fn().mockResolvedValue({ coverage: { coverageRate: 100 } }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RTMMappingService,
        { provide: getModelToken(RequirementSchema.name), useValue: requirementModelMock },
        { provide: GeminiService, useValue: geminiServiceMock },
        { provide: RTMValidationService, useValue: validationServiceMock },
      ],
    }).compile();

    service = module.get<RTMMappingService>(RTMMappingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('autoMapRequirementsToTasks', () => {
    it('deve realizar auto-mapeamento de tarefas para a jornada', async () => {
      const tasks: any[] = [{ id: 't-1', name: 'Task 1' }];
      const result = await service.autoMapRequirementsToTasks(validObjectId, tasks);

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });
  });
});
