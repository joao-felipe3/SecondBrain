import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ProjectStatsService } from '../../../../src/projects/services/execution/project-stats.service';
import { Types } from 'mongoose';

describe('ProjectStatsService', () => {
  let service: ProjectStatsService;
  let mockProjectModel: any;
  let mockTaskModel: any;

  const validProjectId = new Types.ObjectId().toString();

  beforeEach(async () => {
    mockProjectModel = {
      findById: jest.fn(),
    };

    mockTaskModel = {
      find: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue([
          { pomodorosPlanned: 4, experience: 20, prize: 10 },
          { pomodorosPlanned: 2, experience: 10, prize: 5 },
        ]),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectStatsService,
        { provide: getModelToken('Project'), useValue: mockProjectModel },
        { provide: getModelToken('Task'), useValue: mockTaskModel },
      ],
    }).compile();

    service = module.get<ProjectStatsService>(ProjectStatsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('recalculateProjectStats', () => {
    it('deve retornar null para ID de projeto inválido', async () => {
      const result = await service.recalculateProjectStats('invalid-id');
      expect(result).toBeNull();
    });

    it('deve retornar null se projeto não for encontrado', async () => {
      mockProjectModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });

      const result = await service.recalculateProjectStats(validProjectId);
      expect(result).toBeNull();
    });

    it('deve recalcular estatísticas do projeto e salvar', async () => {
      const mockProject = {
        _id: validProjectId,
        plannedHours: 0,
        experience: 0,
        reward: 0,
        totalHoursWorked: 1.5,
        progressPercentage: 0,
        save: jest.fn().mockImplementation(function (this: any) {
          return Promise.resolve(this);
        }),
      };

      mockProjectModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockProject),
      });

      const result = await service.recalculateProjectStats(validProjectId);

      expect(result).not.toBeNull();
      expect(result?.plannedHours).toBe(3); // (4 + 2) * 0.5 = 3h
      expect(result?.experience).toBe(30); // 20 + 10 = 30
      expect(result?.reward).toBe(15); // 10 + 5 = 15
      expect(result?.progressPercentage).toBe(50); // 1.5h / 3h * 100 = 50%
      expect(mockProject.save).toHaveBeenCalled();
    });

    it('deve definir progressPercentage como 0 quando plannedHours for 0', async () => {
      mockTaskModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue([]),
      });

      const mockProject = {
        _id: validProjectId,
        plannedHours: 0,
        totalHoursWorked: 0,
        save: jest.fn().mockImplementation(function (this: any) {
          return Promise.resolve(this);
        }),
      };

      mockProjectModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockProject),
      });

      const result = await service.recalculateProjectStats(validProjectId);

      expect(result?.progressPercentage).toBe(0);
    });
  });
});
