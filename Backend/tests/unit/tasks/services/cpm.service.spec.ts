import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { CPMService, TaskNode } from '../../../../src/tasks/services/cpm.service';
import { TaskDependency } from '../../../../src/tasks/schemas/task-dependency.schema';
import { DependencyType } from '../../../../src/tasks/schemas/task-dependency.schema';

describe('CPMService - Critical Path Method', () => {
  let service: CPMService;
  let mockDependencyModel: any;

  beforeEach(async () => {
    // Mock do model
    mockDependencyModel = {
      find: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue([]),
      }),
      deleteOne: jest.fn().mockResolvedValue({}),
      constructor: jest.fn().mockResolvedValue({}),
      save: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CPMService,
        {
          provide: getModelToken(TaskDependency.name),
          useValue: mockDependencyModel,
        },
      ],
    }).compile();

    service = module.get<CPMService>(CPMService);
  });

  describe('calculateCriticalPath - Caso Simples (3 tarefas em série)', () => {
    it('deve identificar corretamente o caminho crítico', () => {
      const tasks: TaskNode[] = [
        {
          id: 'A',
          name: 'Design',
          duration: 120, // 2h em minutos
          dependencies: [],
        },
        {
          id: 'B',
          name: 'Desenvolvimento',
          duration: 300, // 5h
          dependencies: ['A'],
        },
        {
          id: 'C',
          name: 'Testes',
          duration: 120, // 2h
          dependencies: ['B'],
        },
      ];

      const analysis = service.calculateCriticalPath(tasks);

      // Todas as 3 devem ser críticas (em série, todas têm folga 0)
      expect(analysis.criticalPath).toContain('A');
      expect(analysis.criticalPath).toContain('B');
      expect(analysis.criticalPath).toContain('C');

      // Duração total = 2 + 5 + 2 = 9h
      expect(analysis.projectDuration).toBe(9);

      // Verifica métricas
      const taskB = analysis.tasksByImpact.find(t => t.id === 'B');
      expect(taskB?.earlyStart).toBe(2); // Começa após A terminar
      expect(taskB?.earlyFinish).toBe(7); // 2 + 5
      expect(taskB?.lateStart).toBe(2); // Sem atraso possível
      expect(taskB?.slack).toBeLessThan(0.1); // Folga ≈ 0
    });
  });

  describe('calculateCriticalPath - Caso Complexo com Paralelo', () => {
    it('deve identificar tarefas não-críticas com folga', () => {
      const tasks: TaskNode[] = [
        {
          id: 'A',
          name: 'Requisitos',
          duration: 120, // 2h
          dependencies: [],
        },
        {
          id: 'B',
          name: 'Design Frontend',
          duration: 180, // 3h
          dependencies: ['A'],
        },
        {
          id: 'C',
          name: 'Design Backend',
          duration: 120, // 2h
          dependencies: ['A'],
        },
        {
          id: 'D',
          name: 'Integração',
          duration: 120, // 2h
          dependencies: ['B', 'C'],
        },
      ];

      const analysis = service.calculateCriticalPath(tasks);

      // Caminho crítico: A → B → D (2 + 3 + 2 = 7h)
      // C tem folga de 1h (começa aos 2h, termina aos 4h, mas pode esperar até às 5h)
      expect(analysis.projectDuration).toBe(7);
      expect(analysis.criticalPath).toContain('A');
      expect(analysis.criticalPath).toContain('B');
      expect(analysis.criticalPath).toContain('D');
      expect(analysis.criticalPath).not.toContain('C'); // C não é crítica

      // Verifica folga de C
      const taskC = analysis.tasksByImpact.find(t => t.id === 'C');
      expect(taskC?.slack).toBeCloseTo(1, 0.1); // Folga ≈ 1h
      expect(taskC?.isCritical).toBe(false);
    });
  });

  describe('calculateCriticalPath - Exemplo do Guia (10 tarefas)', () => {
    it('deve calcular corretamente projeto real com múltiplas dependências', () => {
      const tasks: TaskNode[] = [
        { id: 't1', name: 'Análise', duration: 480, dependencies: [] }, // 8h
        { id: 't2', name: 'Projeto', duration: 480, dependencies: ['t1'] },
        { id: 't3', name: 'Frontend', duration: 720, dependencies: ['t2'] }, // 12h
        { id: 't4', name: 'Backend', duration: 1200, dependencies: ['t2'] }, // 20h (crítica esperada)
        { id: 't5', name: 'Testes Unit.', duration: 480, dependencies: ['t4'] }, // 8h
        { id: 't6', name: 'Testes Int.', duration: 600, dependencies: ['t3', 't5'] }, // 10h
        { id: 't7', name: 'Docs', duration: 240, dependencies: ['t4'] }, // 4h
        { id: 't8', name: 'Review', duration: 180, dependencies: ['t6', 't7'] }, // 3h
        { id: 't9', name: 'Deploy Pré', duration: 120, dependencies: ['t8'] }, // 2h
        { id: 't10', name: 'Deploy Prod', duration: 60, dependencies: ['t9'] }, // 1h
      ];

      const analysis = service.calculateCriticalPath(tasks);

      // Caminho crítico esperado: t1 → t2 → t4 → t5 → t6 → t8 → t9 → t10
      expect(analysis.criticalPath.length).toBeGreaterThan(0);
      expect(analysis.projectDuration).toBeGreaterThan(0);

      // Verifica que há alertas
      expect(analysis.alerts.length).toBeGreaterThan(0);

      // Task 4 (Backend - 20h) deve ter folga 0
      const task4 = analysis.tasksByImpact.find(t => t.id === 't4');
      expect(task4?.isCritical).toBe(true);

      // Task 3 (Frontend) deve ter folga (Frontend é paralelo ao Backend)
      const task3 = analysis.tasksByImpact.find(t => t.id === 't3');
      expect(task3?.slack).toBeGreaterThan(0);
    });
  });

  describe('getTaskMetrics', () => {
    it('deve retornar métricas formatadas de uma tarefa', () => {
      const task: TaskNode = {
        id: 'test-task',
        name: 'Test Task',
        duration: 360, // 6h
        dependencies: [],
        earlyStart: 0,
        earlyFinish: 6,
        lateStart: 0,
        lateFinish: 6,
        slack: 0,
        isCritical: true,
      };

      const metrics = service.getTaskMetrics(task);

      expect(metrics.taskId).toBe('test-task');
      expect(metrics.earlyStart).toBe(0);
      expect(metrics.earlyFinish).toBe(6);
      expect(metrics.slack).toBe(0);
      expect(metrics.isCritical).toBe(true);
    });
  });

  describe('detectCyclesImplicitly', () => {
    it('deve funcionar com dependências acíclicas', () => {
      const tasks: TaskNode[] = [
        { id: 'A', name: 'A', duration: 100, dependencies: [] },
        { id: 'B', name: 'B', duration: 100, dependencies: ['A'] },
        { id: 'C', name: 'C', duration: 100, dependencies: ['B'] },
      ];

      // Deve executar sem erros
      expect(() => service.calculateCriticalPath(tasks)).not.toThrow();
    });

    it('deve detectar ciclos (C → A → B → C)', () => {
      const tasks: TaskNode[] = [
        { id: 'A', name: 'A', duration: 100, dependencies: ['B'] },
        { id: 'B', name: 'B', duration: 100, dependencies: ['C'] },
        { id: 'C', name: 'C', duration: 100, dependencies: ['A'] }, // Ciclo!
      ];

      // Deve logar warning, não crashar
      const analysis = service.calculateCriticalPath(tasks);
      expect(analysis.alerts.some((a) => String(a).toLowerCase().includes('ciclo'))).toBe(true);
    });
  });

  describe('relationship-aware scheduling', () => {
    it('deve respeitar relacionamento START_TO_START (SS)', () => {
      const tasks: TaskNode[] = [
        {
          id: 'A',
          name: 'A',
          duration: 300, // 5h
          dependencies: [],
        },
        {
          id: 'B',
          name: 'B',
          duration: 180, // 3h
          dependencies: ['A'],
          dependencyEdges: [{ predecessorId: 'A', relationship: DependencyType.START_TO_START }],
        },
      ];

      const analysis = service.calculateCriticalPath(tasks);
      const taskA = analysis.tasksByImpact.find((t) => t.id === 'A');
      const taskB = analysis.tasksByImpact.find((t) => t.id === 'B');

      expect(taskA).toBeDefined();
      expect(taskB).toBeDefined();
      expect(taskA?.earlyStart).toBeCloseTo(0, 6);
      expect(taskB?.earlyStart).toBeCloseTo(0, 6);
      expect(taskB?.earlyFinish).toBeCloseTo(3, 6);
    });

    it('deve respeitar relacionamento FINISH_TO_FINISH (FF)', () => {
      const tasks: TaskNode[] = [
        {
          id: 'A',
          name: 'A',
          duration: 300, // 5h
          dependencies: [],
        },
        {
          id: 'C',
          name: 'C',
          duration: 120, // 2h
          dependencies: ['A'],
          dependencyEdges: [{ predecessorId: 'A', relationship: DependencyType.FINISH_TO_FINISH }],
        },
      ];

      const analysis = service.calculateCriticalPath(tasks);
      const taskA = analysis.tasksByImpact.find((t) => t.id === 'A');
      const taskC = analysis.tasksByImpact.find((t) => t.id === 'C');

      expect(taskA).toBeDefined();
      expect(taskC).toBeDefined();
      expect(taskA?.earlyFinish).toBeCloseTo(5, 6);
      expect(taskC?.earlyFinish).toBeCloseTo(5, 6);
      expect(taskC?.earlyStart).toBeCloseTo(3, 6);
    });
  });

  describe('package criticality scoring', () => {
    it('deve retornar criticidade agregada por pacote WBS', () => {
      const tasks: TaskNode[] = [
        {
          id: 'A1',
          name: 'Design',
          duration: 120,
          dependencies: [],
          parentWbsNodeId: 'pkg-design',
          wbsPath: 'Root > Design',
        },
        {
          id: 'B1',
          name: 'Build Core',
          duration: 360,
          dependencies: ['A1'],
          parentWbsNodeId: 'pkg-build',
          wbsPath: 'Root > Build',
        },
        {
          id: 'B2',
          name: 'Build Integration',
          duration: 300,
          dependencies: ['B1'],
          parentWbsNodeId: 'pkg-build',
          wbsPath: 'Root > Build',
        },
      ];

      const analysis = service.calculateCriticalPath(tasks);

      expect(Array.isArray(analysis.packageCriticality)).toBe(true);
      expect((analysis.packageCriticality || []).length).toBeGreaterThan(0);

      const buildPackage = (analysis.packageCriticality || []).find((p) => p.packageId === 'pkg-build');
      expect(buildPackage).toBeDefined();
      expect((buildPackage?.taskCount || 0)).toBe(2);
      expect((buildPackage?.criticalTaskCount || 0)).toBeGreaterThan(0);
      expect(typeof buildPackage?.score).toBe('number');
    });
  });

  describe('Edge Cases', () => {
    it('deve retornar vazio para lista vazia', () => {
      const analysis = service.calculateCriticalPath([]);
      expect(analysis.criticalPath).toHaveLength(0);
      expect(analysis.projectDuration).toBe(0);
    });

    it('deve calcular corretamente com uma única tarefa', () => {
      const tasks: TaskNode[] = [
        {
          id: 'solo',
          name: 'Solo Task',
          duration: 480,
          dependencies: [],
        },
      ];

      const analysis = service.calculateCriticalPath(tasks);
      expect(analysis.criticalPath).toContain('solo');
      expect(analysis.projectDuration).toBe(8); // 480min = 8h
    });

    it('deve lidar com tarefas sem dependência', () => {
      const tasks: TaskNode[] = [
        { id: 'A', name: 'A', duration: 120, dependencies: [] },
        { id: 'B', name: 'B', duration: 120, dependencies: [] },
        { id: 'C', name: 'C', duration: 120, dependencies: [] },
      ];

      const analysis = service.calculateCriticalPath(tasks);
      // Todas paralelas, duração = max = 2h
      expect(analysis.projectDuration).toBe(2);
      // Todas têm folga
      expect(analysis.criticalPath.length).toBeGreaterThanOrEqual(1);
    });
  });
});
