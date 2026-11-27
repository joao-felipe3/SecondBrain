import {
  SLICE_MAX_HOURS,
  SlicingPackage,
  assignSlicesToWaves,
  computeWaveStructure,
  describeWaveFromSlices,
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

describe('wave-slicing.util', () => {
  describe('splitPackageIntoSlices', () => {
    it('pacote de 80h vira fatias de até 20h que somam 80h', () => {
      const slices = splitPackageIntoSlices(pkg());
      expect(slices).toHaveLength(4);
      expect(slices.every((s) => s.hours <= SLICE_MAX_HOURS)).toBe(true);
      expect(slices.reduce((a, s) => a + s.hours, 0)).toBe(80);
      expect(slices.map((s) => s.sliceIndex)).toEqual([1, 2, 3, 4]);
      expect(slices[1].goal).toBe('Parte 2/4');
    });

    it('divide em partes iguais em múltiplos de 0,5h, nunca menores que 4h', () => {
      const slices = splitPackageIntoSlices(pkg({ remainingHours: 21 }));
      expect(slices.map((s) => s.hours)).toEqual([10.5, 10.5]);
      const odd = splitPackageIntoSlices(pkg({ remainingHours: 45.5 }));
      expect(odd.reduce((a, s) => a + s.hours, 0)).toBe(45.5);
      expect(odd.every((s) => s.hours >= 4 && (s.hours * 2) % 1 === 0)).toBe(true);
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
      expect(splitPackageIntoSlices(pkg({ remainingHours: -3 }))).toEqual([]);
    });
  });

  describe('computeWaveStructure', () => {
    const start = new Date('2026-12-01T10:00:00');

    it('usa o prazo quando a capacidade cabe nele', () => {
      const r = computeWaveStructure({
        startDate: start,
        deadline: new Date('2027-03-01'),
        totalHours: 200,
        dailyCapacityHours: 6,
        waveLengthDays: 28,
      });
      const days = r.waves.reduce((a, w) => a + w.days, 0);
      expect(days).toBe(90);
      expect(r.waves).toHaveLength(3);
      expect(r.adjustedDeadline).toBeNull();
      expect(r.waves[1].startDate.getTime()).toBe(r.waves[0].endDate.getTime());
      expect(r.waves[0].capacityHours).toBe(r.waves[0].days * 6);
    });

    it('estende o prazo quando as horas não cabem na capacidade', () => {
      const r = computeWaveStructure({
        startDate: start,
        deadline: new Date('2026-12-11'),
        totalHours: 120,
        dailyCapacityHours: 6,
        waveLengthDays: 28,
      });
      expect(r.waves.reduce((a, w) => a + w.days, 0)).toBe(20);
      expect(r.adjustedDeadline).not.toBeNull();
    });

    it('sem prazo, usa só a capacidade', () => {
      const r = computeWaveStructure({
        startDate: start,
        deadline: null,
        totalHours: 336,
        dailyCapacityHours: 6,
        waveLengthDays: 28,
      });
      expect(r.waves.reduce((a, w) => a + w.days, 0)).toBe(56);
      expect(r.waves).toHaveLength(2);
    });
  });

  describe('assignSlicesToWaves', () => {
    it('cada frente se espalha por todas as ondas, mantendo a ordem da WBS', () => {
      const slices = [
        ...splitPackageIntoSlices(pkg({ wbsNodeId: 'a', remainingHours: 40, branchKey: 'A' })),
        ...splitPackageIntoSlices(pkg({ wbsNodeId: 'b', remainingHours: 40, branchKey: 'A' })),
        ...splitPackageIntoSlices(pkg({ wbsNodeId: 'c', remainingHours: 40, branchKey: 'B' })),
      ];
      const waves = assignSlicesToWaves(slices, [100, 100]);
      // Frente A (80h): pacote a na onda 1, pacote b na onda 2
      expect(waves.slice(0, 2)).toEqual([0, 0]);
      expect(waves.slice(2, 4)).toEqual([1, 1]);
      // Frente B (40h) é paralela: metade em cada onda
      expect(waves.slice(4)).toEqual([0, 1]);
      // ordem nunca regride dentro da frente
      const a = waves.slice(0, 4);
      expect([...a].sort()).toEqual(a);
    });

    it('com uma onda só, tudo vai para ela', () => {
      expect(assignSlicesToWaves(splitPackageIntoSlices(pkg()), [500])).toEqual([0, 0, 0, 0]);
    });
  });

  describe('sliceWbsPackagesIntoWaves', () => {
    it('preserva o total de horas e respeita a capacidade proporcional', () => {
      const packages = [
        pkg({ wbsNodeId: 'a', remainingHours: 80, branchKey: 'A' }),
        pkg({ wbsNodeId: 'b', remainingHours: 60, branchKey: 'A' }),
        pkg({ wbsNodeId: 'c', remainingHours: 100, branchKey: 'B' }),
      ];
      const byWave = sliceWbsPackagesIntoWaves(packages, [168, 168]);
      const total = byWave.flat().reduce((a, s) => a + s.hours, 0);
      expect(total).toBe(240);
      for (const wave of byWave) {
        expect(wave.reduce((a, s) => a + s.hours, 0)).toBeLessThanOrEqual(168);
      }
      expect(describeWaveFromSlices(byWave[0])).toMatch(/^\d+(\.5)?h · /);
    });
  });
});
