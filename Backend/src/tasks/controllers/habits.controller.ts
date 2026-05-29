import { Controller, Get, Query } from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { GetHabitsDashboardDto } from '../dto/get-habits-dashboard.dto'
import { TasksService } from '../tasks.service'

@ApiTags('habits')
@Controller('habits')
export class HabitsController {
  constructor(private readonly tasksService: TasksService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Retorna dashboard de hábitos e streaks' })
  @ApiResponse({ status: 200, description: 'Dashboard retornado com sucesso.' })
  async getHabitsDashboard(@Query() query: GetHabitsDashboardDto) {
    return this.tasksService.getHabitsDashboard(query)
  }
}