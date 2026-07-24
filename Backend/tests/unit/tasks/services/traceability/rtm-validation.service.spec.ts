import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { RTMValidationService } from '@src/tasks/services/traceability/rtm-validation.service';
import { Requirement as RequirementSchema } from '@src/tasks/schemas/requirement.schema';

describe('RTMValidationService', () => {
  let service: RTMValidationService;
  let requirementModelMock: any;

  const validProjId = '507f1f77bcf86cd799439011';

  beforeEach(async () => {
    requirementModelMock = {
      find: jest.fn().mockReturnValue({
        sort: jest.fn().mockResolvedValue([
          {
            _id: 'r-obj',
            projectId: validProjId,
            title: 'Obj 1',
            description: 'Obj 1',
            kind: 'objective',
            type: 'objective',
          },
          {
            _id: 'r-hab',
            projectId: validProjId,
            title: 'Hab 1',
            description: 'Hab 1',
            kind: 'habit',
            parentItemId: 'r-obj',
          },
          {
            _id: 'r-stg',
            projectId: validProjId,
            title: 'Stg 1',
            description: 'Stg 1',
            kind: 'stage',
            parentItemId: 'r-hab',
          },
          {
            _id: 'r-act',
            projectId: validProjId,
            title: 'Act 1',
            description: 'Act 1',
            kind: 'action',
            parentItemId: 'r-stg',
            traceableItems: ['t1'],
          },
        ]),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RTMValidationService,
        { provide: getModelToken(RequirementSchema.name), useValue: requirementModelMock },
      ],
    }).compile();

    service = module.get<RTMValidationService>(RTMValidationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('validateRTM', () => {
    it('should validate RTM successfully for complete journey', async () => {
      requirementModelMock.find.mockResolvedValueOnce([
        { _id: 'r-obj', projectId: validProjId, description: 'Obj 1', kind: 'objective' },
        {
          _id: 'r-hab',
          projectId: validProjId,
          description: 'Hab 1',
          kind: 'habit',
          parentItemId: 'r-obj',
        },
        {
          _id: 'r-stg',
          projectId: validProjId,
          description: 'Stg 1',
          kind: 'stage',
          parentItemId: 'r-hab',
        },
        {
          _id: 'r-act',
          projectId: validProjId,
          description: 'Act 1',
          kind: 'action',
          parentItemId: 'r-stg',
          traceableItems: ['t1'],
        },
      ]);

      const result = await service.validateRTM(validProjId);
      expect(result.isValid).toBe(true);
      expect(result.coverage).toBe(100);
    });

    it('should return isValid=false when no requirements exist', async () => {
      requirementModelMock.find.mockResolvedValueOnce([]);
      const result = await service.validateRTM(validProjId);
      expect(result.isValid).toBe(false);
      expect(result.risks.length).toBeGreaterThan(0);
    });

    it('should report risks for orphan parents or unmapped actions', async () => {
      requirementModelMock.find.mockResolvedValueOnce([
        {
          _id: 'r-act-unmapped',
          projectId: validProjId,
          description: 'Act 2',
          kind: 'action',
          parentItemId: 'non-existent',
          traceableItems: [],
        },
      ]);

      const result = await service.validateRTM(validProjId);
      expect(result.isValid).toBe(false);
      expect(result.risks.some((r) => r.includes('aponta para pai inexistente'))).toBe(true);
    });

    it('should report warning when action is linked to more than 3 tasks', async () => {
      requirementModelMock.find.mockResolvedValueOnce([
        {
          _id: 'r-act-many',
          projectId: validProjId,
          description: 'Act 3',
          kind: 'action',
          traceableItems: ['t1', 't2', 't3', 't4'],
        },
      ]);

      const result = await service.validateRTM(validProjId);
      expect(result.risks.some((r) => r.includes('avaliar granularidade'))).toBe(true);
    });

    it('should handle exception during validation gracefully', async () => {
      requirementModelMock.find.mockImplementationOnce(() => {
        throw new Error('DB error');
      });

      const result = await service.validateRTM(validProjId);
      expect(result.isValid).toBe(false);
      expect(result.risks[0]).toContain('Erro ao validar jornada');
    });
  });

  describe('getRTMMatrix', () => {
    it('should generate RTM matrix with tasks and requirements', async () => {
      const tasks: any[] = [
        { id: 't1', name: 'Task 1', parentWbsNodeId: 'wbs1', wbsPath: 'Root > Leaf 1' },
      ];

      const result = await service.getRTMMatrix(validProjId, tasks);
      expect(result.requirements.length).toBe(4);
      expect(result.tasks.length).toBe(1);
      expect(result.tasks[0].wbsNodeName).toBe('Leaf 1');
    });

    it('should handle exception during matrix generation', async () => {
      requirementModelMock.find.mockReturnValueOnce({
        sort: jest.fn().mockImplementationOnce(() => {
          throw new Error('Matrix error');
        }),
      });

      const result = await service.getRTMMatrix(validProjId, []);
      expect(result.validation.isValid).toBe(false);
      expect(result.validation.risks[0]).toContain('Erro ao gerar matriz');
    });
  });
});
