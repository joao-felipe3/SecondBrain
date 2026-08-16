import { Types } from 'mongoose';
import { ProjectsPlanningController } from '@src/projects/controllers/projects-planning.controller';

describe('ProjectsPlanningController', () => {
  let controller: ProjectsPlanningController;
  let mockProjectsService: any;
  let mockPlanningService: any;

  const validProjId = new Types.ObjectId().toHexString();

  beforeEach(() => {
    mockProjectsService = {
      findOne: jest.fn().mockResolvedValue({ _id: validProjId, name: 'Proj 1' }),
      update: jest.fn().mockResolvedValue({ _id: validProjId }),
    };

    mockPlanningService = {
      startCatchball: jest.fn().mockResolvedValue({ questions: [] }),
      suggestAnswer: jest.fn().mockResolvedValue('Suggested answer text'),
      generateSmartObjective: jest.fn().mockResolvedValue({ specific: 'Build' }),
    };

    controller = new ProjectsPlanningController(mockProjectsService, mockPlanningService);
  });

  it('should start Catchball planning with AI', async () => {
    const res = await controller.planProjectWithAI(validProjId, {} as any);
    expect(res).toBeDefined();
    expect(mockPlanningService.startCatchball).toHaveBeenCalled();
  });

  it('should suggest answer for Catchball question', async () => {
    const res = await controller.suggestAnswer(validProjId, {} as any);
    expect(res.suggestedAnswer).toBe('Suggested answer text');
  });

  it('should refine objective into SMART format', async () => {
    const res = await controller.refineObjective(validProjId, {} as any);
    expect(res.nextPhase).toBe('wbs-generation');
    expect(mockProjectsService.update).toHaveBeenCalled();
  });
});
