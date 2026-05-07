import { Controller, Get, Patch, Post, Body, Param } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { Settings } from './settings.schema';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('settings')
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get(':userId')
  @ApiOperation({ summary: 'Get user settings' })
  async getSettings(@Param('userId') userId: string): Promise<Settings> {
    return this.settingsService.getSettings(userId);
  }

  @Patch(':userId')
  @ApiOperation({ summary: 'Update user settings' })
  async updateSettings(
    @Param('userId') userId: string,
    @Body() updateDto: UpdateSettingsDto,
  ): Promise<Settings> {
    return this.settingsService.updateSettings(userId, updateDto);
  }

  @Post(':userId/toggle-silence-notifications')
  @ApiOperation({ summary: 'Toggle silence notifications' })
  async toggleSilenceNotifications(@Param('userId') userId: string): Promise<Settings> {
    return this.settingsService.toggleSilenceNotifications(userId);
  }
}
