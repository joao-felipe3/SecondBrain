import { DraftsAiService } from '@src/ai/services/tasks/drafts-ai.service';

describe('DraftsAiService', () => {
  let service: DraftsAiService;
  let mockGeminiService: any;
  let mockPromptBuilder: any;

  beforeEach(() => {
    mockGeminiService = {
      generateContent: jest.fn(),
    };
    mockPromptBuilder = {
      buildMicroTasksPlannerPrompt: jest.fn().mockReturnValue('planner prompt'),
      buildMicroTasksPrompt: jest.fn().mockReturnValue('prompt without plan'),
      buildMicroTasksGeneratorPrompt: jest.fn().mockReturnValue('prompt with plan'),
      buildMicroTasksOutlinePrompt: jest.fn().mockReturnValue('outline prompt without plan'),
      buildMicroTasksOutlineWithPlanPrompt: jest.fn().mockReturnValue('outline prompt with plan'),
      buildMicroTaskDetailsPrompt: jest.fn().mockReturnValue('details prompt'),
      buildMicroTaskDetailsBatchPrompt: jest.fn().mockReturnValue('batch details prompt'),
    };

    service = new DraftsAiService(mockGeminiService, mockPromptBuilder);
  });

  describe('generatePlan', () => {
    it('should generate plan successfully', async () => {
      mockGeminiService.generateContent.mockResolvedValueOnce(
        JSON.stringify({
          themes: [{ name: 'dev' }],
          workflow: ['dev'],
          architectureType: 'monolith',
          riskLevel: 'low',
        }),
      );

      const plan = await service.generatePlan({ node: { name: 'N1' } } as any, ['hint']);
      expect(plan.workflow.length).toBe(1);
    });

    it('should throw error when plan validation fails', async () => {
      mockGeminiService.generateContent.mockResolvedValueOnce(JSON.stringify({ invalid: true }));
      await expect(service.generatePlan({ node: { name: 'N1' } } as any, [])).rejects.toThrow(
        'Plano inválido',
      );
    });
  });

  describe('generateSinglePassWithoutPlan & generateSinglePassWithPlan', () => {
    it('should generate microtask drafts without plan context', async () => {
      mockGeminiService.generateContent.mockResolvedValue(
        JSON.stringify([
          {
            name: 'Task No Plan 1',
            description: 'Desc',
            pomodorosPlanned: 2,
            priority: 2,
            difficult: 2,
            microTaskType: 'code',
            themeTag: 'tech',
            contextTag: 'dev',
            cognitiveMode: 'deep',
            checklist: ['step 1', 'step 2'],
            definitionOfDone: 'done',
          },
        ]),
      );

      const drafts = await service.generateSinglePassWithoutPlan(
        { node: { name: 'Node' } } as any,
        [60],
        [],
      );

      expect(drafts.length).toBe(1);
      expect(drafts[0].name).toBe('Task No Plan 1');
    });

    it('should generate microtask drafts with plan context', async () => {
      mockGeminiService.generateContent.mockResolvedValue(
        JSON.stringify([
          {
            name: 'Task Plan 1',
            description: 'Desc',
            pomodorosPlanned: 2,
            priority: 2,
            difficult: 2,
            microTaskType: 'code',
            themeTag: 'tech',
            contextTag: 'dev',
            cognitiveMode: 'deep',
            checklist: ['step 1', 'step 2'],
            definitionOfDone: 'done',
          },
        ]),
      );

      const drafts = await service.generateSinglePassWithPlan(
        { node: { name: 'Node' }, plan: {} } as any,
        [60],
        [],
      );

      expect(drafts.length).toBe(1);
      expect(drafts[0].name).toBe('Task Plan 1');
    });
  });

  describe('generateOutlineWithoutPlan & generateOutlineWithPlan', () => {
    it('should generate outlines without plan', async () => {
      mockGeminiService.generateContent.mockResolvedValue(
        JSON.stringify([
          {
            name: 'Outline 1',
            pomodorosPlanned: 2,
            priority: 2,
            difficult: 2,
            microTaskType: 'code',
            themeTag: 'tech',
            contextTag: 'dev',
            cognitiveMode: 'deep',
          },
        ]),
      );

      const outlines = await service.generateOutlineWithoutPlan(
        { node: { name: 'Node' } } as any,
        [60],
        [],
      );

      expect(outlines.length).toBe(1);
      expect(outlines[0].name).toBe('Outline 1');
    });

    it('should generate outlines with plan', async () => {
      mockGeminiService.generateContent.mockResolvedValue(
        JSON.stringify([
          {
            name: 'Outline Plan 1',
            pomodorosPlanned: 2,
            priority: 2,
            difficult: 2,
            microTaskType: 'code',
            themeTag: 'tech',
            contextTag: 'dev',
            cognitiveMode: 'deep',
          },
        ]),
      );

      const outlines = await service.generateOutlineWithPlan(
        { node: { name: 'Node' }, plan: {} } as any,
        [60],
        [],
      );

      expect(outlines.length).toBe(1);
      expect(outlines[0].name).toBe('Outline Plan 1');
    });
  });

  describe('generateDetails & generateDetailsBatch', () => {
    it('should generate single task details', async () => {
      mockGeminiService.generateContent.mockResolvedValueOnce(
        JSON.stringify({
          description: 'Detailed desc',
          checklist: ['s1', 's2'],
          definitionOfDone: 'DoD complete',
        }),
      );

      const details = await service.generateDetails(
        {
          outline: { name: 'O1' } as any,
          targetMinutes: 60,
          params: { project: {}, node: { name: 'N1' }, currentPath: 'path', level: 1 } as any,
          maxTokens: 900,
          retryMaxTokens: 1400,
        },
        900,
        0.15,
      );

      expect(details.length).toBe(1);
      expect(details[0].description).toBe('Detailed desc');
    });

    it('should generate details batch for multiple outlines', async () => {
      mockGeminiService.generateContent.mockResolvedValueOnce(
        JSON.stringify([
          { description: 'd1', checklist: ['s1', 's2'], definitionOfDone: 'dod1' },
          { description: 'd2', checklist: ['s3', 's4'], definitionOfDone: 'dod2' },
        ]),
      );

      const detailsList = await service.generateDetailsBatch(
        {
          enrichParams: {
            outlines: [{ name: 'O1' }, { name: 'O2' }] as any,
            sliceMinutes: [60, 60],
            params: { project: {}, node: { name: 'N1' }, currentPath: 'path', level: 1 } as any,
          },
          detailsMaxTokens: 1800,
          detailsRetryMaxTokens: 3500,
          depth: 0,
        },
        1800,
        0.15,
      );

      expect(detailsList.length).toBe(2);
      expect(detailsList[0].description).toBe('d1');
    });
  });
});
