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
      buildMicroTasksPlannerPrompt: jest.fn().mockReturnValue('planner-prompt'),
      buildMicroTasksPrompt: jest.fn().mockReturnValue('microtasks-prompt'),
      buildMicroTasksGeneratorPrompt: jest.fn().mockReturnValue('generator-prompt'),
      buildMicroTasksOutlinePrompt: jest.fn().mockReturnValue('outline-prompt'),
      buildMicroTasksOutlineWithPlanPrompt: jest.fn().mockReturnValue('outline-plan-prompt'),
      buildMicroTaskDetailsPrompt: jest.fn().mockReturnValue('details-prompt'),
      buildMicroTaskDetailsBatchPrompt: jest.fn().mockReturnValue('batch-prompt'),
    };

    service = new DraftsAiService(mockGeminiService, mockPromptBuilder);
  });

  describe('generatePlan', () => {
    it('should generate and parse WBS leaf plan from AI response', async () => {
      mockGeminiService.generateContent.mockResolvedValueOnce(
        JSON.stringify({
          themes: [{ name: 'Core feature' }],
          workflow: ['Design', 'Code'],
        }),
      );

      const plan = await service.generatePlan({ node: { name: 'Leaf 1' } } as any, ['tech']);
      expect(plan.themes[0].name).toBe('Core feature');
    });

    it('should throw error if plan JSON violates schema', async () => {
      mockGeminiService.generateContent.mockResolvedValueOnce(
        JSON.stringify({ invalidField: 123 }),
      );

      await expect(
        service.generatePlan({ node: { name: 'Leaf 1' } } as any, []),
      ).rejects.toThrow('Plano inválido');
    });
  });

  describe('generateSinglePassWithoutPlan & generateDetailsBatch', () => {
    it('should generate single pass microtask drafts', async () => {
      mockGeminiService.generateContent.mockResolvedValue(
        JSON.stringify([
          {
            name: 'Task 1',
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
      expect(drafts[0].name).toBe('Task 1');
    });
  });
});
