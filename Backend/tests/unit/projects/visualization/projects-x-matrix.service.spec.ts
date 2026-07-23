import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ProjectsXMatrixService } from '../../../../src/projects/services/visualization/projects-x-matrix.service';
import { ProjectWave } from '../../../../src/projects/schemas/project-wave.schema';
import { XMatrixSnapshot } from '../../../../src/projects/schemas/x-matrix-snapshot.schema';

describe('ProjectsXMatrixService', () => {
  let service: ProjectsXMatrixService;
  let projectModelMock: any;
  let taskModelMock: any;
  let waveModelMock: any;
  let xMatrixSnapshotModelMock: any;

  const validObjectId = '507f1f77bcf86cd799439011';

  beforeEach(async () => {
    projectModelMock = {
      findById: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: validObjectId,
          name: 'Projeto 1',
          wbsTree: [{ name: 'Fase 1', children: [] }],
        }),
      }),
      updateOne: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({}),
      }),
    };

    taskModelMock = {
      find: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue([
          { _id: 't-1', name: 'Task 1', isConcluded: false },
        ]),
      }),
    };

    waveModelMock = {
      find: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([
            { waveNumber: 1, taskIds: ['t-1'] },
          ]),
        }),
      }),
    };

    xMatrixSnapshotModelMock = {
      updateOne: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({}),
      }),
      findOne: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          data: { projectId: validObjectId, projectName: 'Projeto 1' },
        }),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectsXMatrixService,
        { provide: getModelToken('Project'), useValue: projectModelMock },
        { provide: getModelToken('Task'), useValue: taskModelMock },
        { provide: getModelToken(ProjectWave.name), useValue: waveModelMock },
        { provide: getModelToken(XMatrixSnapshot.name), useValue: xMatrixSnapshotModelMock },
      ],
    }).compile();

    service = module.get<ProjectsXMatrixService>(ProjectsXMatrixService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createXMatrix', () => {
    it('deve lançar BadRequestException para ID de projeto inválido', async () => {
      await expect(service.createXMatrix('invalid', {})).rejects.toThrow(BadRequestException);
    });

    it('deve lançar NotFoundException se o projeto não existir', async () => {
      projectModelMock.findById.mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(null) });
      await expect(service.createXMatrix(validObjectId, {})).rejects.toThrow(NotFoundException);
    });

    it('deve gerar e salvar snapshot do XMatrix', async () => {
      const result = await service.createXMatrix(validObjectId, { includeCompleted: true });

      expect(result).toBeDefined();
      expect(result.projectId).toBe(validObjectId);
      expect(xMatrixSnapshotModelMock.updateOne).toHaveBeenCalled();
    });
  });

  describe('getSavedXMatrix', () => {
    it('deve retornar snapshot salvo se existir', async () => {
      const result = await service.getSavedXMatrix(validObjectId);

      expect(result).toBeDefined();
      expect(result?.projectId).toBe(validObjectId);
    });
  });
});
