import { Test, TestingModule } from '@nestjs/testing';
import { PromptBuilderService } from '../../../../../src/ai/services/projects/prompt-builder.service';

describe('PromptBuilderService', () => {
  let service: PromptBuilderService;

  const mockParams = {
    project: { name: 'Projeto Teste' },
    node: { name: 'Node WBS', estimatedHours: 10 },
    currentPath: '1.1',
    level: 2,
    chunkMinutes: [60, 60],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PromptBuilderService],
    }).compile();

    service = module.get<PromptBuilderService>(PromptBuilderService);
  });

  it('deve construir prompt de outline de micro-tarefas', () => {
    const prompt = service.buildMicroTasksOutlinePrompt(mockParams as any);
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
  });

  it('deve construir prompt de outline com plano', () => {
    const prompt = service.buildMicroTasksOutlineWithPlanPrompt({
      ...mockParams,
      plan: { workflow: ['prepare', 'produce'] },
    } as any);
    expect(typeof prompt).toBe('string');
  });

  it('deve construir prompt de detalhes de micro-tarefa', () => {
    const prompt = service.buildMicroTaskDetailsPrompt({
      ...mockParams,
      targetMinutes: 60,
      outline: { name: 'Micro Task 1' },
    } as any);
    expect(typeof prompt).toBe('string');
  });

  it('deve construir prompt de lote de detalhes', () => {
    const prompt = service.buildMicroTaskDetailsBatchPrompt({
      ...mockParams,
      items: [{ targetMinutes: 60, outline: { name: 'Task 1' } }],
    } as any);
    expect(typeof prompt).toBe('string');
  });

  it('deve construir prompt de geracao de micro-tarefas', () => {
    const prompt = service.buildMicroTasksPrompt(mockParams as any);
    expect(typeof prompt).toBe('string');
  });

  it('deve construir prompt de planejador de micro-tarefas', () => {
    const prompt = service.buildMicroTasksPlannerPrompt(mockParams as any);
    expect(typeof prompt).toBe('string');
  });

  it('deve construir prompt de gerador com plano de micro-tarefas', () => {
    const prompt = service.buildMicroTasksGeneratorPrompt({
      ...mockParams,
      plan: { workflow: ['prepare'] },
    } as any);
    expect(typeof prompt).toBe('string');
  });
});
