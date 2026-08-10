import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  NotFoundException,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ProjectsService } from '../projects.service';
import { WBSService, WbsValidationService, TaskConversionService, AuditService } from '../services/wbs';
import {
  GenerateWBSDto,
  SaveWBSDto,
  SuggestDecompositionDto,
  ConvertWBSToTasksDto,
  GetLeafNodesDto,
  GenerateTasksForLeafDto,
  AuditLeafDiscrepancyDto,
  ResolveWBSBudgetDto,
} from '../dto/wbs.dto';
import { TasksService } from '../../tasks/tasks.service';
import { LeafTasksBufferService } from '../services/execution';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { createHash } from 'crypto';

@ApiTags('projects')
@Controller('projects')
export class ProjectsWbsController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly wbsService: WBSService,
    private readonly validation: WbsValidationService,
    private readonly taskConversionService: TaskConversionService,
    private readonly auditService: AuditService,
    private readonly tasksService: TasksService,
    private readonly leafBuffer: LeafTasksBufferService,
  ) {}

  private hashKey(input: any): string {
    const raw = typeof input === 'string' ? input : JSON.stringify(input);
    return createHash('sha1').update(raw).digest('hex').slice(0, 16);
  }

  private buildLeafBufferKey(
    projectId: string,
    leafNode: Record<string, unknown> | null | undefined,
    nodePath: string,
    preferences: Record<string, unknown> | null | undefined,
  ): string {
    const fingerprint = {
      v: 1,
      nodeId: (() => {
        if (!leafNode || typeof leafNode !== 'object' || !('_id' in leafNode)) return undefined;
        const rawId = (leafNode as { _id?: unknown })._id;
        if (typeof rawId === 'string') return rawId;
        if (typeof rawId === 'number') return String(rawId);
        if (
          rawId &&
          typeof rawId === 'object' &&
          'toString' in rawId &&
          typeof rawId.toString === 'function'
        ) {
          return (rawId as { toString(): string }).toString();
        }
        return undefined;
      })(),
      nodeName: leafNode?.name,
      nodeDesc: leafNode?.description,
      estimatedHours: leafNode?.estimatedHours,
      nodePath,
      preferences: preferences || {},
      model:
        preferences?.modelOverride ||
        process.env.GEMINI_MODEL ||
        process.env.WBS_GEMINI_MODEL ||
        undefined,
    };
    return `leafbuf:${projectId}:${this.hashKey(fingerprint)}`;
  }

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

  @Post(':id/wbs/convert-to-tasks')
  @ApiOperation({
    summary: 'Convert WBS leaf nodes into project tasks with AI enrichment',
  })
  @ApiResponse({ status: 200, description: 'Tasks created from WBS.' })
  async convertWBSToTasks(@Param('id') id: string, @Body() dto: ConvertWBSToTasksDto) {
    const project = await this.projectsService.findOne(id);
    if (!project) throw new NotFoundException('Project not found');

    const result = await this.taskConversionService.convertWBSToTasksWithAI({
      nodes: dto.nodes,
      projectId: id,
      project,
      tasksService: this.tasksService,
      preferences: dto.preferences,
      options: {
        autoResolveDiscrepancies: !!dto.autoResolveDiscrepancies,
        autoAuditThresholdPct: dto.autoAuditThresholdPct,
      },
    });

    return {
      message:
        `✅ Conversão bem-sucedida: ${result.createdTasks.length} micro-tarefas (≤3h) criadas a partir da WBS (pacotes 8/80)` +
        (dto.autoResolveDiscrepancies && result.auditsApplied.length
          ? ` • Auditoria aplicada em ${result.auditsApplied.length} pacote(s)`
          : ''),
      tasks: result.createdTasks,
      wbsUpdates: result.wbsUpdates,
      auditsApplied: result.auditsApplied,
      summary: {
        totalTasks: result.createdTasks.length,
        totalPomodoros: (result.createdTasks as Record<string, unknown>[]).reduce(
          (sum: number, t: Record<string, unknown>) =>
            sum + (typeof t.pomodorosPlanned === 'number' ? t.pomodorosPlanned : 0),
          0,
        ),
        estimatedHours: (
          (result.createdTasks as Record<string, unknown>[]).reduce(
            (sum: number, t: Record<string, unknown>) =>
              sum + (typeof t.pomodorosPlanned === 'number' ? t.pomodorosPlanned : 0),
            0,
          ) * 0.5
        ).toFixed(1),
      },
    };
  }

  @Post(':id/wbs/leaf-nodes')
  @ApiOperation({
    summary: 'Get all leaf nodes from WBS tree with their paths (for interactive generation)',
  })
  @ApiResponse({ status: 200, description: 'List of leaf nodes with paths' })
  getLeafNodes(@Param('id') _id: string, @Body() dto: GetLeafNodesDto) {
    const leafNodes = this.wbsService.getLeafNodesWithPaths(dto.nodes);

    return {
      leafNodes,
      total: leafNodes.length,
      totalHours: leafNodes.reduce((sum, leaf) => sum + (leaf.node.estimatedHours || 0), 0),
    };
  }

  @Post(':id/wbs/generate-tasks-for-leaf')
  @ApiOperation({
    summary: 'Generate tasks for a single leaf node (interactive mode)',
  })
  @ApiResponse({
    status: 200,
    description: 'Tasks generated for the leaf node',
  })
  async generateTasksForLeaf(@Param('id') id: string, @Body() dto: GenerateTasksForLeafDto) {
    const project = await this.projectsService.findOne(id);
    if (!project) throw new NotFoundException('Project not found');

    const preferences = dto.preferences || {};
    const currentKey = this.buildLeafBufferKey(
      id,
      dto.leafNode as unknown as Record<string, unknown>,
      dto.nodePath,
      preferences,
    );

    const prefetchLeafs = Array.isArray(dto.prefetchLeafs) ? dto.prefetchLeafs : [];
    for (const p of prefetchLeafs) {
      if (!p?.leafNode || !p?.nodePath) continue;
      if (String(p.nodePath) === String(dto.nodePath)) continue;
      const key = this.buildLeafBufferKey(
        id,
        p.leafNode as unknown as Record<string, unknown>,
        p.nodePath,
        preferences,
      );
      this.leafBuffer.prefetch(key, id, async () => {
        return this.wbsService.generateTasksForSingleLeaf({
          leafNode: p.leafNode,
          nodePath: p.nodePath,
          projectId: id,
          project,
          tasksService: this.tasksService,
          preferences,
          saveTasks: false,
        });
      });
    }

    const shouldUseBuffer = !(dto.saveTasks || false);
    const buffered = shouldUseBuffer
      ? await this.leafBuffer.consume<{ tasks?: unknown[] }>(currentKey)
      : null;
    if (buffered) {
      return {
        ...buffered,
        message: dto.saveTasks
          ? `✅ ${buffered.tasks?.length || 0} micro-tarefas criadas com sucesso`
          : `📝 ${buffered.tasks?.length || 0} micro-tarefas preparadas para revisão`,
      };
    }

    let result: { tasks: unknown[] };
    try {
      result = await this.wbsService.generateTasksForSingleLeaf({
        leafNode: dto.leafNode,
        nodePath: dto.nodePath,
        projectId: id,
        project,
        tasksService: this.tasksService,
        preferences,
        saveTasks: dto.saveTasks || false,
      });
    } catch (err: unknown) {
      const errorObj = err as {
        code?: string;
        retryAfterMs?: number;
        isQuotaExceeded?: boolean;
        model?: string;
      };
      if (errorObj?.code === 'RATE_LIMIT') {
        const retryAfterMs = Number(errorObj?.retryAfterMs);
        throw new HttpException(
          {
            message: errorObj?.isQuotaExceeded
              ? 'Limite/Quota do Gemini atingido. Tente novamente mais tarde ou aumente a quota/billing.'
              : 'Rate limit do Gemini. Aguarde e tente novamente.',
            code: 'RATE_LIMIT',
            isQuotaExceeded: !!errorObj?.isQuotaExceeded,
            retryAfterMs: Number.isFinite(retryAfterMs) ? retryAfterMs : undefined,
            model: errorObj?.model,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      throw err;
    }

    return {
      ...result,
      message: dto.saveTasks
        ? `✅ ${result.tasks.length} micro-tarefas criadas com sucesso`
        : `📝 ${result.tasks.length} micro-tarefas preparadas para revisão`,
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
