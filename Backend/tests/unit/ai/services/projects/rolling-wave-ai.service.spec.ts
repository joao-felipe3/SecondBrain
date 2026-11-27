import { RollingWaveAIService } from '@src/ai/services/projects/rolling-wave-ai.service';

describe('RollingWaveAIService.describeSlices', () => {
  let service: RollingWaveAIService;
  let gemini: { generateContent: jest.Mock };

  const pkg = (id: string, branchKey = 'A', slices = 2) => ({
    id,
    path: `${branchKey} > ${id}`,
    name: `Pacote ${id}`,
    branchKey,
    sliceHours: Array.from({ length: slices }, () => 20),
  });

  beforeEach(() => {
    gemini = { generateContent: jest.fn() };
    service = new RollingWaveAIService(gemini as any);
    jest.spyOn((service as any).logger, 'warn').mockImplementation(() => undefined);
  });

  it('devolve os objetivos por pacote quando a quantidade bate', async () => {
    gemini.generateContent.mockResolvedValue(
      JSON.stringify({
        packages: [{ id: 'p1', goals: ['Decks dos capítulos 1 a 3', 'Decks dos capítulos 4 a 6'] }],
      }),
    );

    const goals = await service.describeSlices({ projectName: 'Chinês', packages: [pkg('p1')] });

    expect(goals.get('p1')).toEqual(['Decks dos capítulos 1 a 3', 'Decks dos capítulos 4 a 6']);
    const prompt: string = gemini.generateContent.mock.calls[0][0];
    expect(prompt).toContain('id: "p1"');
    expect(prompt).toContain('fatias: 2');
  });

  it('ignora pacote com quantidade de objetivos diferente das fatias', async () => {
    gemini.generateContent.mockResolvedValue(
      JSON.stringify({ packages: [{ id: 'p1', goals: ['só um'] }] }),
    );
    const goals = await service.describeSlices({ projectName: 'X', packages: [pkg('p1')] });
    expect(goals.has('p1')).toBe(false);
  });

  it('falha de um lote não derruba os outros', async () => {
    gemini.generateContent
      .mockRejectedValueOnce(new Error('quota'))
      .mockResolvedValueOnce(JSON.stringify({ packages: [{ id: 'b1', goals: ['x', 'y'] }] }));

    const goals = await service.describeSlices({
      projectName: 'X',
      packages: [pkg('a1', 'A'), pkg('b1', 'B')],
    });

    expect(gemini.generateContent).toHaveBeenCalledTimes(2);
    expect(goals.has('a1')).toBe(false);
    expect(goals.get('b1')).toEqual(['x', 'y']);
  });

  it('agrupa por frente e limita o tamanho do lote', async () => {
    gemini.generateContent.mockResolvedValue('{"packages":[]}');
    const many = Array.from({ length: 13 }, (_, i) => pkg(`a${i}`, 'A'));
    await service.describeSlices({ projectName: 'X', packages: [...many, pkg('b0', 'B')] });
    // 13 da frente A → 2 lotes (12 + 1); frente B → 1 lote
    expect(gemini.generateContent).toHaveBeenCalledTimes(3);
  });
});
