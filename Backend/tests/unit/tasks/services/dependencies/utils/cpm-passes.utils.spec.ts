import {
  normalizeRelationship,
  getDependencyEdges,
  buildEdgeMap,
  forwardPass,
  backwardPass,
} from '../../../../../../src/tasks/services/dependencies/utils/cpm-passes.utils';
import { DependencyType } from '../../../../../../src/tasks/schemas/task-dependency.schema';

describe('cpm-passes.utils', () => {
  describe('normalizeRelationship', () => {
    it('deve normalizar tipos de relacionamento para o enum DependencyType', () => {
      expect(normalizeRelationship('finish-to-start')).toBe(DependencyType.FINISH_TO_START);
      expect(normalizeRelationship('start-to-start')).toBe(DependencyType.START_TO_START);
      expect(normalizeRelationship('finish-to-finish')).toBe(DependencyType.FINISH_TO_FINISH);
      expect(normalizeRelationship('invalid')).toBe(DependencyType.FINISH_TO_START);
      expect(normalizeRelationship(undefined)).toBe(DependencyType.FINISH_TO_START);
    });
  });

  describe('getDependencyEdges & buildEdgeMap', () => {
    it('deve extrair dependências explícitas e fallback', () => {
      const task: any = {
        id: 't2',
        dependencyEdges: [{ predecessorId: 't1', relationship: 'finish-to-finish' }],
        dependencies: ['t1', 't0'], // 't1' should be deduplicated
      };

      const edges = getDependencyEdges(task);
      expect(edges).toHaveLength(2);
      expect(edges[0]).toEqual({ predecessorId: 't1', relationship: DependencyType.FINISH_TO_FINISH });
      expect(edges[1]).toEqual({ predecessorId: 't0', relationship: DependencyType.FINISH_TO_START });
    });

    it('deve ignorar entradas vazias ou inválidas', () => {
      const task: any = {
        id: 't2',
        dependencyEdges: [{ predecessorId: '' }, null],
        dependencies: ['', null],
      };

      const edges = getDependencyEdges(task);
      expect(edges).toHaveLength(0);
    });
  });

  describe('forwardPass & backwardPass with different relationship types', () => {
    it('deve calcular Start-to-Start e Finish-to-Finish no forward e backward pass', () => {
      const tasks: any[] = [
        {
          id: 't1',
          duration: 4,
          dependencyEdges: [],
        },
        {
          id: 't2',
          duration: 3,
          dependencyEdges: [{ predecessorId: 't1', relationship: DependencyType.START_TO_START }],
        },
        {
          id: 't3',
          duration: 2,
          dependencyEdges: [{ predecessorId: 't1', relationship: DependencyType.FINISH_TO_FINISH }],
        },
      ];
      const edgeMap = buildEdgeMap(tasks);

      const fwd = forwardPass({ tasks, edgeMap });
      expect(fwd.hasCycle).toBe(false);
      expect(fwd.unprocessed).toBe(0);

      const bwd = backwardPass({ tasks, projectDuration: 10, edgeMap });
      expect(bwd.hasCycle).toBe(false);
      expect(bwd.unprocessed).toBe(0);
    });

    it('deve detectar ciclo no forward pass e backward pass quando existe loop', () => {
      const tasks: any[] = [
        {
          id: 't1',
          duration: 2,
          dependencyEdges: [{ predecessorId: 't2', relationship: DependencyType.FINISH_TO_START }],
        },
        {
          id: 't2',
          duration: 3,
          dependencyEdges: [{ predecessorId: 't1', relationship: DependencyType.FINISH_TO_START }],
        },
      ];
      const edgeMap = buildEdgeMap(tasks);

      const fwd = forwardPass({ tasks, edgeMap });
      expect(fwd.hasCycle).toBe(true);
      expect(fwd.unprocessed).toBe(2);

      const bwd = backwardPass({ tasks, projectDuration: 10, edgeMap });
      expect(bwd.hasCycle).toBe(true);
      expect(bwd.unprocessed).toBe(2);
    });
  });
});
