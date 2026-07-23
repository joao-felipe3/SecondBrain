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
      expect(normalizeRelationship('invalid')).toBe(DependencyType.FINISH_TO_START);
    });
  });

  describe('getDependencyEdges & buildEdgeMap', () => {
    it('deve extrair dependências explícitas e fallback', () => {
      const task: any = {
        id: 't2',
        dependencyEdges: [{ predecessorId: 't1', relationship: 'fs' }],
      };

      const edges = getDependencyEdges(task);
      expect(edges).toHaveLength(1);
      expect(edges[0].predecessorId).toBe('t1');
    });
  });

  describe('forwardPass & backwardPass', () => {
    it('deve executar o cálculo de Forward Pass e Backward Pass', () => {
      const tasks: any[] = [
        { id: 't1', duration: 2 },
        { id: 't2', duration: 3 },
      ];
      const edgeMap = buildEdgeMap(tasks);

      const fwd = forwardPass({ tasks, edgeMap });
      expect(fwd).toBeDefined();
      expect(fwd.hasCycle).toBe(false);

      const bwd = backwardPass({ tasks, projectDuration: 5, edgeMap });
      expect(bwd).toBeDefined();
      expect(bwd.hasCycle).toBe(false);
    });
  });
});
