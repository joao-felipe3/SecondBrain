import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Settings } from './settings.schema';
import { UpdateSettingsDto } from './dto/update-settings.dto';

@Injectable()
export class SettingsService {
  constructor(@InjectModel(Settings.name) private settingsModel: Model<Settings>) {}

  async getSettings(userId: string): Promise<Settings> {
    let settings = await this.settingsModel.findOne({ userId });
    if (!settings) {
      settings = await this.settingsModel.create({
        userId,
        silenceNotifications: false,
        darkMode: false,
        soundEnabled: true,
        notificationTimeBeforeDueMinutes: 10,
      });
    }
    return settings;
  }

  async updateSettings(userId: string, updateDto: UpdateSettingsDto): Promise<Settings> {
    const settings = await this.settingsModel.findOneAndUpdate(
      { userId },
      updateDto,
      { new: true, upsert: true },
    );
    return settings;
  }

  async toggleSilenceNotifications(userId: string): Promise<Settings> {
    const current = await this.getSettings(userId);
    return this.updateSettings(userId, {
      silenceNotifications: !current.silenceNotifications,
    });
  }

  async isSilenced(userId: string): Promise<boolean> {
    const settings = await this.getSettings(userId);
    return settings.silenceNotifications;
  }
}
