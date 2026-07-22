import { Test, TestingModule } from '@nestjs/testing';
import { DraftProcessingService } from '../../../../../src/projects/services/drafts/draft-processing.service';

describe('DraftProcessingService', () => {
  let service: DraftProcessingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DraftProcessingService],
    }).compile();

    service = module.get<DraftProcessingService>(DraftProcessingService);
  });

  describe('validatePlannerPlan', () => {
    it('deve validar um plano do planner com sucesso', () => {
      const plan = {
        themes: [{ name: 'Auth' }],
        workflow: ['prepare', 'produce'],
      };

      const result = service.validatePlannerPlan(plan);
      expect(result).toBeDefined();
      expect(result.workflow).toHaveLength(2);
    });

    it('deve lancar erro para plano do planner invalido', () => {
      const invalidPlan = { leafTasks: 'invalid' };
      expect(() => service.validatePlannerPlan(invalidPlan)).toThrow('Plano inválido');
    });
  });

  describe('validateDrafts', () => {
    it('deve validar drafts de micro-tarefas com sucesso', () => {
      const drafts = [
        {
          name: 'Micro-tarefa 1',
          description: 'Descricao da tarefa',
          definitionOfDone: 'Feature completa',
          checklist: ['Passo 1', 'Passo 2'],
          pomodorosPlanned: 2,
          priority: 1,
          difficult: 1,
          themeTag: 'Auth',
          contextTag: '@dev',
          microTaskType: 'subtask',
          cognitiveMode: 'medium',
        },
      ];

      const result = service.validateDrafts(drafts);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Micro-tarefa 1');
    });

    it('deve lancar erro para drafts invalidos', () => {
      const invalidDrafts = [{ invalidKey: 123 }];
      expect(() => service.validateDrafts(invalidDrafts)).toThrow('Drafts inválidos');
    });
  });

  describe('applyThemeWorkflowAndProgression', () => {
    it('deve agrupar drafts por tema e aplicar workflow e modos cognitivos progressivos', () => {
      const drafts = [
        { name: 'Task A1', themeTag: 'Auth' },
        { name: 'Task A2', themeTag: 'Auth' },
        { name: 'Task A3', themeTag: 'Auth' },
      ];

      const processed = service.applyThemeWorkflowAndProgression(drafts as any);
      expect(processed).toHaveLength(3);
      expect(processed[0].microTaskType).toBe('prepare');
      expect(processed[1].microTaskType).toBe('practice');
      expect(processed[2].microTaskType).toBe('produce');
    });
  });

  describe('applyGoldilocksAndMilestones', () => {
    it('deve normalizar drafts e atribuir milestones para blocos maiores', () => {
      const drafts = [
        { name: 'Draft 1', description: 'Passo 1' },
        { name: 'Draft 2', description: 'Passo 2' },
      ];
      const chunkMinutes = [180, 180]; // Total 360m (> 240m)

      const processed = service.applyGoldilocksAndMilestones(drafts as any, chunkMinutes);
      expect(processed).toHaveLength(2);
      expect(processed[0].milestoneIndex).toBeDefined();
    });
  });
});
