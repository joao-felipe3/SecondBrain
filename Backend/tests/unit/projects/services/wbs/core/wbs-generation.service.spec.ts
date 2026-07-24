import { WbsGenerationService } from '@src/projects/services/wbs/core/wbs-generation.service';

describe('WbsGenerationService', () => {
  let service: WbsGenerationService;
  let mockWbsAiService: any;

  beforeEach(() => {
    mockWbsAiService = {
      generateWbs: jest.fn(),
    };
    service = new WbsGenerationService(mockWbsAiService);
  });

  it('should generate and normalize WBS tree from AI response', async () => {
    mockWbsAiService.generateWbs.mockResolvedValue([
      {
        name: 'Fase 1',
        description: 'Desc 1',
        estimatedHours: 10,
        children: [{ name: 'Pacote 1.1', estimatedHours: 5 }],
      },
    ]);

    const result = await service.generate({ specific: 'Build App' } as any);

    expect(result.length).toBe(1);
    expect(result[0].name).toBe('Fase 1');
    expect(result[0].level).toBe(1);
    expect(result[0].children?.[0].level).toBe(2);
  });

  it('should throw error when AI generation fails', async () => {
    mockWbsAiService.generateWbs.mockRejectedValue(new Error('AI fail'));

    await expect(service.generate({ specific: 'Build App' } as any)).rejects.toThrow(
      'Não foi possível gerar a WBS com IA',
    );
  });
});
