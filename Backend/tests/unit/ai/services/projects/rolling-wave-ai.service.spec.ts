import { RollingWaveAIService } from '@src/ai/services/projects/rolling-wave-ai.service';

describe('RollingWaveAIService', () => {
  let service: RollingWaveAIService;
  let mockGeminiService: any;

  beforeEach(() => {
    mockGeminiService = {
      generateContent: jest.fn(),
    };
    service = new RollingWaveAIService(mockGeminiService);
  });

  describe('planWaveStructure', () => {
    it('should parse valid AI wave structure response', async () => {
      mockGeminiService.generateContent.mockResolvedValueOnce(
        JSON.stringify({
          recommendedWaveCount: 3,
          totalDurationDays: 30,
          description: '3-wave structure',
          reasoning: 'Balanced load',
        }),
      );

      const res = await service.planWaveStructure({
        project: { name: 'Proj', deadline: new Date('2026-02-01') } as any,
        tasks: [{ estimatedHours: 10 }] as any,
        dailyCapacityHours: 8,
      });

      expect(res).not.toBeNull();
      expect(res?.recommendedWaveCount).toBe(3);
    });

    it('should return null when Gemini returns malformed response', async () => {
      mockGeminiService.generateContent.mockResolvedValueOnce('Invalid non-json text');

      const res = await service.planWaveStructure({
        project: { name: 'Proj', deadline: new Date('2026-02-01') } as any,
        tasks: [],
        dailyCapacityHours: 8,
      });

      expect(res).toBeNull();
    });
  });

  describe('planWaveGrouping', () => {
    it('should parse and normalize wave grouping AI response', async () => {
      mockGeminiService.generateContent.mockResolvedValueOnce(
        JSON.stringify({
          waves: [
            { waveNumber: 1, wbsAllocation: { 'WBS-1': 1 } },
            { waveNumber: 2, wbsAllocation: { 'WBS-2': 1 } },
          ],
          rationale: 'Reasonable distribution',
        }),
      );

      const tasks: any[] = [
        { _id: 't1', wbsPath: 'WBS-1' },
        { _id: 't2', wbsPath: 'WBS-2' },
      ];

      const plan = await service.planWaveGrouping({
        project: { name: 'Proj', deadline: new Date('2026-01-20') } as any,
        tasks,
        wbsTree: [],
        dailyCapacityHours: 8,
        waveCount: 2,
      });

      expect(plan).not.toBeNull();
      expect(plan?.waves.length).toBe(2);
    });
  });
});
