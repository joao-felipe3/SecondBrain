import {
  resolveStrategyGoals,
  resolveAnnualGoals,
  calculateCorrelations,
  generateWarnings,
  applyFractalFilter,
  generateXMatrixData,
} from '@src/projects/services/visualization/utils/x-matrix-helpers.util';
import { ProjectDocument } from '@src/projects/schemas/project.schema';
import { ProjectWaveDocument } from '@src/projects/schemas/project-wave.schema';

describe('X-Matrix Helpers Util', () => {
  describe('resolveStrategyGoals', () => {
    it('should use strategy3to5Years from DTO when provided', () => {
      const goals = resolveStrategyGoals({} as any, {
        strategy3to5Years: ['Expand to Market', 'Improve Retain'],
      });
      expect(goals.length).toBe(2);
      expect(goals[0].id).toBe('S1');
      expect(goals[0].label).toBe('Expand to Market');
    });

    it('should fallback to project goals and SMART objective when DTO is empty', () => {
      const project = {
        longTermGoal: 'Build Brand',
        smartObjective: {
          relevant: 'Core business growth',
          summary: 'Overall vision',
        },
      } as unknown as ProjectDocument;

      const goals = resolveStrategyGoals(project, {});
      expect(goals.length).toBeGreaterThan(0);
      expect(goals.map((g) => g.label)).toContain('Build Brand');
    });
  });

  describe('resolveAnnualGoals', () => {
    it('should use annualGoals from DTO when provided', () => {
      const goals = resolveAnnualGoals({} as any, [], {
        annualGoals: ['Launch MVP', 'Get 100 users'],
      });
      expect(goals.length).toBe(2);
      expect(goals[0].id).toBe('A1');
    });

    it('should fallback to project short/mid term goals and SMART objective', () => {
      const project = {
        shortTermGoal: 'Release v1',
        midTermGoal: 'Scale infra',
        smartObjective: {
          specific: 'Build auth',
          measurable: '100% tests',
        },
      } as unknown as ProjectDocument;

      const goals = resolveAnnualGoals(project, [], {});
      expect(goals.length).toBeGreaterThan(0);
      expect(goals.map((g) => g.label)).toContain('Release v1');
    });

    it('should fallback to wave execution goals when project fields are empty', () => {
      const waves = [
        {
          waveNumber: 1,
          startDate: '2026-01-01',
          endDate: '2026-01-15',
        } as unknown as ProjectWaveDocument,
        {
          waveNumber: 2,
        } as unknown as ProjectWaveDocument, // undefined dates
      ];

      const goals = resolveAnnualGoals({} as any, waves, {});
      expect(goals.length).toBe(2);
      expect(goals[0].label).toContain('Onda 1 (2026-01-01..2026-01-15)');
      expect(goals[1].label).toContain('Onda 2 (periodo indefinido)');
    });
  });

  describe('calculateCorrelations', () => {
    it('should compute cross-correlations with context map or label', () => {
      const strategyGoals = [{ id: 'S1', label: 'Estrategia A', source: 'strategy' as const }];
      const annualGoals = [{ id: 'A1', label: 'Meta Anual A', source: 'annual' as const }];
      const tacticalItems = [{ id: 'T1', label: 'Iniciativa A', source: 'tactical' as const }];
      const tacticalContextById = new Map([['T1', 'Iniciativa A completa com contexto']]);

      const result = calculateCorrelations({
        strategyGoals,
        annualGoals,
        tacticalItems,
        tacticalContextById,
      });

      expect(result.strategyToAnnual.length).toBe(1);
      expect(result.annualToTactical.length).toBe(1);
      expect(result.annualToTactical[0].fromId).toBe('A1');
      expect(result.annualToTactical[0].toId).toBe('T1');
    });
  });

  describe('generateWarnings', () => {
    it('should generate all potential warnings based on parameters', () => {
      const warnings = generateWarnings({
        strategyGoals: [],
        annualGoals: [],
        tacticalItems: [],
        tacticalByIdSize: 10,
        wavesCount: 0,
        project: {
          startDate: new Date('2026-01-01'),
          deadline: new Date('2026-02-01'), // 31 days <= 120 -> short duration
        } as any,
      });

      expect(warnings).toContain('Nao foi possivel identificar objetivos estrategicos.');
      expect(warnings).toContain('Nao foi possivel identificar metas anuais.');
      expect(warnings).toContain('Projeto sem iniciativas taticas suficientes (WBS nivel 1/2).');
      expect(warnings).toContain(
        'Nenhuma onda encontrada. Defina ondas para aplicar zoom tatico mensal/trimestral.',
      );
      expect(warnings.some((w) => w.includes('Zoom fractal aplicado'))).toBe(true);
    });

    it('should not warn about short duration if project start/deadline invalid or > 120 days', () => {
      const warnings = generateWarnings({
        strategyGoals: [{ id: 'S1', label: 'S1', source: 'strategy' }],
        annualGoals: [{ id: 'A1', label: 'A1', source: 'annual' }],
        tacticalItems: [{ id: 'T1', label: 'T1', source: 'tactical' }],
        tacticalByIdSize: 1,
        wavesCount: 2,
        project: {
          startDate: new Date('2026-01-01'),
          deadline: new Date('2026-08-01'), // > 120 days
        } as any,
      });

      expect(warnings.length).toBe(0);
    });
  });

  describe('applyFractalFilter', () => {
    it('should return all items if no useful correlations are found', () => {
      const filtered = applyFractalFilter({
        strategyGoals: [{ id: 'S1', label: 'S1', source: 'strategy' }],
        annualGoals: [{ id: 'A1', label: 'A1', source: 'annual' }],
        tacticalItems: [{ id: 'T1', label: 'T1', source: 'tactical' }],
        strategyToAnnual: [{ fromId: 'S1', toId: 'A1', strength: 'none', score: 0, rationale: '' }],
        annualToTactical: [{ fromId: 'A1', toId: 'T1', strength: 'none', score: 0, rationale: '' }],
      });

      expect(filtered.filteredStrategyGoals.length).toBe(1);
      expect(filtered.filteredAnnualGoals.length).toBe(1);
      expect(filtered.filteredTacticalItems.length).toBe(1);
    });

    it('should filter out disconnected goals and generate hidden warnings', () => {
      const filtered = applyFractalFilter({
        strategyGoals: [
          { id: 'S1', label: 'S1', source: 'strategy' },
          { id: 'S2', label: 'S2', source: 'strategy' },
        ],
        annualGoals: [
          { id: 'A1', label: 'A1', source: 'annual' },
          { id: 'A2', label: 'A2', source: 'annual' },
        ],
        tacticalItems: [
          { id: 'T1', label: 'T1', source: 'tactical' },
          { id: 'T2', label: 'T2', source: 'tactical' },
        ],
        strategyToAnnual: [
          { fromId: 'S1', toId: 'A1', strength: 'strong', score: 3, rationale: 'Matched' },
          { fromId: 'S2', toId: 'A2', strength: 'none', score: 0, rationale: '' },
        ],
        annualToTactical: [
          { fromId: 'A1', toId: 'T1', strength: 'medium', score: 2, rationale: 'Matched' },
          { fromId: 'A2', toId: 'T2', strength: 'none', score: 0, rationale: '' },
        ],
      });

      expect(filtered.filteredStrategyGoals.length).toBe(1);
      expect(filtered.filteredAnnualGoals.length).toBe(1);
      expect(filtered.filteredTacticalItems.length).toBe(1);
      expect(filtered.extraWarnings.length).toBeGreaterThan(0);
    });
  });

  describe('generateXMatrixData', () => {
    it('should generate complete X-Matrix structure with diagnostics', () => {
      const project = {
        longTermGoal: 'Scale product',
        smartObjective: { specific: 'MVP launch' },
      } as any;

      const data = generateXMatrixData({
        project,
        tasks: [{ id: 'task-1', name: 'Develop auth', wbsPath: '1.1' } as any],
        waves: [],
        dto: {
          maxTacticalItems: 50,
          wbsLevels: [1, 2],
        },
      });

      expect(data.strategyGoals).toBeDefined();
      expect(data.annualGoals).toBeDefined();
      expect(data.tacticalItems).toBeDefined();
      expect(data.diagnostics).toBeDefined();
      expect(data.diagnostics.warnings).toBeInstanceOf(Array);
    });
  });
});
