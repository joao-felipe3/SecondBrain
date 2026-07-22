import { Test, TestingModule } from '@nestjs/testing';
import { DraftsAiService } from '../../../../../src/ai/services/tasks/drafts-ai.service';
import { GeminiService } from '../../../../../src/ai/services/core/gemini.service';
import { PromptBuilderService } from '../../../../../src/ai/services/projects/prompt-builder.service';

describe('DraftsAiService', () => {
  let service: DraftsAiService;
  let mockGeminiService: {
    generateContent: jest.Mock;
  };
  let mockPromptBuilderService: {
    buildMicroTasksPlannerPrompt: jest.Mock;
    buildMicroTasksPrompt: jest.Mock;
    buildMicroTasksGeneratorPrompt: jest.Mock;
  };

  beforeEach(async () => {
    mockGeminiService = {
      generateContent: jest.fn(),
    };

    mockPromptBuilderService = {
      buildMicroTasksPlannerPrompt: jest.fn().mockReturnValue('Planner Prompt'),
      buildMicroTasksPrompt: jest.fn().mockReturnValue('Single Pass Prompt'),
      buildMicroTasksGeneratorPrompt: jest.fn().mockReturnValue('Plan Pass Prompt'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DraftsAiService,
        { provide: GeminiService, useValue: mockGeminiService },
        { provide: PromptBuilderService, useValue: mockPromptBuilderService },
      ],
    }).compile();

    service = module.get<DraftsAiService>(DraftsAiService);
  });

  describe('generatePlan', () => {
    it('deve gerar plano de tarefas WBS via Gemini com sucesso', async () => {
      const jsonResponse = JSON.stringify({
        themes: [{ name: 'Auth' }],
        workflow: ['prepare', 'produce'],
      });

      mockGeminiService.generateContent.mockResolvedValue(jsonResponse);

      const result = await service.generatePlan({ leafName: 'Auth Module' } as any, ['Auth']);
      expect(result).toBeDefined();
      expect(result.workflow).toEqual(['prepare', 'produce']);
    });

    it('deve lancar erro se a resposta do plano for invalida', async () => {
      mockGeminiService.generateContent.mockResolvedValue(JSON.stringify({ invalid: true }));

      await expect(service.generatePlan({ leafName: 'Auth' } as any, [])).rejects.toThrow('Plano inválido');
    });
  });

  describe('generateSinglePassWithoutPlan', () => {
    it('deve gerar rascunhos de micro-tarefas sem plano', async () => {
      const jsonResponse = JSON.stringify([
        {
          name: 'Micro-tarefa 1',
          description: 'Descricao',
          definitionOfDone: 'DoD 1',
          checklist: ['Passo 1', 'Passo 2'],
          pomodorosPlanned: 2,
          priority: 1,
          difficult: 1,
          themeTag: 'Auth',
          contextTag: '@dev',
          microTaskType: 'subtask',
          cognitiveMode: 'medium',
        },
      ]);

      mockGeminiService.generateContent.mockResolvedValue(jsonResponse);

      const result = await service.generateSinglePassWithoutPlan(
        { leafName: 'Auth' } as any,
        [60],
        [],
      );

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Micro-tarefa 1');
    });

    it('deve lancar erro se a quantidade de itens devolvidos for diferente do esperado', async () => {
      const validDraft = {
        name: 'Micro-tarefa',
        description: 'Descricao',
        definitionOfDone: 'DoD 1',
        checklist: ['Passo 1', 'Passo 2'],
        pomodorosPlanned: 2,
        priority: 1,
        difficult: 1,
        themeTag: 'Auth',
        contextTag: '@dev',
        microTaskType: 'subtask',
        cognitiveMode: 'medium',
      };
      const jsonResponse = JSON.stringify([validDraft, validDraft]);
      mockGeminiService.generateContent.mockResolvedValue(jsonResponse);

      await expect(
        service.generateSinglePassWithoutPlan({ leafName: 'Auth' } as any, [60], []),
      ).rejects.toThrow('esperado 1');
    });
  });

  describe('generateSinglePassWithPlan', () => {
    it('deve gerar rascunhos de micro-tarefas com plano', async () => {
      const jsonResponse = JSON.stringify([
        {
          name: 'Micro-tarefa Com Plano',
          description: 'Descricao',
          definitionOfDone: 'DoD 1',
          checklist: ['Passo 1', 'Passo 2'],
          pomodorosPlanned: 2,
          priority: 1,
          difficult: 1,
          themeTag: 'Auth',
          contextTag: '@dev',
          microTaskType: 'subtask',
          cognitiveMode: 'medium',
        },
      ]);

      mockGeminiService.generateContent.mockResolvedValue(jsonResponse);

      const result = await service.generateSinglePassWithPlan(
        { leafName: 'Auth' } as any,
        [60],
        [],
      );

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Micro-tarefa Com Plano');
    });
  });
});
