import { PertAiService } from '@src/ai/services/tasks/pert-ai.service';

describe('PertAiService', () => {
  let service: PertAiService;
  let mockConfigService: any;
  let mockGeminiService: any;

  beforeEach(() => {
    mockConfigService = {
      get: jest.fn().mockReturnValue(null),
    };

    mockGeminiService = {
      generateContent: jest.fn().mockResolvedValue(
        JSON.stringify({
          optimistic: 15,
          likely: 30,
          pessimistic: 60,
        }),
      ),
    };

    service = new PertAiService(mockConfigService, mockGeminiService);
  });

  it('suggestPertEstimates: should return estimates from Gemini LLM', async () => {
    const res = await service.suggestPertEstimates({ taskType: 'subtask', description: 'Write unit tests' });
    expect(res.fromLLM).toBe(true);
    expect(res.optimistic).toBe(15);
    expect(res.likely).toBe(30);
    expect(res.pessimistic).toBe(60);
    expect(res.expectedTime).toBeDefined();
    expect(res.recommendation).toBeDefined();
  });

  it('suggestPertEstimates: should use fallback when Gemini fails or returns invalid data', async () => {
    mockGeminiService.generateContent.mockRejectedValueOnce(new Error('AI error'));

    const res = await service.suggestPertEstimates({ taskType: 'complex', description: 'Refactor core module' });
    expect(res.fromLLM).toBe(false);
    expect(res.optimistic).toBe(30);
    expect(res.likely).toBe(60);
    expect(res.pessimistic).toBe(120);
  });

  it('suggestPertEstimates: should return cached result on second call', async () => {
    await service.suggestPertEstimates({ taskType: 'quick', description: 'Fix typo' });
    const cached = await service.suggestPertEstimates({ taskType: 'quick', description: 'Fix typo' });

    expect(cached).toBeDefined();
    expect(mockGeminiService.generateContent).toHaveBeenCalledTimes(1);
  });
});
