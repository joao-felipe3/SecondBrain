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
    it('deve criar e retornar um novo alerta', async () => {
      const mockCreated = { _id: validAlertId, type: 'warning', message: 'Alerta de teste' };
      mockAlertModel.create.mockResolvedValue(mockCreated);

      const result = await service.createAlert({
        type: 'warning',
        message: 'Alerta de teste',
        taskId: new Types.ObjectId().toString(),
      });

      expect(result).toEqual(mockCreated);
      expect(mockAlertModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'warning',
          message: 'Alerta de teste',
          isRead: false,
        }),
      );
    });
  });

  describe('listAlerts', () => {
    it('deve listar alertas aplicando filtros e limite', async () => {
      const mockAlerts = [{ _id: validAlertId, isRead: false }];
      mockAlertModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            hint: jest.fn().mockReturnValue({
              exec: jest.fn().mockResolvedValue(mockAlerts),
            }),
          }),
        }),
      });

      const result = await service.listAlerts({ unreadOnly: true, limit: 10 });
      expect(result).toEqual(mockAlerts);
      expect(mockAlertModel.find).toHaveBeenCalledWith({ isRead: false });
    });
  });

  describe('markRead', () => {
    it('deve marcar alerta como lido', async () => {
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
  });
});
