import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { SettingsService } from '../../../src/settings/settings.service';
import { Settings } from '../../../src/settings/settings.schema';

describe('SettingsService', () => {
  let service: SettingsService;
  let mockModel: {
    findOne: jest.Mock;
    create: jest.Mock;
    findOneAndUpdate: jest.Mock;
  };

  beforeEach(async () => {
    mockModel = {
      findOne: jest.fn(),
      create: jest.fn(),
      findOneAndUpdate: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SettingsService,
        {
          provide: getModelToken(Settings.name),
          useValue: mockModel,
        },
      ],
    }).compile();

    service = module.get<SettingsService>(SettingsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getSettings', () => {
    it('should return existing settings', async () => {
      const userId = 'test-user';
      const existingSettings = {
        userId,
        silenceNotifications: true,
        darkMode: false,
        soundEnabled: false,
        notificationTimeBeforeDueMinutes: 20,
      };

      mockModel.findOne.mockResolvedValue(existingSettings);

      const result = await service.getSettings(userId);
      expect(result).toEqual(existingSettings);
      expect(mockModel.findOne).toHaveBeenCalledWith({ userId });
    });

    it('should create default settings if not found', async () => {
      const userId = 'new-user';
      const defaultSettings = {
        userId,
        silenceNotifications: false,
        darkMode: false,
        soundEnabled: true,
        notificationTimeBeforeDueMinutes: 10,
      };

      mockModel.findOne.mockResolvedValue(null);
      mockModel.create.mockResolvedValue(defaultSettings);

      const result = await service.getSettings(userId);
      expect(result).toEqual(defaultSettings);
      expect(mockModel.create).toHaveBeenCalled();
    });
  });

  describe('updateSettings', () => {
    it('should update settings with upsert', async () => {
      const userId = 'test-user';
      const updateDto = { silenceNotifications: true };
      const updatedSettings = {
        userId,
        silenceNotifications: true,
        darkMode: false,
        soundEnabled: true,
        notificationTimeBeforeDueMinutes: 10,
      };

      mockModel.findOneAndUpdate.mockResolvedValue(updatedSettings);

      const result = await service.updateSettings(userId, updateDto);
      expect(result).toEqual(updatedSettings);
      expect(mockModel.findOneAndUpdate).toHaveBeenCalledWith({ userId }, updateDto, {
        new: true,
        upsert: true,
      });
    });

    it('should update multiple settings fields', async () => {
      const userId = 'test-user';
      const updateDto = {
        silenceNotifications: true,
        darkMode: true,
        soundEnabled: false,
        notificationTimeBeforeDueMinutes: 30,
      };
      const updatedSettings = { userId, ...updateDto };

      mockModel.findOneAndUpdate.mockResolvedValue(updatedSettings);

      const result = await service.updateSettings(userId, updateDto);
      expect(result).toEqual(updatedSettings);
    });
  });

  describe('toggleSilenceNotifications', () => {
    it('should toggle silence notifications from false to true', async () => {
      const userId = 'test-user';
      const currentSettings = {
        userId,
        silenceNotifications: false,
        darkMode: false,
        soundEnabled: true,
        notificationTimeBeforeDueMinutes: 10,
      };
      const toggledSettings = {
        ...currentSettings,
        silenceNotifications: true,
      };

      mockModel.findOne.mockResolvedValue(currentSettings);
      mockModel.findOneAndUpdate.mockResolvedValue(toggledSettings);

      const result = await service.toggleSilenceNotifications(userId);
      expect(result.silenceNotifications).toBe(true);
    });

    it('should toggle silence notifications from true to false', async () => {
      const userId = 'test-user';
      const currentSettings = {
        userId,
        silenceNotifications: true,
        darkMode: false,
        soundEnabled: false,
        notificationTimeBeforeDueMinutes: 10,
      };
      const toggledSettings = {
        ...currentSettings,
        silenceNotifications: false,
      };

      mockModel.findOne.mockResolvedValue(currentSettings);
      mockModel.findOneAndUpdate.mockResolvedValue(toggledSettings);

      const result = await service.toggleSilenceNotifications(userId);
      expect(result.silenceNotifications).toBe(false);
    });
  });

  describe('isSilenced', () => {
    it('should return true if notifications are silenced', async () => {
      const userId = 'test-user';
      const settings = {
        userId,
        silenceNotifications: true,
        darkMode: false,
        soundEnabled: false,
        notificationTimeBeforeDueMinutes: 10,
      };

      mockModel.findOne.mockResolvedValue(settings);

      const result = await service.isSilenced(userId);
      expect(result).toBe(true);
    });

    it('should return false if notifications are not silenced', async () => {
      const userId = 'test-user';
      const settings = {
        userId,
        silenceNotifications: false,
        darkMode: false,
        soundEnabled: true,
        notificationTimeBeforeDueMinutes: 10,
      };

      mockModel.findOne.mockResolvedValue(settings);

      const result = await service.isSilenced(userId);
      expect(result).toBe(false);
    });
  });
});
