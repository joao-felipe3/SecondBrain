import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { WBSService } from './wbs.service';
import { GeminiService } from '../../tasks/gemini.service';
import { WBSNodeDto } from '../dto/wbs.dto';

describe('WBSService', () => {
  let service: WBSService;
  let geminiService: GeminiService;
  let wbsNodeModel: any;

  const mockGeminiService = {
    generateContent: jest.fn(),
  };

  const mockWBSNodeModel = {
    find: jest.fn(),
    deleteMany: jest.fn(),
    prototype: {
      save: jest.fn(),
    },
  };

  // Use a factory function for the model
  function createMockModel(data?: any) {
    const instance = {
      ...data,
      save: jest.fn().mockResolvedValue({ _id: 'mock-id', ...data }),
    };
    return instance;
  }

  beforeEach(async () => {
    // Reset mocks
    jest.clearAllMocks();

    const MockModel: any = jest.fn().mockImplementation((data) => createMockModel(data));
    MockModel.find = jest.fn().mockReturnValue({
      sort: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue([]),
      }),
    });
    MockModel.deleteMany = jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue({ deletedCount: 0 }),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WBSService,
        {
          provide: GeminiService,
          useValue: mockGeminiService,
        },
        {
          provide: getModelToken('WBSNode'),
          useValue: MockModel,
        },
      ],
    }).compile();

    service = module.get<WBSService>(WBSService);
    geminiService = module.get<GeminiService>(GeminiService);
    wbsNodeModel = module.get(getModelToken('WBSNode'));
  });

  describe('validateWBSNode', () => {
    it('should return valid for a leaf node with exactly 8 hours', () => {
      const node: WBSNodeDto = {
        name: 'Task 8h',
        level: 3,
        estimatedHours: 8,
        children: [],
      };
      const result = service.validateWBSNode(node);
      expect(result.valid).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('should return valid for a leaf node with exactly 80 hours', () => {
      const node: WBSNodeDto = {
        name: 'Task 80h',
        level: 3,
        estimatedHours: 80,
        children: [],
      };
      const result = service.validateWBSNode(node);
      expect(result.valid).toBe(true);
    });

    it('should return valid for a leaf node with 40 hours (within range)', () => {
      const node: WBSNodeDto = {
        name: 'Normal Task',
        level: 3,
        estimatedHours: 40,
        children: [],
      };
      const result = service.validateWBSNode(node);
      expect(result.valid).toBe(true);
    });

    it('should return invalid for a leaf node with 7 hours (below 8)', () => {
      const node: WBSNodeDto = {
        name: 'Too Small',
        level: 3,
        estimatedHours: 7,
        children: [],
      };
      const result = service.validateWBSNode(node);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('muito pequeno');
      expect(result.reason).toContain('7h');
    });

    it('should return invalid for a leaf node with 81 hours (above 80)', () => {
      const node: WBSNodeDto = {
        name: 'Too Large',
        level: 3,
        estimatedHours: 81,
        children: [],
      };
      const result = service.validateWBSNode(node);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('muito grande');
      expect(result.reason).toContain('81h');
    });

    it('should return invalid for a leaf node with 0 hours', () => {
      const node: WBSNodeDto = {
        name: 'Empty',
        level: 3,
        estimatedHours: 0,
        children: [],
      };
      const result = service.validateWBSNode(node);
      expect(result.valid).toBe(false);
    });

    it('should return valid for an intermediate node (with children) regardless of hours', () => {
      const node: WBSNodeDto = {
        name: 'Parent',
        level: 1,
        estimatedHours: 200,
        children: [
          { name: 'Child 1', level: 2, estimatedHours: 40, children: [] },
          { name: 'Child 2', level: 2, estimatedHours: 40, children: [] },
        ],
      };
      const result = service.validateWBSNode(node);
      expect(result.valid).toBe(true);
    });
  });

  describe('validateWBS', () => {
    it('should return valid for a WBS where all leaf nodes respect 8/80', () => {
      const nodes: WBSNodeDto[] = [
        {
          name: 'Deliverable 1',
          level: 1,
          estimatedHours: 48,
          children: [
            { name: 'Task A', level: 2, estimatedHours: 24, children: [] },
            { name: 'Task B', level: 2, estimatedHours: 24, children: [] },
          ],
        },
      ];
      const result = service.validateWBS(nodes);
      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should return violations for nodes that break 8/80', () => {
      const nodes: WBSNodeDto[] = [
        {
          name: 'Deliverable 1',
          level: 1,
          estimatedHours: 100,
          children: [
            { name: 'Too Small', level: 2, estimatedHours: 5, children: [] },
            { name: 'Too Large', level: 2, estimatedHours: 95, children: [] },
          ],
        },
      ];
      const result = service.validateWBS(nodes);
      expect(result.valid).toBe(false);
      expect(result.violations).toHaveLength(2);
    });

    it('should validate deeply nested WBS trees', () => {
      const nodes: WBSNodeDto[] = [
        {
          name: 'Root',
          level: 1,
          estimatedHours: 200,
          children: [
            {
              name: 'Branch',
              level: 2,
              estimatedHours: 100,
              children: [
                { name: 'Valid Leaf', level: 3, estimatedHours: 20, children: [] },
                { name: 'Invalid Leaf', level: 3, estimatedHours: 3, children: [] },
              ],
            },
          ],
        },
      ];
      const result = service.validateWBS(nodes);
      expect(result.valid).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].reason).toContain('Invalid Leaf');
    });
  });

  describe('convertWBSToTasks', () => {
    it('should convert leaf nodes into task drafts', () => {
      const nodes: WBSNodeDto[] = [
        {
          name: 'Frontend',
          level: 1,
          estimatedHours: 60,
          children: [
            { name: 'Página de Login', level: 2, estimatedHours: 20, description: 'Criar tela de login', children: [] },
            { name: 'Dashboard', level: 2, estimatedHours: 40, description: 'Criar dashboard', children: [] },
          ],
        },
      ];
      const tasks = service.convertWBSToTasks(nodes, 'project-123');

      // Each WBS leaf is split into micro-tasks (<=150 minutes)
      // 20h = 1200min -> 8 chunks, 40h = 2400min -> 16 chunks
      expect(tasks).toHaveLength(24);
      expect(tasks[0].name).toBe('Página de Login (1/8)');
      expect(tasks[0].projectId).toBe('project-123');
      expect(tasks[0].estimatedMinutes).toBeLessThanOrEqual(150);
      expect(tasks[0].pomodorosPlanned).toBe(Math.ceil(tasks[0].estimatedMinutes / 25));
      expect(tasks[8].name).toBe('Dashboard (1/16)');
    });

    it('should skip intermediate nodes and only convert leaves', () => {
      const nodes: WBSNodeDto[] = [
        {
          name: 'Backend',
          level: 1,
          estimatedHours: 80,
          children: [
            {
              name: 'API',
              level: 2,
              estimatedHours: 40,
              children: [
                { name: 'Endpoints REST', level: 3, estimatedHours: 20, children: [] },
                { name: 'Autenticação', level: 3, estimatedHours: 20, children: [] },
              ],
            },
            { name: 'Banco de Dados', level: 2, estimatedHours: 40, children: [] },
          ],
        },
      ];
      const tasks = service.convertWBSToTasks(nodes, 'project-456');

      // 20h leaves => 8 micro-tasks each, and 40h leaf => 16 micro-tasks
      expect(tasks).toHaveLength(32);
      expect(tasks[0].name).toBe('Endpoints REST (1/8)');
      expect(tasks[8].name).toBe('Autenticação (1/8)');
      expect(tasks[16].name).toBe('Banco de Dados (1/16)');
    });

    it('should include WBS path in task description', () => {
      const nodes: WBSNodeDto[] = [
        {
          name: 'Frontend',
          level: 1,
          estimatedHours: 20,
          children: [
            {
              name: 'UI',
              level: 2,
              estimatedHours: 20,
              children: [
                { name: 'Botões', level: 3, estimatedHours: 20, description: 'Implementar botões', children: [] },
              ],
            },
          ],
        },
      ];
      const tasks = service.convertWBSToTasks(nodes, 'p1');

      expect(tasks[0].description).toContain('Frontend > UI > Botões');
      expect(tasks[0].description).toContain('Origem WBS');
    });

    it('should handle empty WBS', () => {
      const tasks = service.convertWBSToTasks([], 'p1');
      expect(tasks).toHaveLength(0);
    });
  });

  describe('generateWBS', () => {
    it('should call gemini and parse valid WBS JSON', async () => {
      const mockWBS = JSON.stringify([
        {
          name: 'Desenvolvimento',
          description: 'Toda a parte de dev',
          level: 1,
          estimatedHours: 80,
          order: 1,
          children: [
            {
              name: 'Frontend',
              description: 'UI dev',
              level: 2,
              estimatedHours: 40,
              order: 1,
              children: [],
            },
            {
              name: 'Backend',
              description: 'API dev',
              level: 2,
              estimatedHours: 40,
              order: 2,
              children: [],
            },
          ],
        },
      ]);

      mockGeminiService.generateContent.mockResolvedValue(mockWBS);

      const result = await service.generateWBS({
        specific: 'Criar e-commerce com 500 produtos',
        measurable: '100k visitantes/mês',
        achievable: 'Time de 3 devs em 3 meses',
        relevant: 'Aumentar vendas online',
        temporal: 'Lançar em março 2026',
      });

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Desenvolvimento');
      expect(result[0].children).toHaveLength(2);
      expect(mockGeminiService.generateContent).toHaveBeenCalledTimes(1);
    });

    it('should handle Gemini response with markdown code blocks', async () => {
      const mockWBS = '```json\n[{"name":"Dev","level":1,"estimatedHours":40,"children":[]}]\n```';

      mockGeminiService.generateContent.mockResolvedValue(mockWBS);

      const result = await service.generateWBS({
        specific: 'Test',
        measurable: 'Test',
        achievable: 'Test',
        relevant: 'Test',
        temporal: 'Test',
      });

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Dev');
    });

    it('should throw error on invalid Gemini response', async () => {
      mockGeminiService.generateContent.mockResolvedValue('invalid json');

      await expect(
        service.generateWBS({
          specific: 'Test',
          measurable: 'Test',
          achievable: 'Test',
          relevant: 'Test',
          temporal: 'Test',
        }),
      ).rejects.toThrow();
    });
  });

  describe('suggestDecomposition', () => {
    it('should call gemini with node data for too large node', async () => {
      mockGeminiService.generateContent.mockResolvedValue('suggestion text');

      const result = await service.suggestDecomposition({
        name: 'Big Task',
        description: 'A very large task',
        estimatedHours: 120,
      });

      expect(result).toBe('suggestion text');
      expect(mockGeminiService.generateContent).toHaveBeenCalledTimes(1);
      const prompt = mockGeminiService.generateContent.mock.calls[0][0];
      expect(prompt).toContain('Big Task');
      expect(prompt).toContain('120h');
      expect(prompt).toContain('MUITO GRANDE');
    });

    it('should call gemini with node data for too small node', async () => {
      mockGeminiService.generateContent.mockResolvedValue('combine suggestion');

      await service.suggestDecomposition({
        name: 'Tiny Task',
        estimatedHours: 3,
      });

      const prompt = mockGeminiService.generateContent.mock.calls[0][0];
      expect(prompt).toContain('Tiny Task');
      expect(prompt).toContain('3h');
      expect(prompt).toContain('MUITO PEQUENO');
    });
  });

  describe('edge cases for 8/80 rule', () => {
    it.each([
      [7, false],
      [8, true],
      [40, true],
      [80, true],
      [81, false],
      [1, false],
      [100, false],
    ])('should validate %d hours as %s', (hours, expected) => {
      const node: WBSNodeDto = {
        name: `Task ${hours}h`,
        level: 3,
        estimatedHours: hours,
        children: [],
      };
      expect(service.validateWBSNode(node).valid).toBe(expected);
    });
  });
});
