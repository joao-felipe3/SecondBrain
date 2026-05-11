import { Controller, Get, Patch, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AlertsService } from '../services/alerts.service';

@ApiTags('alerts')
@Controller('alerts')
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Get()
  @ApiOperation({ summary: 'List alerts (optionally unread only)' })
  @ApiResponse({ status: 200, description: 'Alerts returned.' })
  async listAlerts(
    @Query('userId') userId?: string,
    @Query('unread') unread?: string,
    @Query('projectId') projectId?: string,
  ) {
    const unreadOnly = String(unread || '').toLowerCase() === 'true';
    return this.alertsService.listAlerts({
      userId,
      unreadOnly,
      projectId,
      limit: 50,
    });
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark alert as read' })
  @ApiResponse({ status: 200, description: 'Alert marked as read.' })
  async markRead(@Param('id') id: string, @Query('userId') userId?: string) {
    return this.alertsService.markRead(id, userId);
  }
}
