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
        { _id: '507f1f77bcf86cd799439012', projectId: validObjectId, title: 'Ação 1', kind: 'action', type: 'action' },
      ]),
      create: jest.fn().mockResolvedValue({ _id: '507f1f77bcf86cd799439013' }),
      updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    };

    geminiServiceMock = {
      generateContent: jest.fn().mockResolvedValue(JSON.stringify([{ taskId: 't-1', actionId: '507f1f77bcf86cd799439012' }])),
    };

    validationServiceMock = {
      validateRTM: jest.fn().mockResolvedValue({ coverage: 100, isValid: true, unmappedRequirements: [], risks: [] }),
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

    it('should return error if no journey items exist', async () => {
      requirementModelMock.find.mockResolvedValueOnce([]);
      const result = await service.autoMapRequirementsToTasks(validObjectId, [{ id: 't-1' }] as any);
      expect(result.success).toBe(false);
    });

    it('should handle orphan tasks and create new requirements', async () => {
      geminiServiceMock.generateContent.mockResolvedValueOnce(
        JSON.stringify([{ taskId: 't-99', requirementId: 'ORPHAN' }]),
      );

      const tasks: any[] = [{ id: 't-99', name: 'Orphan Task' }];
      const result = await service.autoMapRequirementsToTasks(validObjectId, tasks);

      expect(result.success).toBe(true);
      expect(requirementModelMock.create).toHaveBeenCalled();
    });
  });
});
