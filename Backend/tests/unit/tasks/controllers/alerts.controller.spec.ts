import { Test, TestingModule } from '@nestjs/testing';
import { AlertsController } from '../../../../src/tasks/controllers/alerts.controller';
import { AlertsService } from '../../../../src/tasks/services/monitoring/alerts.service';

describe('AlertsController', () => {
  let controller: AlertsController;
  let service: AlertsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AlertsController],
      providers: [
        {
          provide: AlertsService,
          useValue: {
            listAlerts: jest.fn().mockResolvedValue([{ id: 'alert-1', message: 'Alerta teste' }]),
            markRead: jest.fn().mockResolvedValue({ id: 'alert-1', isRead: true }),
          },
        },
      ],
    }).compile();

    controller = module.get<AlertsController>(AlertsController);
    service = module.get<AlertsService>(AlertsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('listAlerts', () => {
    it('deve listar alertas com parâmetros passados', async () => {
      const result = await controller.listAlerts('user-1', 'true', 'proj-1');

      expect(result).toEqual([{ id: 'alert-1', message: 'Alerta teste' }]);
      expect(service.listAlerts).toHaveBeenCalledWith({
        userId: 'user-1',
        unreadOnly: true,
        projectId: 'proj-1',
        limit: 50,
      });
    });

    it('deve tratar unread undefined como false', async () => {
      await controller.listAlerts(undefined, undefined, undefined);

      expect(service.listAlerts).toHaveBeenCalledWith({
        userId: undefined,
        unreadOnly: false,
        projectId: undefined,
        limit: 50,
      });
    });
  });

  describe('markRead', () => {
    it('deve marcar alerta como lido', async () => {
      const result = await controller.markRead('alert-1', 'user-1');

      expect(result).toEqual({ id: 'alert-1', isRead: true });
      expect(service.markRead).toHaveBeenCalledWith('alert-1', 'user-1');
    });
  });
});
