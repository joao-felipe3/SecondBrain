import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { AlertsService } from '../../../../../src/tasks/services/monitoring/alerts.service';

describe('AlertsService', () => {
  let service: AlertsService;
  let mockAlertModel: {
    create: jest.Mock;
    find: jest.Mock;
    findOneAndUpdate: jest.Mock;
  };

  const validAlertId = new Types.ObjectId().toString();

  beforeEach(async () => {
    mockAlertModel = {
      create: jest.fn(),
      find: jest.fn(),
      findOneAndUpdate: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [AlertsService, { provide: getModelToken('TaskAlert'), useValue: mockAlertModel }],
    }).compile();

    service = module.get<AlertsService>(AlertsService);
  });

  describe('createAlert', () => {
    it('deve criar alerta com taskId e projectId definidos', async () => {
      const mockCreated = { _id: validAlertId, type: 'warning', message: 'Alerta com task e projeto' };
      mockAlertModel.create.mockResolvedValue(mockCreated);

      const taskId = new Types.ObjectId().toString();
      const projectId = new Types.ObjectId().toString();

      const result = await service.createAlert({
        type: 'warning',
        message: 'Alerta com task e projeto',
        taskId,
        projectId,
        userId: 'user-123',
        recommendation: 'Revisar cronograma',
      });

      expect(result).toEqual(mockCreated);
      expect(mockAlertModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'warning',
          message: 'Alerta com task e projeto',
          task: expect.any(Types.ObjectId),
          project: expect.any(Types.ObjectId),
          recommendation: 'Revisar cronograma',
          isRead: false,
        }),
      );
    });

    it('deve criar alerta sem taskId e sem projectId (ambos undefined)', async () => {
      const mockCreated = { _id: validAlertId, type: 'info', message: 'Alerta geral' };
      mockAlertModel.create.mockResolvedValue(mockCreated);

      const result = await service.createAlert({
        type: 'info',
        message: 'Alerta geral',
      });

      expect(result).toEqual(mockCreated);
      expect(mockAlertModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'info',
          message: 'Alerta geral',
          task: undefined,
          project: undefined,
          isRead: false,
        }),
      );
    });
  });

  describe('listAlerts', () => {
    it('deve listar alertas aplicando todos os filtros (userId, projectId, unreadOnly) e limite customizado', async () => {
      const mockAlerts = [{ _id: validAlertId, isRead: false }];
      const mockChain = {
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        hint: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockAlerts),
      };
      mockAlertModel.find.mockReturnValue(mockChain);

      const result = await service.listAlerts({
        userId: 'user-1',
        projectId: 'project-1',
        unreadOnly: true,
        limit: 10,
      });

      expect(result).toEqual(mockAlerts);
      expect(mockAlertModel.find).toHaveBeenCalledWith({
        userId: 'user-1',
        project: 'project-1',
        isRead: false,
      });
      expect(mockChain.limit).toHaveBeenCalledWith(10);
    });

    it('deve listar alertas com opções padrão (sem parâmetros) usando limit 50', async () => {
      const mockAlerts: any[] = [];
      const mockChain = {
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        hint: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockAlerts),
      };
      mockAlertModel.find.mockReturnValue(mockChain);

      const result = await service.listAlerts();

      expect(result).toEqual(mockAlerts);
      expect(mockAlertModel.find).toHaveBeenCalledWith({});
      expect(mockChain.limit).toHaveBeenCalledWith(50);
    });

    it('deve aplicar limit 50 se limit não for finito', async () => {
      const mockAlerts: any[] = [];
      const mockChain = {
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        hint: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockAlerts),
      };
      mockAlertModel.find.mockReturnValue(mockChain);

      await service.listAlerts({ limit: NaN });
      expect(mockChain.limit).toHaveBeenCalledWith(50);
    });
  });

  describe('markRead', () => {
    it('deve marcar alerta como lido com filtro de userId', async () => {
      const mockAlert = { _id: validAlertId, isRead: true };
      mockAlertModel.findOneAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockAlert),
      });

      const result = await service.markRead(validAlertId, 'user-1');
      expect(result).toEqual(mockAlert);
      expect(mockAlertModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: validAlertId, userId: 'user-1' },
        { isRead: true },
        { new: true },
      );
    });

    it('deve marcar alerta como lido sem informar userId', async () => {
      const mockAlert = { _id: validAlertId, isRead: true };
      mockAlertModel.findOneAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockAlert),
      });

      const result = await service.markRead(validAlertId);
      expect(result).toEqual(mockAlert);
      expect(mockAlertModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: validAlertId },
        { isRead: true },
        { new: true },
      );
    });
  });
});
