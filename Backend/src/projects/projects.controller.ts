import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { TaskDocument } from '../tasks/schemas/task.schema';
import { Controller, Get, Post, Body, Patch, Param, Delete, NotFoundException, Query } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { PlanningService } from './planning/planning.service';
import { CatchballRequestDto, RefineObjectiveDto, SuggestAnswerDto } from './dto/smart-objective.dto';
import { WBSService } from './wbs/wbs.service';
import { WbsValidationService } from './wbs/services/wbs-validation.service';
import { TaskConversionService } from './wbs/services/task-conversion.service';
import { AuditService } from './wbs/services/audit.service';
import { GenerateWBSDto, SaveWBSDto, SuggestDecompositionDto, ConvertWBSToTasksDto, GetLeafNodesDto, GenerateTasksForLeafDto, AuditLeafDiscrepancyDto } from './dto/wbs.dto';
import { TasksService } from '../tasks/tasks.service';

@ApiTags('projects')
@Controller('projects')
export class ProjectsController {
	constructor(
		private readonly projectsService: ProjectsService,
		private readonly planningService: PlanningService,
		private readonly wbsService: WBSService,
		private readonly validation: WbsValidationService,
		private readonly taskConversionService: TaskConversionService,
		private readonly auditService: AuditService,
		private readonly tasksService: TasksService,
		@InjectModel('Task') private readonly taskModel: Model<TaskDocument>,
	) {}

	@Get(':id/tasks')
	async getTasksForProject(@Param('id') id: string) {
		// Option 1: Use service method
		return this.projectsService.getTasksForProject(id);
		// Option 2: Directly use model (uncomment if you prefer)
		// return this.taskModel.find({ project: id }).exec();
	}

	@Post(':id/plan-with-ai')
	@ApiOperation({ summary: 'Start AI-assisted project planning with Catchball' })
	@ApiResponse({ status: 200, description: 'Catchball questions generated.' })
	async planProjectWithAI(
		@Param('id') id: string,
		@Body() dto: CatchballRequestDto
	) {
		const project = await this.projectsService.findOne(id);
		if (!project) throw new NotFoundException('Project not found');
		
		return this.planningService.startCatchball({
			projectName: dto.projectName,
			projectDescription: dto.projectDescription,
			shortTermGoal: dto.shortTermGoal,
			midTermGoal: dto.midTermGoal,
			longTermGoal: dto.longTermGoal
		});
	}

	@Post(':id/suggest-answer')
	@ApiOperation({ summary: 'Generate suggested answer for a Catchball question' })
	@ApiResponse({ status: 200, description: 'Suggested answer generated.' })
	async suggestAnswer(
		@Param('id') id: string,
		@Body() dto: SuggestAnswerDto
	) {
		const project = await this.projectsService.findOne(id);
		if (!project) throw new NotFoundException('Project not found');
		
		const suggestedAnswer = await this.planningService.suggestAnswer(
			dto.conversationId,
			dto.questionIndex,
			dto.question,
			dto.previousAnswers
		);
		
		return { suggestedAnswer };
	}

	@Post(':id/refine-objective')
	@ApiOperation({ summary: 'Generate SMART objectives from Catchball answers' })
	@ApiResponse({ status: 200, description: 'SMART objectives generated.' })
	async refineObjective(
		@Param('id') id: string,
		@Body() dto: RefineObjectiveDto
	) {
		const project = await this.projectsService.findOne(id);
		if (!project) throw new NotFoundException('Project not found');
		
		const smart = await this.planningService.generateSmartObjective(
			dto.conversationId,
			dto.answers
		);
		
		// Atualiza o projeto com os objetivos SMART
		await this.projectsService.update(id, {
			smartObjective: smart,
		});
		
		return {
			smart,
			nextPhase: 'wbs-generation'
		};
	}

	// ── WBS Endpoints ──────────────────────────────────────

	@Post(':id/generate-wbs')
	@ApiOperation({ summary: 'Generate WBS from SMART objective using AI' })
	@ApiResponse({ status: 200, description: 'WBS generated successfully.' })
	async generateWBS(
		@Param('id') id: string,
		@Body() dto: GenerateWBSDto
	) {
		const project = await this.projectsService.findOne(id);
		if (!project) throw new NotFoundException('Project not found');

		const nodes = await this.wbsService.generateWBS(dto);
		const validation = this.validation.validateTree(nodes);

		return { nodes, validation };
	}

	@Post(':id/save-wbs')
	@ApiOperation({ summary: 'Save WBS nodes to the project' })
	@ApiResponse({ status: 200, description: 'WBS saved successfully.' })
	async saveWBS(
		@Param('id') id: string,
		@Body() dto: SaveWBSDto
	) {
		const project = await this.projectsService.findOne(id);
		if (!project) throw new NotFoundException('Project not found');

		console.log('📥 WBS recebida do frontend:', JSON.stringify(dto.nodes.slice(0, 2), null, 2));
		
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
	async validateWBS(
		@Param('id') id: string,
		@Body() dto: SaveWBSDto
	) {
		return this.validation.validateTree(dto.nodes);
	}

	@Post(':id/wbs/suggest-decomposition')
	@ApiOperation({ summary: 'Suggest decomposition for a WBS node violating 8/80' })
	@ApiResponse({ status: 200, description: 'Decomposition suggestion.' })
	async suggestDecomposition(
		@Param('id') id: string,
		@Body() dto: SuggestDecompositionDto
	) {
		const suggestion = await this.validation.suggestDecomposition(dto);
		return { suggestion };
	}

	@Post(':id/wbs/convert-to-tasks')
	@ApiOperation({ summary: 'Convert WBS leaf nodes into project tasks with AI enrichment' })
	@ApiResponse({ status: 200, description: 'Tasks created from WBS.' })
	async convertWBSToTasks(
		@Param('id') id: string,
		@Body() dto: ConvertWBSToTasksDto
	) {
		const project = await this.projectsService.findOne(id);
		if (!project) throw new NotFoundException('Project not found');

		// Gera tasks enriquecidas com IA usando TaskConversionService
		const result = await this.taskConversionService.convertWBSToTasksWithAI(
			dto.nodes,
			id,
			project,
			this.tasksService,
			dto.preferences,
			{
				autoResolveDiscrepancies: !!dto.autoResolveDiscrepancies,
				autoAuditThresholdPct: dto.autoAuditThresholdPct,
			}
		);

		console.log(`✅ ${result.createdTasks.length} micro-tarefas criadas com sucesso`);

		return {
			message: `✅ Conversão bem-sucedida: ${result.createdTasks.length} micro-tarefas (≤3h) criadas a partir da WBS (pacotes 8/80)` +
				(dto.autoResolveDiscrepancies && result.auditsApplied.length
					? ` • Auditoria aplicada em ${result.auditsApplied.length} pacote(s)`
					: ''),
			tasks: result.createdTasks,
			wbsUpdates: result.wbsUpdates,
			auditsApplied: result.auditsApplied,
			summary: {
				totalTasks: result.createdTasks.length,
				totalPomodoros: result.createdTasks.reduce((sum, t: any) => sum + (t.pomodorosPlanned || 0), 0),
				estimatedHours: (result.createdTasks.reduce((sum, t: any) => sum + (t.pomodorosPlanned || 0), 0) * 0.5).toFixed(1),
			}
		};
	}

	@Post(':id/wbs/leaf-nodes')
	@ApiOperation({ summary: 'Get all leaf nodes from WBS tree with their paths (for interactive generation)' })
	@ApiResponse({ status: 200, description: 'List of leaf nodes with paths' })
	async getLeafNodes(
		@Param('id') id: string,
		@Body() dto: GetLeafNodesDto
	) {
		const leafNodes = this.wbsService.getLeafNodesWithPaths(dto.nodes);
		
		return {
			leafNodes,
			total: leafNodes.length,
			totalHours: leafNodes.reduce((sum, leaf) => sum + (leaf.node.estimatedHours || 0), 0),
		};
	}

	@Post(':id/wbs/generate-tasks-for-leaf')
	@ApiOperation({ summary: 'Generate tasks for a single leaf node (interactive mode)' })
	@ApiResponse({ status: 200, description: 'Tasks generated for the leaf node' })
	async generateTasksForLeaf(
		@Param('id') id: string,
		@Body() dto: GenerateTasksForLeafDto
	) {
		const project = await this.projectsService.findOne(id);
		if (!project) throw new NotFoundException('Project not found');

		console.log(`🔄 Gerando tasks para leaf: "${dto.leafNode.name}"...`);

		const result = await this.wbsService.generateTasksForSingleLeaf(
			dto.leafNode,
			dto.nodePath,
			id,
			project,
			this.tasksService,
			dto.preferences,
			dto.saveTasks || false
		);

		console.log(`✅ ${result.tasks.length} tasks ${dto.saveTasks ? 'criadas' : 'preparadas'}`);

		return {
			...result,
			message: dto.saveTasks 
				? `✅ ${result.tasks.length} micro-tarefas criadas com sucesso`
				: `📝 ${result.tasks.length} micro-tarefas preparadas para revisão`,
		};
	}

	@Post(':id/wbs/audit-leaf-discrepancy')
	@ApiOperation({ summary: 'Audit a leaf discrepancy (WBS estimate vs generated micro-tasks)' })
	@ApiResponse({ status: 200, description: 'Audit result with diagnosis and suggested action.' })
	async auditLeafDiscrepancy(
		@Param('id') id: string,
		@Body() dto: AuditLeafDiscrepancyDto,
	) {
		const project = await this.projectsService.findOne(id);
		if (!project) throw new NotFoundException('Project not found');

		return this.auditService.auditLeafDiscrepancy(project, dto);
	}

	@Post()
	@ApiOperation({ summary: 'Create a new project' })
	@ApiResponse({ status: 201, description: 'Project created successfully.' })
	create(@Body() dto: CreateProjectDto) {
		return this.projectsService.create(dto);
	}

	@Get()
	@ApiOperation({ summary: 'List all projects' })
	findAll() {
		return this.projectsService.findAll();
	}

	@Get(':id')
	@ApiOperation({ summary: 'Get a project by id' })
	async findOne(@Param('id') id: string) {
		const project = await this.projectsService.findOne(id);
		if (!project) throw new NotFoundException('Project not found');
		return project;
	}

	@Patch(':id')
	@ApiOperation({ summary: 'Update a project by id' })
	async update(@Param('id') id: string, @Body() dto: UpdateProjectDto) {
		const project = await this.projectsService.update(id, dto);
		if (!project) throw new NotFoundException('Project not found');
		return project;
	}

	@Delete(':id')
	@ApiOperation({ summary: 'Delete a project by id. Use ?deleteTasks=true to delete associated tasks, or ?deleteTasks=false to just unlink them.' })
	async remove(
		@Param('id') id: string,
		@Query('deleteTasks') deleteTasks?: string
	) {
		// If deleteTasks parameter is provided, use removeWithOptions
		if (deleteTasks !== undefined) {
			const shouldDeleteTasks = deleteTasks === 'true';
			const result = await this.projectsService.removeWithOptions(id, shouldDeleteTasks);
			if (!result.deleted) throw new NotFoundException('Project not found');
			return {
				message: `Project removed successfully. ${shouldDeleteTasks ? 'Deleted' : 'Unlinked'} ${result.tasksAffected} task(s).`,
				tasksAffected: result.tasksAffected,
				tasksDeleted: shouldDeleteTasks
			};
		}
		
		// Default behavior: just delete project
		const removed = await this.projectsService.remove(id);
		if (!removed) throw new NotFoundException('Project not found');
		return { message: 'Project removed successfully' };
	}

	@Patch(':id/increment-hours')
	@ApiOperation({ summary: 'Increment totalHoursWorked and update progress' })
	incrementHours(
		@Param('id') id: string,
		@Query('hours') hours: string
	) {
		const h = parseFloat(hours);
		return this.projectsService.incrementHoursWorked(id, isNaN(h) ? 0 : h);
	}

	@Post(':id/recalculate-stats')
	@ApiOperation({ summary: 'Recalculate plannedHours, experience, and reward based on tasks' })
	@ApiResponse({ status: 200, description: 'Project stats recalculated successfully.' })
	async recalculateStats(@Param('id') id: string) {
		const result = await this.projectsService.recalculateProjectStats(id);
		if (!result) throw new NotFoundException('Project not found');
		return result;
	}

	@Post('recalculate-all-stats')
	@ApiOperation({ summary: 'Recalculate stats for all projects' })
	@ApiResponse({ status: 200, description: 'All project stats recalculated successfully.' })
	async recalculateAllStats() {
		const projects = await this.projectsService.findAll();
		const results: any[] = [];
		for (const project of projects) {
			const projectId = (project as any)._id.toString();
			const updated = await this.projectsService.recalculateProjectStats(projectId);
			// Skip if project was deleted during the loop
			if (updated) {
				results.push({
					id: updated._id,
					name: updated.name,
					plannedHours: updated.plannedHours,
					experience: updated.experience,
					reward: updated.reward
				});
			}
		}
		return {
			message: 'All projects recalculated',
			count: results.length,
			projects: results
		};
	}
}
