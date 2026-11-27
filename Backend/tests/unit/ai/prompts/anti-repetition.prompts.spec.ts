import { buildAntiRepetitionBlock } from '@src/ai/prompts/projects/anti-repetition.prompts';

describe('buildAntiRepetitionBlock', () => {
  afterEach(() => {
    delete process.env.WBS_ANTI_REPEAT_MAX_TITLES;
  });

  it('retorna vazio sem títulos', () => {
    expect(buildAntiRepetitionBlock([])).toBe('');
    expect(buildAntiRepetitionBlock(undefined)).toBe('');
  });

  it('envia todos os títulos de uma vez (mais que os 20 antigos)', () => {
    const words = Array.from(
      { length: 60 },
      (_, i) => `tema${'abcdefghij'[i % 10]}${'klmnopqrst'[Math.floor(i / 10)]}${'uvwxyz'[i % 6]}`,
    );
    const titles = words.map((w) => `Criar deck ${w}`);
    const block = buildAntiRepetitionBlock(titles);
    expect(block).toContain(titles[0]);
    expect(block).toContain(titles[59]);
  });

  it('junta títulos iguais após normalizar', () => {
    const block = buildAntiRepetitionBlock([
      'Revisar deck (1/3)',
      'Revisar deck (2/3)',
      'Criar cartões',
    ]);
    expect(block.match(/Revisar deck/g)).toHaveLength(1);
  });

  it('respeita o limite e mantém os mais recentes', () => {
    process.env.WBS_ANTI_REPEAT_MAX_TITLES = '2';
    const block = buildAntiRepetitionBlock(['Alfa tarefa', 'Beta tarefa', 'Gama tarefa']);
    expect(block).not.toContain('Alfa');
    expect(block).toContain('Beta');
    expect(block).toContain('Gama');
  });
});
