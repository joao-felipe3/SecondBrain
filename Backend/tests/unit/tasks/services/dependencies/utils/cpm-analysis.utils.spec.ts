import {
  calculateCriticalPath,
  getTaskMetrics,
} from '../../../../../../src/tasks/services/dependencies/utils/cpm-analysis.utils';

describe('cpm-analysis.utils', () => {
  describe('calculateCriticalPath', () => {
    it('deve calcular a duração do projeto e identificar nós do caminho crítico', () => {
      const tasks: any[] = [
        {
          id: 't1',
          name: 'Task 1',
          duration: 120, // 2 horas
          dependencies: [],
        },
        {
          id: 't2',
          name: 'Task 2',
          duration: 180, // 3 horas
          dependencies: [{ predecessorId: 't1', relationship: 'FS', lag: 0 }],
        },
      ];

      const result = calculateCriticalPath(tasks);

      expect(result).toBeDefined();
      expect(result.projectDuration).toBeGreaterThan(0);
      expect(result.criticalPath).toBeDefined();
    });

    it('deve lidar com grafo vazio sem tarefas', () => {
      const result = calculateCriticalPath([]);

      expect(result.projectDuration).toBe(0);
      expect(result.criticalPath).toEqual([]);
    });
  });

  describe('getTaskMetrics', () => {
    it('deve extrair métricas detalhadas de uma tarefa', () => {
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
      expect(metrics.slack).toBe(0);
      expect(metrics.isCritical).toBe(true);
    });
  });
});
