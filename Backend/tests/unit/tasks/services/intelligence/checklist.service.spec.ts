import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ChecklistService } from '../../../../../src/tasks/services/intelligence/checklist.service';

describe('ChecklistService', () => {
  let service: ChecklistService;
  let mockTaskModel: any;

  beforeEach(async () => {
    mockTaskModel = {
      find: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue([
              { name: 'Criar schema', description: 'Desc', checklist: [{ item: 'Definir campos' }] },
            ]),
          }),
        }),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChecklistService,
        {
          provide: getModelToken('Task'),
          useValue: mockTaskModel,
        },
      ],
    }).compile();

    service = module.get<ChecklistService>(ChecklistService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findSimilarTasksInProject', () => {
    it('deve retornar array vazio para projectId inválido', async () => {
      const result = await service.findSimilarTasksInProject({ projectId: 'invalid', microTaskType: 'complex' });
      expect(result).toEqual([]);
    });

    it('deve retornar tarefas similares para projectId válido', async () => {
      const result = await service.findSimilarTasksInProject({
        projectId: '507f1f77bcf86cd799439011',
        microTaskType: 'complex',
      });

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Criar schema');
    });
  });

  describe('enrichHistoryContext', () => {
    it('deve enriquecer o texto de contexto com histórico', () => {
      const history = [{ name: 'Task 1', checklist: [{ item: 'Step 1' }] }];
      const text = service.enrichHistoryContext(history);

      expect(text).toContain('Tarefas similares');
      expect(text).toContain('Task 1');
      expect(text).toContain('Step 1');
    });
  });

  describe('validateChecklistStructure', () => {
    it('deve rejeitar checklist com menos de 3 itens', () => {
      const result = service.validateChecklistStructure(['Item 1', 'Item 2']);
      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('mínimo 3 itens');
    });

    it('deve aprovar checklist válido com 3+ itens distintos', () => {
      const result = service.validateChecklistStructure(['Item 1', 'Item 2', 'Item 3']);
      expect(result.isValid).toBe(true);
    });

    it('deve rejeitar itens duplicados', () => {
      const result = service.validateChecklistStructure(['Item 1', 'Item 1', 'Item 3']);
      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('Item duplicado');
    });
  });

  describe('validateChecklistCompletion', () => {
    it('deve rejeitar se houver itens pendentes', () => {
      const result = service.validateChecklistCompletion([
        { completed: true },
        { completed: false },
      ]);
      expect(result.isValid).toBe(false);
    });

    it('deve aprovar se todos os itens estiverem concluídos', () => {
      const result = service.validateChecklistCompletion([
        { completed: true },
        { completed: true },
      ]);
      expect(result.isValid).toBe(true);
    });
  });

  describe('calculateCompletionPercentage', () => {
    it('deve calcular a porcentagem correta', () => {
      const percentage = service.calculateCompletionPercentage([
        { completed: true },
        { completed: false },
      ]);
      expect(percentage).toBe(50);
    });
  });
});
