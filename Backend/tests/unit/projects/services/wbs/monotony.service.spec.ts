import { Test, TestingModule } from '@nestjs/testing';
import { MonotonyService } from '../../../../../src/projects/services/wbs/core/monotony.service';
import { WbsAiService } from '../../../../../src/ai/services/projects/wbs-ai.service';

describe('MonotonyService', () => {
  let service: MonotonyService;
  let mockWbsAiService: any;

  beforeEach(async () => {
    mockWbsAiService = {
      fixMonotonyBatch: jest.fn().mockResolvedValue([
        {
          chunkIndex: 1,
          name: 'Criar documentação de APIs',
          description: 'Documentar endpoints no swagger',
          definitionOfDone: 'Endpoints documentados',
          checklist: ['Listar rotas', 'Validar schemas'],
          pomodorosPlanned: 2,
          priority: 2,
          difficult: 2,
        },
      ]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [MonotonyService, { provide: WbsAiService, useValue: mockWbsAiService }],
    }).compile();

    service = module.get<MonotonyService>(MonotonyService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('detectMonotonyIssues', () => {
    it('deve identificar títulos duplicados e vazios', () => {
      const drafts = [
        { name: 'Criar API' },
        { name: 'Criar API' }, // duplicado
        { name: '' }, // vazio
      ];

      const result = service.detectMonotonyIssues(drafts);
      expect(result.badIndices).toEqual([1, 2]);
    });

    it('deve retornar badIndices vazio para títulos únicos', () => {
      const drafts = [
        { name: 'Criar API de usuários' },
        { name: 'Desenvolver formulário de cadastro' },
        { name: 'Configurar banco de dados MongoDB' },
      ];

      const result = service.detectMonotonyIssues(drafts);
      expect(result.badIndices).toHaveLength(0);
    });
  });

  describe('autoFixMonotonyForLeaf', () => {
    it('deve corrigir problemas de monotonia chamando o wbsAiService', async () => {
      const drafts: any[] = [
        {
          name: 'Criar API 1/4',
          description: 'Desc 1',
          definitionOfDone: 'DoD 1',
          checklist: ['Item 1', 'Item 2'],
          pomodorosPlanned: 2,
        },
        {
          name: 'Criar API 2/4', // duplicado / padrão repetido
          description: 'Desc 2',
          definitionOfDone: 'DoD 2',
          checklist: ['Item 1', 'Item 2'],
          pomodorosPlanned: 2,
        },
      ];

      const params: any = {
        project: { _id: 'proj-1', name: 'Projeto Teste' },
        node: { name: 'Leaf node' },
        currentPath: '1.1',
        chunkMinutes: [60, 60],
        drafts,
        maxCalls: 3,
        level: 1,
      };

      const result = await service.autoFixMonotonyForLeaf(params);

      expect(result.aiCallsUsed).toBeGreaterThanOrEqual(1);
      expect(result.drafts[1].name).toBe('Criar documentação de APIs');
      expect(mockWbsAiService.fixMonotonyBatch).toHaveBeenCalled();
    });
  });
});
