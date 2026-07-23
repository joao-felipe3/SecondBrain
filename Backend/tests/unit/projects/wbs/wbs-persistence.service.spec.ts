import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { WbsPersistenceService } from '../../../../src/projects/services/wbs/core/wbs-persistence.service';
import { CacheService } from '../../../../src/projects/services/wbs/shared/cache.service';

describe('WbsPersistenceService', () => {
  let service: WbsPersistenceService;
  let wbsNodeModelMock: any;
  let cacheServiceMock: any;

  beforeEach(async () => {
    wbsNodeModelMock = jest.fn().mockImplementation((dto) => ({
      ...dto,
      _id: 'node-1',
      save: jest.fn().mockResolvedValue({ ...dto, _id: 'node-1' }),
    }));

    wbsNodeModelMock.find = jest.fn().mockReturnValue({
      sort: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue([
          { _id: 'node-1', name: 'Root Node', level: 1, estimatedHours: 40, parentId: null, order: 1 },
          { _id: 'node-2', name: 'Child Node', level: 2, estimatedHours: 40, parentId: 'node-1', order: 1 },
        ]),
      }),
      exec: jest.fn().mockResolvedValue([
        { _id: 'node-1', name: 'Root Node', level: 1, estimatedHours: 40, parentId: null, order: 1, save: jest.fn().mockResolvedValue({}) },
        { _id: 'node-2', name: 'Child Node', level: 2, estimatedHours: 40, parentId: 'node-1', order: 1, save: jest.fn().mockResolvedValue({}) },
      ]),
    });

    cacheServiceMock = {
      clearForProject: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WbsPersistenceService,
        { provide: getModelToken('WBSNode'), useValue: wbsNodeModelMock },
        { provide: CacheService, useValue: cacheServiceMock },
      ],
    }).compile();

    service = module.get<WbsPersistenceService>(WbsPersistenceService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('save', () => {
    it('deve salvar nós da WBS recursivamente e limpar o cache', async () => {
      const nodes: any[] = [
        {
          name: 'Fase 1',
          estimatedHours: 40,
          children: [{ name: 'Subfase 1.1', estimatedHours: 40 }],
        },
      ];

      const result = await service.save('p-1', nodes);

      expect(result).toBeDefined();
      expect(cacheServiceMock.clearForProject).toHaveBeenCalledWith('p-1');
    });
  });

  describe('get', () => {
    it('deve montar a árvore de nós WBS a partir dos dados do banco', async () => {
      const tree = await service.get('p-1');

      expect(tree).toHaveLength(1);
      expect(tree[0].name).toBe('Root Node');
      expect(tree[0].children).toHaveLength(1);
      expect(tree[0].children![0].name).toBe('Child Node');
    });
  });

  describe('calculateTotalHours', () => {
    it('deve somar horas estimadas de todas as folhas', () => {
      const nodes: any[] = [
        {
          name: 'Parent',
          children: [
            { name: 'Leaf 1', estimatedHours: 10 },
            { name: 'Leaf 2', estimatedHours: 20 },
          ],
        },
      ];

      const total = service.calculateTotalHours(nodes);
      expect(total).toBe(30);
    });
  });
});
