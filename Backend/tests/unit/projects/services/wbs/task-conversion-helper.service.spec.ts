import { Test, TestingModule } from '@nestjs/testing';
import { TaskConversionHelperService } from '../../../../../src/projects/services/wbs/conversion/task-conversion-helper.service';
import { AuditService, CacheService } from '../../../../../src/projects/services/wbs';
import { DraftGenerationService } from '../../../../../src/projects/services/drafts';

describe('TaskConversionHelperService', () => {
  let service: TaskConversionHelperService;
  let auditServiceMock: any;
  let draftGenerationServiceMock: any;
  let cacheServiceMock: any;

  beforeEach(async () => {
    auditServiceMock = {
      auditLeafDiscrepancy: jest.fn().mockResolvedValue({
        diagnosis: 'underestimated',
        suggestedAction: 'rebaseline',
        suggestedEstimatedHours: 20,
      }),
    };

    draftGenerationServiceMock = {
      generateMicroTasksDraftsForLeafWithPlan: jest.fn().mockResolvedValue([
        { name: 'Draft 1', description: 'Desc 1', pomodorosPlanned: 2 },
      ]),
    };

    cacheServiceMock = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaskConversionHelperService,
        { provide: AuditService, useValue: auditServiceMock },
        { provide: DraftGenerationService, useValue: draftGenerationServiceMock },
        { provide: CacheService, useValue: cacheServiceMock },
      ],
    }).compile();

    service = module.get<TaskConversionHelperService>(TaskConversionHelperService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateTasksForLeafNode', () => {
    it('deve retornar array vazio se o nó não for uma folha (tiver filhos)', async () => {
      const node: any = { name: 'Parent', children: [{ name: 'Child' }] };
      const result = await service.generateTasksForLeafNode({
        node,
        nodePath: '1',
        projectId: 'p-1',
      });

      expect(result).toHaveLength(0);
    });

    it('deve gerar tarefas para nó folha via draftGenerationService', async () => {
      const node: any = { name: 'Leaf Node', estimatedHours: 10, children: [] };
      const result = await service.generateTasksForLeafNode({
        node,
        nodePath: '1.1',
        projectId: 'p-1',
      });

      expect(result.length).toBeGreaterThan(0);
      expect(draftGenerationServiceMock.generateMicroTasksDraftsForLeafWithPlan).toHaveBeenCalled();
    });
  });
});
