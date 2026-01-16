import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { TaskDocument } from '../tasks/schemas/task.schema';
import { Controller, Get, Post, Body, Patch, Param, Delete, NotFoundException, Query } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('projects')
@Controller('projects')
export class ProjectsController {
	constructor(
		private readonly projectsService: ProjectsService,
		@InjectModel('Task') private readonly taskModel: Model<TaskDocument>,
	) {}

	@Get(':id/tasks')
	async getTasksForProject(@Param('id') id: string) {
		// Option 1: Use service method
		return this.projectsService.getTasksForProject(id);
		// Option 2: Directly use model (uncomment if you prefer)
		// return this.taskModel.find({ project: id }).exec();
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
