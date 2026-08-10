import { Controller, Post, Param, Body, NotFoundException } from '@nestjs/common';
import { ProjectsService } from '../projects.service';
import { PlanningService } from '../services/strategy';
import { CatchballRequestDto, RefineObjectiveDto, SuggestAnswerDto } from '../dto/smart-objective.dto';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('projects')
@Controller('projects')
export class ProjectsPlanningController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly planningService: PlanningService,
  ) {}

  @Post(':id/plan-with-ai')
  @ApiOperation({
    summary: 'Start AI-assisted project planning with Catchball',
  })
  @ApiResponse({ status: 200, description: 'Catchball questions generated.' })
  async planProjectWithAI(@Param('id') id: string, @Body() dto: CatchballRequestDto) {
    const project = await this.projectsService.findOne(id);
    if (!project) throw new NotFoundException('Project not found');

    return this.planningService.startCatchball(dto);
  }

  @Post(':id/suggest-answer')
  @ApiOperation({
    summary: 'Generate suggested answer for a Catchball question',
  })
  @ApiResponse({ status: 200, description: 'Suggested answer generated.' })
  async suggestAnswer(@Param('id') id: string, @Body() dto: SuggestAnswerDto) {
    const project = await this.projectsService.findOne(id);
    if (!project) throw new NotFoundException('Project not found');

    const suggestedAnswer = await this.planningService.suggestAnswer(dto);

    return { suggestedAnswer };
  }

  @Post(':id/refine-objective')
  @ApiOperation({ summary: 'Generate SMART objectives from Catchball answers' })
  @ApiResponse({ status: 200, description: 'SMART objectives generated.' })
  async refineObjective(@Param('id') id: string, @Body() dto: RefineObjectiveDto) {
    const project = await this.projectsService.findOne(id);
    if (!project) throw new NotFoundException('Project not found');

    const smart = await this.planningService.generateSmartObjective(dto);

    await this.projectsService.update(id, {
      smartObjective: smart,
    });

    return {
      smart,
      nextPhase: 'wbs-generation',
    };
  }
}
