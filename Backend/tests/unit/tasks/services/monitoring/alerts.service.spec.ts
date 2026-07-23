import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { AlertsService } from '../../../../../src/tasks/services/monitoring/alerts.service';
import { Types } from 'mongoose';

describe('AlertsService', () => {
  let service: AlertsService;
  let mockAlertModel: any;

  beforeEach(async () => {
    mockAlertModel = {
      create: jest.fn().mockImplementation((payload) => Promise.resolve({ ...payload, _id: 'alert-1' })),
      find: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            hint: jest.fn().mockReturnValue({
              exec: jest.fn().mockResolvedValue([{ _id: 'alert-1', message: 'Teste' }]),
            }),
          }),
        }),
      }),
      findOneAndUpdate: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({ _id: 'alert-1', isRead: true }),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlertsService,
        {
          provide: getModelToken('TaskAlert'),
          useValue: mockAlertModel,
        },
      ],
    }).compile();

    service = module.get<AlertsService>(AlertsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createAlert', () => {
    it('deve criar um alerta com sucesso', async () => {
      const taskId = new Types.ObjectId();
      const projectId = new Types.ObjectId();

      const result = await service.createAlert({
        userId: 'user-1',
        taskId: taskId.toString(),
        projectId: projectId.toString(),
        type: 'warning',
        message: 'Aviso de atraso',
        recommendation: 'Ajustar prazo',
      });

      expect(result).toBeDefined();
      expect(mockAlertModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          type: 'warning',
          message: 'Aviso de atraso',
          recommendation: 'Ajustar prazo',
          isRead: false,
        }),
      );
    });
  });

  describe('listAlerts', () => {
    it('deve listar alertas aplicandos filtros e paginação', async () => {
      const result = await service.listAlerts({
        userId: 'user-1',
        unreadOnly: true,
        projectId: 'proj-1',
        limit: 10,
      });

      expect(result).toHaveLength(1);
      expect(mockAlertModel.find).toHaveBeenCalledWith({
        userId: 'user-1',
        project: 'proj-1',
        isRead: false,
      });
    });
  });

  describe('markRead', () => {
    it('deve marcar um alerta como lido', async () => {
      const result = await service.markRead('alert-1', 'user-1');

      expect(result).toEqual({ _id: 'alert-1', isRead: true });
      expect(mockAlertModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'alert-1', userId: 'user-1' },
        { isRead: true },
        { new: true },
      );
    });
  });
});
