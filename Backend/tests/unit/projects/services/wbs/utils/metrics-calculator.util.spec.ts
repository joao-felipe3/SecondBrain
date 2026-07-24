import {
  computePertFromMinutes,
  estimateMicroTaskCount,
  computeChunkMinutes,
  computeBatchMetrics,
  cosineSimilarity,
  normalizeVector,
  kMeansClusters,
} from '@src/projects/services/wbs/utils/metrics-calculator.util';

describe('MetricsCalculatorUtil', () => {
  describe('computePertFromMinutes', () => {
    it('should compute PERT values correctly', () => {
      const res = computePertFromMinutes(60);
      expect(res.optimistic).toBe(45);
      expect(res.mostLikely).toBe(60);
      expect(res.pessimistic).toBe(90);
      expect(res.expected).toBe(63);
      expect(res.variance).toBeGreaterThan(0);
    });
  });

  describe('estimateMicroTaskCount', () => {
    it('should calculate estimated microtask count for leaf and nested nodes', () => {
      const nodes: any[] = [
        {
          name: 'Parent',
          children: [
            { name: 'Leaf 1', estimatedHours: 2, children: [] },
            { name: 'Leaf 2', estimatedHours: 4, children: [] },
          ],
        },
      ];

      const count = estimateMicroTaskCount(nodes);
      expect(count).toBeGreaterThan(0);
    });
  });

  describe('computeChunkMinutes', () => {
    it('should split total minutes into microtask chunks', () => {
      const chunks = computeChunkMinutes(180, { preferredPomodoros: 2 });
      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks.reduce((a, b) => a + b, 0)).toBe(180);
    });
  });

  describe('computeBatchMetrics', () => {
    it('should return zero metrics when task array is empty', () => {
      const metrics = computeBatchMetrics([]);
      expect(metrics.total).toBe(0);
    });

    it('should compute quality metrics for batch of tasks', () => {
      const tasks: any[] = [
        {
          name: 'Criar API',
          description: 'Redigir endpoints',
          microTaskType: 'produce',
          themeTag: 'backend',
        },
        {
          name: 'Testar API',
          description: 'Verificar respostas',
          microTaskType: 'test',
          themeTag: 'testing',
        },
        { name: 'Revisar codigo', description: 'Reler PR', microTaskType: 'review', themeTag: ['qa'] },
      ];

      const metrics = computeBatchMetrics(tasks);
      expect(metrics.total).toBe(3);
      expect(metrics.uniqueTitles).toBe(3);
      expect(metrics.dupScore).toBe(0);
    });
  });

  describe('Vector math & Clustering', () => {
    it('should compute cosineSimilarity', () => {
      expect(cosineSimilarity([1, 0], [1, 0])).toBe(1);
      expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
      expect(cosineSimilarity([1], [1, 2])).toBe(0);
    });

    it('should normalize vector to unit length', () => {
      const norm = normalizeVector([3, 4]);
      expect(norm).toEqual([0.6, 0.8]);
      expect(normalizeVector([0, 0])).toEqual([0, 0]);
    });

    it('should perform kMeansClusters on vector array', () => {
      const vectors = [
        [1, 0],
        [0.9, 0.1],
        [0, 1],
        [0.1, 0.9],
      ];

      const result = kMeansClusters(vectors, 2);
      expect(result.clusters.length).toBe(2);
      expect(result.centroids.length).toBe(2);
    });
  });
});
