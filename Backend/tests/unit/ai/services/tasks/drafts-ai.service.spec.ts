import { Test, TestingModule } from '@nestjs/testing';
import { DraftsAiService } from '../../../../../src/ai/services/tasks/drafts-ai.service';
import { GeminiService } from '../../../../../src/ai/services/core/gemini.service';
import { PromptBuilderService } from '../../../../../src/ai/services/projects/prompt-builder.service';

describe('DraftsAiService', () => {
  let service: DraftsAiService;
  let geminiServiceMock: any;
  let promptBuilderMock: any;

  beforeEach(async () => {
    geminiServiceMock = {
      generateContent: jest.fn().mockResolvedValue(
        JSON.stringify({
          themes: [{ name: 'Autenticação', description: 'Desc' }],
          workflow: ['prepare', 'execute'],
        }),
      ),
    };

    promptBuilderMock = {
      buildMicroTasksPlannerPrompt: jest.fn().mockReturnValue('Planner Prompt'),
      buildMicroTasksPrompt: jest.fn().mockReturnValue('MicroTasks Prompt'),
      buildMicroTasksOutlinesPrompt: jest.fn().mockReturnValue('Outlines Prompt'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DraftsAiService,
        { provide: GeminiService, useValue: geminiServiceMock },
        { provide: PromptBuilderService, useValue: promptBuilderMock },
      ],
    }).compile();

    service = module.get<DraftsAiService>(DraftsAiService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generatePlan', () => {
    it('deve gerar plano estruturado via prompt da IA', async () => {
      const params: any = {
        project: { name: 'P1' },
        node: { name: 'N1' },
      };

      const plan = await service.generatePlan(params, ['Auth']);

      expect(plan).toBeDefined();
      expect(plan.themes).toHaveLength(1);
      expect(geminiServiceMock.generateContent).toHaveBeenCalled();
    });
  });
});
