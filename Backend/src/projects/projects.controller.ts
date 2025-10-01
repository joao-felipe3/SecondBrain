import { Controller, Get, Post, Body, Patch, Param, Delete, NotFoundException, Query } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('projects')
@Controller('projects')
export class ProjectsController {
	constructor(private readonly projectsService: ProjectsService) {}

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
	@ApiOperation({ summary: 'Delete a project by id' })
	async remove(@Param('id') id: string) {
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
}
