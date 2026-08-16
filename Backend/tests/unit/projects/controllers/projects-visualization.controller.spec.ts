import { Types } from 'mongoose';
import { ProjectsVisualizationController } from '@src/projects/controllers/projects-visualization.controller';

describe('ProjectsVisualizationController', () => {
  let controller: ProjectsVisualizationController;
  let mockGanttService: any;
  let mockPertDiagramService: any;
  let mockXMatrixService: any;

  const validProjId = new Types.ObjectId().toHexString();

  beforeEach(() => {
    mockGanttService = {
      getGanttData: jest.fn().mockResolvedValue({ tasks: [] }),
    };

    mockPertDiagramService = {
      getPertDiagramData: jest.fn().mockResolvedValue({ nodes: [], edges: [] }),
    };

    mockXMatrixService = {
      createXMatrix: jest.fn().mockResolvedValue({ projectId: validProjId }),
      getSavedXMatrix: jest.fn().mockResolvedValue({ projectId: validProjId }),
    };

    controller = new ProjectsVisualizationController(
      mockGanttService,
      mockPertDiagramService,
      mockXMatrixService,
    );
  });

  it('should get Gantt data', async () => {
    const res = await controller.getGanttData(validProjId, 'true');
    expect(res).toBeDefined();
    expect(mockGanttService.getGanttData).toHaveBeenCalledWith(validProjId, { includeCompleted: true });
  });

  it('should get PERT diagram data', async () => {
    const res = await controller.getPertDiagramData(validProjId, 'false');
    expect(res).toBeDefined();
    expect(mockPertDiagramService.getPertDiagramData).toHaveBeenCalledWith(validProjId, {
      includeCompleted: false,
    });
  });

  it('should create and fetch X-Matrix snapshot', async () => {
    const created = await controller.createXMatrix(validProjId, {});
    expect(created.projectId).toBe(validProjId);

    const fetched = await controller.getSavedXMatrix(validProjId);
    expect(fetched?.projectId).toBe(validProjId);
  });
});
