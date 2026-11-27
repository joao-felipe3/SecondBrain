import {
  MAX_WAVE_TARGET_HOURS,
  SlicingPackage,
  describeWaveFromSlices,
  packSlicesIntoWaves,
  resolveWaveTargetHours,
  scheduleWaves,
  sliceMaxForTarget,
  sliceWbsPackagesIntoWaves,
  splitPackageIntoSlices,
} from '@src/projects/services/strategy/utils/wave-slicing.util';

const pkg = (over: Partial<SlicingPackage> = {}): SlicingPackage => ({
  wbsNodeId: 'n1',
  wbsPath: 'Chinês > Anki básico',
  packageName: 'Anki básico',
  branchKey: 'Chinês',
  remainingHours: 80,
  ...over,
});

const sum = (xs: Array<{ hours: number }>) => xs.reduce((a, s) => a + s.hours, 0);

describe('wave-slicing.util', () => {
  describe('meta de horas por onda', () => {
    it('padrão 30h, limitada a 8–40h', () => {
      expect(resolveWaveTargetHours(undefined)).toBe(30);
      expect(resolveWaveTargetHours('abc')).toBe(30);
      expect(resolveWaveTargetHours(100)).toBe(MAX_WAVE_TARGET_HOURS);
      expect(resolveWaveTargetHours(2)).toBe(8);
      expect(resolveWaveTargetHours('24')).toBe(24);
    });

    it('fatia máxima é metade da onda (até 20h)', () => {
      expect(sliceMaxForTarget(30)).toBe(15);
      expect(sliceMaxForTarget(40)).toBe(20);
      expect(sliceMaxForTarget(8)).toBe(4);
    });
  });

  describe('splitPackageIntoSlices', () => {
    it('pacote de 80h vira fatias iguais de até 20h que somam 80h', () => {
      const slices = splitPackageIntoSlices(pkg());
      expect(slices).toHaveLength(4);
      expect(sum(slices)).toBe(80);
      expect(slices[1].goal).toBe('Parte 2/4');
    });

    it('respeita a fatia máxima pedida, em múltiplos de 0,5h', () => {
      const slices = splitPackageIntoSlices(pkg({ remainingHours: 45.5 }), 15);
      expect(slices.every((s) => s.hours <= 15 && (s.hours * 2) % 1 === 0)).toBe(true);
      expect(sum(slices)).toBe(45.5);
    });

    it('pacote pequeno é uma fatia só, com a descrição como objetivo', () => {
      const [only] = splitPackageIntoSlices(
        pkg({ remainingHours: 12, description: 'Montar o deck inicial. Depois revisar.' }),
      );
      expect(only.sliceCount).toBe(1);
      expect(only.goal).toBe('Montar o deck inicial.');
    });

    it('sem horas restantes não gera fatia', () => {
      expect(splitPackageIntoSlices(pkg({ remainingHours: 0 }))).toEqual([]);
    });
  });

  describe('packSlicesIntoWaves', () => {
    it('nenhuma onda passa da meta e todas (menos a última) ficam perto dela', () => {
      const packages = [
        pkg({ wbsNodeId: 'a', remainingHours: 80, branchKey: 'A' }),
        pkg({ wbsNodeId: 'b', remainingHours: 60, branchKey: 'A' }),
        pkg({ wbsNodeId: 'c', remainingHours: 100, branchKey: 'B' }),
        pkg({ wbsNodeId: 'd', remainingHours: 24, branchKey: 'C' }),
      ];
      const waves = sliceWbsPackagesIntoWaves(packages, 30);

      expect(sum(waves.flat())).toBe(264);
      for (const wave of waves) expect(sum(wave)).toBeLessThanOrEqual(30);
      for (const wave of waves.slice(0, -1)) expect(sum(wave)).toBeGreaterThan(15);
      // nenhuma onda vazia
      expect(waves.every((w) => w.length > 0)).toBe(true);
    });

    it('frentes paralelas se alternam e a ordem da WBS é mantida dentro de cada frente', () => {
      const slices = [
        ...splitPackageIntoSlices(pkg({ wbsNodeId: 'a1', remainingHours: 20, branchKey: 'A' }), 10),
        ...splitPackageIntoSlices(pkg({ wbsNodeId: 'a2', remainingHours: 20, branchKey: 'A' }), 10),
        ...splitPackageIntoSlices(pkg({ wbsNodeId: 'b1', remainingHours: 20, branchKey: 'B' }), 10),
      ];
      const waves = packSlicesIntoWaves(slices, 20);

      // a primeira onda tem trabalho das duas frentes
      expect(new Set(waves[0].map((s) => s.branchKey))).toEqual(new Set(['A', 'B']));
      // dentro da frente A: a1 (1,2) antes de a2 (1,2)
      const orderA = waves
        .flat()
        .filter((s) => s.branchKey === 'A')
        .map((s) => `${s.wbsNodeId}-${s.sliceIndex}`);
      expect(orderA).toEqual(['a1-1', 'a1-2', 'a2-1', 'a2-2']);
    });

    it('fatia maior que a meta ainda entra sozinha numa onda', () => {
      const waves = packSlicesIntoWaves(splitPackageIntoSlices(pkg({ remainingHours: 18 }), 20), 10);
      expect(waves).toHaveLength(1);
      expect(sum(waves[0])).toBe(18);
    });
  });

  describe('scheduleWaves', () => {
    const start = new Date('2026-12-01T10:00:00');

    it('divide o período até o prazo na proporção das horas de cada onda', () => {
      const r = scheduleWaves({
        waveHours: [30, 30, 15],
        startDate: start,
        deadline: new Date('2027-01-15'),
        dailyCapacityHours: 6,
      });
      const days = r.waves.map((w) => w.days);
      expect(days.reduce((a, b) => a + b, 0)).toBe(45);
      expect(days[0]).toBe(days[1]);
      expect(days[2]).toBeLessThan(days[0]);
      expect(r.waves[1].startDate.getTime()).toBe(r.waves[0].endDate.getTime());
      expect(r.adjustedDeadline).toBeNull();
    });

    it('estende o prazo quando a capacidade diária não comporta as horas', () => {
      const r = scheduleWaves({
        waveHours: [30, 30, 30, 30],
        startDate: start,
        deadline: new Date('2026-12-11'),
        dailyCapacityHours: 6,
      });
      expect(r.waves.reduce((a, w) => a + w.days, 0)).toBe(20);
      expect(r.adjustedDeadline).not.toBeNull();
    });

    it('toda onda tem pelo menos um dia', () => {
      const r = scheduleWaves({
        waveHours: [30, 1],
        startDate: start,
        deadline: null,
        dailyCapacityHours: 6,
      });
      expect(r.waves.every((w) => w.days >= 1)).toBe(true);
    });
  });

  it('descreve a onda pelas horas e pacotes', () => {
    const waves = sliceWbsPackagesIntoWaves([pkg({ remainingHours: 20 })], 30);
    expect(describeWaveFromSlices(waves[0])).toBe('20h · Anki básico');
  });
});
