import {
  calculateCriticalPath,
  getTaskMetrics,
} from '../../../../../../src/tasks/services/dependencies/utils/cpm-analysis.utils';

describe('cpm-analysis.utils', () => {
  describe('calculateCriticalPath', () => {
    it('deve calcular a duração do projeto e identificar nós do caminho crítico com FS dependency', () => {
      const tasks: any[] = [
        {
          id: 't1',
          name: 'Task 1',
          duration: 120, // 2 horas
          dependencyEdges: [],
        },
        {
          id: 't2',
          name: 'Task 2',
          duration: 180, // 3 horas
          dependencyEdges: [{ predecessorId: 't1', relationship: 'FS' }],
        },
        {
          id: 't3',
          name: 'Task 3 Non Critical',
          duration: 60, // 1 hora
          dependencyEdges: [],
        },
      ];

      const result = calculateCriticalPath(tasks);

      expect(result).toBeDefined();
      expect(result.projectDuration).toBe(5); // 2h + 3h = 5h
      expect(result.criticalPath).toBeDefined();
      expect(result.criticalPath).toContain('t1');
      expect(result.criticalPath).toContain('t2');
      expect(result.tasksByImpact.length).toBe(3);
    });

    it('deve lidar com grafo vazio sem tarefas', () => {
      const result = calculateCriticalPath([]);

      expect(result.projectDuration).toBe(0);
      expect(result.criticalPath).toEqual([]);
      expect(result.tasksByImpact).toEqual([]);
      expect(result.alerts).toEqual([]);
    });

    it('deve identificar dependências faltantes (missingDependencyRefs) e respeitar limite de 5 amostras', () => {
      // 6 dependências explícitas que apontam para tarefas inexistentes
      const tasks: any[] = [
        {
          id: 't1',
          name: 'Task with many missing deps',
          duration: 60,
          dependencyEdges: [
            { predecessorId: 'ghost-1' },
            { predecessorId: 'ghost-2' },
            { predecessorId: 'ghost-3' },
            { predecessorId: 'ghost-4' },
            { predecessorId: 'ghost-5' },
            { predecessorId: 'ghost-6' },
          ],
        },
      ];

      const result = calculateCriticalPath(tasks);
      expect(result.diagnostics).toBeDefined();
      expect(result.diagnostics?.validation.missingDependencyRefs).toBe(6);
      expect(result.diagnostics?.validation.missingDependencySamples.length).toBe(5);
    });

    it('deve identificar ciclos de dependência, marcar confiabilidade baixa e usar fallback de criticalTasks', () => {
      const cyclicTasks: any[] = [
        {
          id: 'cycle-1',
          name: 'Cycle 1',
          duration: 60,
          dependencyEdges: [{ predecessorId: 'cycle-2', relationship: 'FS' }],
        },
        {
          id: 'cycle-2',
          name: 'Cycle 2',
          duration: 60,
          dependencyEdges: [{ predecessorId: 'cycle-1', relationship: 'FS' }],
        },
      ];

      const result = calculateCriticalPath(cyclicTasks);
      expect(result.diagnostics?.hasCycle).toBe(true);
      expect(result.diagnostics?.validation.reliability).toBe('low');
      expect(result.criticalPath).toEqual(['cycle-2', 'cycle-1']);
    });

    it('deve ordenar tarefas por impacto usando desempates: slack, indegree, duration, name e id', () => {
      // Criar conjunto de tarefas projetadas para exercitar cada critério de desempate em sortTasksByImpact
      const tasks: any[] = [
        // tSource -> t1 (mesmo slack 0, mas t1 tem indegree 1 e tSource tem indegree 0)
        {
          id: 'tSource',
          name: 'Source Task',
          duration: 60,
          dependencyEdges: [],
        },
        {
          id: 't1',
          name: 'Task B',
          duration: 60,
          dependencyEdges: [{ predecessorId: 'tSource', relationship: 'FS' }],
        },
        // tDurA e tDurB: mesmo slack, mesmo indegree (0), mas durações diferentes (120 vs 90)
        {
          id: 'tDurA',
          name: 'DurTest',
          duration: 120,
          dependencyEdges: [],
        },
        {
          id: 'tDurB',
          name: 'DurTest',
          duration: 90,
          dependencyEdges: [],
        },
        // t3 e t4 com mesmo slack, mesmo indegree (0), mesma duração (60), mas nomes diferentes
        {
          id: 't3',
          name: 'Zeta',
          duration: 60,
          dependencyEdges: [],
        },
        {
          id: 't4',
          name: 'Alpha',
          duration: 60,
          dependencyEdges: [],
        },
        // tNoName: tarefa sem nome definido
        {
          id: 'tNoName',
          duration: 60,
          dependencyEdges: [],
        },
        // t5a e t5b com mesmo slack, mesmo indegree, mesma duração, mesmo nome ('SameName'), desempatando por id
        {
          id: 't5b',
          name: 'SameName',
          duration: 60,
          dependencyEdges: [],
        },
        {
          id: 't5a',
          name: 'SameName',
          duration: 60,
          dependencyEdges: [],
        },
      ];

      const result = calculateCriticalPath(tasks);
      expect(result.tasksByImpact.length).toBe(tasks.length);

      // tDurA (duration 120) deve vir antes de tDurB (duration 90)
      const durAIdx = result.tasksByImpact.findIndex((t) => t.id === 'tDurA');
      const durBIdx = result.tasksByImpact.findIndex((t) => t.id === 'tDurB');
      expect(durAIdx).toBeLessThan(durBIdx);

      // t4 ('Alpha') deve vir antes de t3 ('Zeta')
      const alphaIdx = result.tasksByImpact.findIndex((t) => t.id === 't4');
      const zetaIdx = result.tasksByImpact.findIndex((t) => t.id === 't3');
      expect(alphaIdx).toBeLessThan(zetaIdx);

      // t5a deve vir antes de t5b pelo id
      const t5aIdx = result.tasksByImpact.findIndex((t) => t.id === 't5a');
      const t5bIdx = result.tasksByImpact.findIndex((t) => t.id === 't5b');
      expect(t5aIdx).toBeLessThan(t5bIdx);
    });

    it('deve calcular criticalPath para tarefa única sem dependências', () => {
      const tasks: any[] = [
        {
          id: 'solo-1',
          name: 'Solo Task 1',
          duration: 60,
          dependencyEdges: [],
        },
      ];

      const result = calculateCriticalPath(tasks);
      expect(result.criticalPath).toEqual(['solo-1']);
    });
  });

  describe('getTaskMetrics', () => {
    it('deve extrair métricas detalhadas quando todas estão preenchidas', () => {
      const taskNode: any = {
        id: 't1',
        name: 'Task 1',
        earlyStart: 0,
        earlyFinish: 2,
        lateStart: 0,
        lateFinish: 2,
        slack: 0,
        isCritical: true,
      };

      const metrics = getTaskMetrics(taskNode);

      expect(metrics).toBeDefined();
      expect(metrics.taskId).toBe('t1');
      expect(metrics.taskName).toBe('Task 1');
      expect(metrics.earlyStart).toBe(0);
      expect(metrics.earlyFinish).toBe(2);
      expect(metrics.lateStart).toBe(0);
      expect(metrics.lateFinish).toBe(2);
      expect(metrics.slack).toBe(0);
      expect(metrics.isCritical).toBe(true);
    });

    it('deve aplicar fallbacks ?? 0 quando as métricas de tempo estão ausentes', () => {
      const taskNode: any = {
        id: 't2',
        name: 'Task 2 Without Metrics',
      };

      const metrics = getTaskMetrics(taskNode);

      expect(metrics.earlyStart).toBe(0);
      expect(metrics.earlyFinish).toBe(0);
      expect(metrics.lateStart).toBe(0);
      expect(metrics.lateFinish).toBe(0);
      expect(metrics.slack).toBe(0);
      expect(metrics.isCritical).toBe(false);
    });
  });
});
