import { Test, TestingModule } from '@nestjs/testing';
import { SettingsController } from '../../../src/settings/settings.controller';
import { SettingsService } from '../../../src/settings/settings.service';
import { UpdateSettingsDto } from '../../../src/settings/dto/update-settings.dto';

describe('SettingsController', () => {
  let controller: SettingsController;
  let service: SettingsService;

  const mockSettings = {
    userId: 'user-123',
    silenceNotifications: false,
    darkMode: false,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SettingsController],
      providers: [
        {
          provide: SettingsService,
          useValue: {
            getSettings: jest.fn().mockResolvedValue(mockSettings),
            updateSettings: jest.fn().mockResolvedValue({ ...mockSettings, darkMode: true }),
            toggleSilenceNotifications: jest
              .fn()
              .mockResolvedValue({ ...mockSettings, silenceNotifications: true }),
          },
        },
      ],
    }).compile();

    controller = module.get<SettingsController>(SettingsController);
    service = module.get<SettingsService>(SettingsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getSettings', () => {
    it('deve retornar as configurações do usuário', async () => {
      const result = await controller.getSettings('user-123');
      expect(result).toEqual(mockSettings);
      expect(service.getSettings).toHaveBeenCalledWith('user-123');
    });
  });

  describe('updateSettings', () => {
    it('deve atualizar as configurações do usuário', async () => {
      const updateDto: UpdateSettingsDto = { darkMode: true } as any;
      const result = await controller.updateSettings('user-123', updateDto);
      expect(result.darkMode).toBe(true);
      expect(service.updateSettings).toHaveBeenCalledWith('user-123', updateDto);
    });
  });

  describe('toggleSilenceNotifications', () => {
    it('deve alternar a notificação de silêncio', async () => {
      const result = await controller.toggleSilenceNotifications('user-123');
      expect(result.silenceNotifications).toBe(true);
      expect(service.toggleSilenceNotifications).toHaveBeenCalledWith('user-123');
    });
  });
});
