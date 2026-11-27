import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ProjectsService } from '../projects.service';
import { WBSService, WbsValidationService, AuditService } from '../services/wbs';
import {
  GenerateWBSDto,
  SaveWBSDto,
  SuggestDecompositionDto,
  CompleteLeafTasksDto,
  AuditLeafDiscrepancyDto,
  ResolveWBSBudgetDto,
} from '../dto/wbs.dto';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('projects')
@Controller('projects')
export class ProjectsWbsController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly wbsService: WBSService,
    private readonly validation: WbsValidationService,
    private readonly auditService: AuditService,
  ) {}

  private extractTargetDate(temporal: string | undefined, fallbackDeadline?: Date): Date {
    const text = String(temporal || '');

    const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
    if (iso) {
      const parsed = new Date(`${iso[1]}-${iso[2]}-${iso[3]}T00:00:00`);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }

    const br = text.match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/);
    if (br) {
      const parsed = new Date(`${br[3]}-${br[2]}-${br[1]}T00:00:00`);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }

    if (fallbackDeadline) {
      const parsed = new Date(fallbackDeadline);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }

    const fallback = new Date();
    fallback.setDate(fallback.getDate() + 28);
    return fallback;
  }

  private buildBudgetContext(
    targetDate: Date,
    weeklyHours: number,
  ): { budgetHours: number; weeksAvailable: number } {
    const now = new Date();
    const msPerDay = 24 * 60 * 60 * 1000;
    const days = Math.max(1, Math.ceil((targetDate.getTime() - now.getTime()) / msPerDay));
    const weeksAvailable = Math.max(1, Math.ceil(days / 7));
    const budgetHours = Math.max(1, Math.round(weeksAvailable * weeklyHours * 10) / 10);
    return { budgetHours, weeksAvailable };
  }

  @Post(':id/generate-wbs')
  @ApiOperation({ summary: 'Generate WBS from SMART objective using AI' })
  @ApiResponse({ status: 200, description: 'WBS generated successfully.' })
  async generateWBS(@Param('id') id: string, @Body() dto: GenerateWBSDto) {
    const project = await this.projectsService.findOne(id);
    if (!project) throw new NotFoundException('Project not found');

    const weeklyHours = Number(dto.weeklyHours ?? project.smartObjective?.weeklyHours);
    if (!Number.isFinite(weeklyHours) || weeklyHours <= 0) {
      throw new BadRequestException(
        'Weekly hours are required to generate WBS budget. Update SMART objective first.',
      );
    }

    const targetDate = this.extractTargetDate(dto.temporal, project.deadline);
    const context = this.buildBudgetContext(targetDate, weeklyHours);
    const budgetHours =
      Number.isFinite(Number(dto.budgetHours)) && Number(dto.budgetHours) > 0
        ? Number(dto.budgetHours)
        : context.budgetHours;

    const generationInput = {
      ...dto,
      weeklyHours,
      budgetHours,
      weeksAvailable: context.weeksAvailable,
    };

    const nodes = await this.wbsService.generateWBS(generationInput);
    const validation = this.validation.validateTree(nodes);
    const budgetValidation = this.validation.validateBudget(nodes, budgetHours, {
      weeklyHours,
      weeksAvailable: context.weeksAvailable,
    });

    return {
      nodes,
      validation,
      budgetValidation,
    };
  }

  @Post(':id/save-wbs')
  @ApiOperation({ summary: 'Save WBS nodes to the project' })
  @ApiResponse({ status: 200, description: 'WBS saved successfully.' })
  async saveWBS(@Param('id') id: string, @Body() dto: SaveWBSDto) {
    const project = await this.projectsService.findOne(id);
    if (!project) throw new NotFoundException('Project not found');

    const saved = await this.wbsService.saveWBS(id, dto.nodes);
    return { saved: saved.length, message: 'WBS salva com sucesso' };
  }

  @Get(':id/wbs')
  @ApiOperation({ summary: 'Get WBS tree for a project' })
  @ApiResponse({ status: 200, description: 'WBS tree retrieved.' })
  async getWBS(@Param('id') id: string) {
    const project = await this.projectsService.findOne(id);
    if (!project) throw new NotFoundException('Project not found');

    const nodes = await this.wbsService.getWBS(id);
    const validation = this.validation.validateTree(nodes);

    return { nodes, validation };
  }

  @Post(':id/wbs/validate')
  @ApiOperation({ summary: 'Validate WBS nodes against 8/80 rule' })
  @ApiResponse({ status: 200, description: 'Validation result.' })
  validateWBS(@Param('id') _id: string, @Body() dto: SaveWBSDto) {
    return this.validation.validateTree(dto.nodes);
  }

  @Post(':id/wbs/resolve-budget')
  @ApiOperation({
    summary: 'Resolve over-budget WBS by normalizing or rejecting',
  })
  @ApiResponse({ status: 200, description: 'Budget resolution result.' })
  async resolveWBSBudget(@Param('id') id: string, @Body() dto: ResolveWBSBudgetDto) {
    const project = await this.projectsService.findOne(id);
    if (!project) throw new NotFoundException('Project not found');

    if (!Number.isFinite(Number(dto.budgetHours)) || Number(dto.budgetHours) <= 0) {
      throw new BadRequestException('Invalid budgetHours for WBS resolution.');
    }

    if (dto.strategy === 'reject') {
      const budgetValidation = this.validation.validateBudget(dto.nodes, Number(dto.budgetHours));
      return {
        nodes: dto.nodes,
        validation: this.validation.validateTree(dto.nodes),
        budgetValidation,
        resolved: false,
        strategy: dto.strategy,
      };
    }

    const normalizedNodes = this.validation.normalizeTreeToBudget(dto.nodes, Number(dto.budgetHours));
    const validation = this.validation.validateTree(normalizedNodes);
    const budgetValidation = this.validation.validateBudget(normalizedNodes, Number(dto.budgetHours));

    return {
      nodes: normalizedNodes,
      validation,
      budgetValidation,
      resolved: true,
      strategy: dto.strategy,
    };
  }

  @Post(':id/wbs/suggest-decomposition')
  @ApiOperation({
    summary: 'Suggest decomposition for a WBS node violating 8/80',
  })
  @ApiResponse({ status: 200, description: 'Decomposition suggestion.' })
  async suggestDecomposition(@Param('id') _id: string, @Body() dto: SuggestDecompositionDto) {
    const suggestion = await this.validation.suggestDecomposition(dto);
    return { suggestion };
  }

  @Post(':id/wbs/complete-leaf-tasks')
  @ApiOperation({
    summary: 'Generate only the missing micro-tasks of a leaf (after an audit)',
  })
  @ApiResponse({ status: 200, description: 'Additional micro-tasks for the leaf.' })
  async completeLeafTasks(@Param('id') id: string, @Body() dto: CompleteLeafTasksDto) {
    const project = await this.projectsService.findOne(id);
    if (!project) throw new NotFoundException('Project not found');

    const result = await this.wbsService.completeLeafTasks({
      leafNode: dto.leafNode,
      nodePath: dto.nodePath,
      project,
      existingTaskNames: dto.existingTaskNames,
      missingHours: dto.missingHours,
      preferences: dto.preferences,
    });
    return {
      ...result,
      message: `📝 ${result.tasks.length} micro-tarefas adicionais geradas`,
    };
  }

  @Post(':id/wbs/audit-leaf-discrepancy')
  @ApiOperation({
    summary: 'Audit a leaf discrepancy (WBS estimate vs generated micro-tasks)',
  })
  @ApiResponse({
    status: 200,
    description: 'Audit result with diagnosis and suggested action.',
  })
  async auditLeafDiscrepancy(@Param('id') id: string, @Body() dto: AuditLeafDiscrepancyDto) {
    const project = await this.projectsService.findOne(id);
    if (!project) throw new NotFoundException('Project not found');

    return this.auditService.auditLeafDiscrepancy(project, dto);
  }
}
