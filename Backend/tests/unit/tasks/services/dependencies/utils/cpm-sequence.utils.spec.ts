import { buildCriticalPathSequence } from '../../../../../../src/tasks/services/dependencies/utils/cpm-sequence.utils';
import { DependencyType } from '../../../../../../src/tasks/schemas/task-dependency.schema';

describe('cpm-sequence.utils', () => {
  it('deve retornar array vazio se não houver tarefas ou nenhuma tiver earlyFinish', () => {
    expect(buildCriticalPathSequence({ tasks: [], projectDuration: 0, edgeMap: new Map() })).toEqual([]);
    expect(
      buildCriticalPathSequence({
        tasks: [{ id: 't1' } as any],
        projectDuration: 10,
        edgeMap: new Map(),
      }),
    ).toEqual([]);
  });

  it('deve construir a sequência do caminho crítico para dependências finish-to-start', () => {
    const tasks: any[] = [
      { id: 't1', duration: 3, earlyStart: 0, earlyFinish: 3, slack: 0 },
      { id: 't2', duration: 4, earlyStart: 3, earlyFinish: 7, slack: 0 },
      { id: 't3', duration: 2, earlyStart: 0, earlyFinish: 2, slack: 5 },
    ];
    const edgeMap = new Map([
      ['t1', []],
      ['t2', [{ predecessorId: 't1', relationship: DependencyType.FINISH_TO_START }]],
      ['t3', []],
    ]);

    const seq = buildCriticalPathSequence({ tasks, projectDuration: 7, edgeMap });
    expect(seq).toEqual(['t1', 't2']);
  });

  it('deve suportar relacionamentos start-to-start e finish-to-finish na reconstrução da sequência', () => {
    const tasks: any[] = [
      { id: 't1', duration: 4, earlyStart: 0, earlyFinish: 4, slack: 0 },
      { id: 't2', duration: 3, earlyStart: 0, earlyFinish: 3, slack: 0 },
      { id: 't3', duration: 2, earlyStart: 2, earlyFinish: 4, slack: 0 },
    ];
    const edgeMap = new Map([
      ['t1', []],
      ['t2', [{ predecessorId: 't1', relationship: DependencyType.START_TO_START }]],
      ['t3', [{ predecessorId: 't1', relationship: DependencyType.FINISH_TO_FINISH }]],
    ]);

    const seqSS = buildCriticalPathSequence({
      tasks: [tasks[0], tasks[1]],
      projectDuration: 4,
      edgeMap,
    });
    expect(seqSS).toContain('t1');

    const seqFF = buildCriticalPathSequence({
      tasks: [tasks[0], tasks[2]],
      projectDuration: 4,
      edgeMap,
    });
    expect(seqFF).toContain('t1');
  });

  it('deve escolher candidato com earlyFinish próximo ao projectDuration se o último não coincidir', () => {
    const tasks: any[] = [
      { id: 't1', duration: 5, earlyStart: 0, earlyFinish: 5, slack: 0 },
      { id: 't2', duration: 8, earlyStart: 0, earlyFinish: 8, slack: 2 },
    ];
    const edgeMap = new Map([
      ['t1', []],
      ['t2', []],
    ]);

    const seq = buildCriticalPathSequence({ tasks, projectDuration: 5, edgeMap });
    expect(seq).toEqual(['t1']);
  });

  it('deve desempatar múltiplos predecessores críticos usando ordenação por id', () => {
    const tasks: any[] = [
      { id: 'tA', duration: 3, earlyStart: 0, earlyFinish: 3, slack: 0 },
      { id: 'tB', duration: 3, earlyStart: 0, earlyFinish: 3, slack: 0 },
      { id: 'tC', duration: 2, earlyStart: 3, earlyFinish: 5, slack: 0 },
    ];
    const edgeMap = new Map([
      ['tA', []],
      ['tB', []],
      [
        'tC',
        [
          { predecessorId: 'tB', relationship: DependencyType.FINISH_TO_START },
          { predecessorId: 'tA', relationship: DependencyType.FINISH_TO_START },
        ],
      ],
    ]);

    const seq = buildCriticalPathSequence({ tasks, projectDuration: 5, edgeMap });
    expect(seq).toEqual(['tA', 'tC']);
  });

  it('deve prevenir loops infinitos em caso de ciclos residuais', () => {
    const tasks: any[] = [
      { id: 't1', duration: 2, earlyStart: 0, earlyFinish: 2, slack: 0 },
      { id: 't2', duration: 2, earlyStart: 0, earlyFinish: 2, slack: 0 },
    ];
    const edgeMap = new Map([
      ['t1', [{ predecessorId: 't2', relationship: DependencyType.FINISH_TO_START }]],
      ['t2', [{ predecessorId: 't1', relationship: DependencyType.FINISH_TO_START }]],
    ]);

    const seq = buildCriticalPathSequence({ tasks, projectDuration: 2, edgeMap });
    expect(seq.length).toBeLessThanOrEqual(2);
  });
});
