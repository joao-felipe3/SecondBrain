import { Controller, Get, Post, Param, Body, Query } from '@nestjs/common';
import { GanttService, PertDiagramService, ProjectsXMatrixService } from '../services/visualization';
import { CreateXMatrixDto } from '../dto/x-matrix.dto';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('projects')
@Controller('projects')
export class ProjectsVisualizationController {
  constructor(
    private readonly ganttService: GanttService,
    private readonly pertDiagramService: PertDiagramService,
    private readonly xMatrixService: ProjectsXMatrixService,
  ) {}

  @Get(':id/gantt-data')
  @ApiOperation({ summary: 'Get timeline data for Gantt chart visualization' })
  @ApiResponse({
    status: 200,
    description: 'Gantt data retrieved successfully.',
  })
  async getGanttData(@Param('id') id: string, @Query('includeCompleted') includeCompleted?: string) {
    const include =
      includeCompleted === undefined
        ? true
        : !['false', '0', 'no'].includes(String(includeCompleted).toLowerCase());

    return this.ganttService.getGanttData(id, {
      includeCompleted: include,
    });
  }

  @Get(':id/pert-diagram-data')
  @ApiOperation({
    summary: 'Get PERT/CPM network data for diagram visualization',
  })
  @ApiResponse({
    status: 200,
    description: 'PERT diagram data retrieved successfully.',
  })
  async getPertDiagramData(
    @Param('id') id: string,
    @Query('includeCompleted') includeCompleted?: string,
  ) {
    const include =
      includeCompleted === undefined
        ? true
        : !['false', '0', 'no'].includes(String(includeCompleted).toLowerCase());

    return this.pertDiagramService.getPertDiagramData(id, {
      includeCompleted: include,
    });
  }

  @Post(':id/create-x-matrix')
  @ApiOperation({
    summary: 'Create fractal X-Matrix (Norte/Estrategico/Tatico) using WBS L1/L2 initiatives and waves',
  })
  @ApiResponse({ status: 200, description: 'X-Matrix generated successfully.' })
  async createXMatrix(@Param('id') id: string, @Body() dto: CreateXMatrixDto) {
    return this.xMatrixService.createXMatrix(id, dto || {});
  }

  @Get(':id/x-matrix')
  @ApiOperation({ summary: 'Get saved X-Matrix snapshot for project' })
  @ApiResponse({
    status: 200,
    description: 'X-Matrix snapshot returned (or null when not generated yet).',
  })
  async getSavedXMatrix(@Param('id') id: string) {
    return this.xMatrixService.getSavedXMatrix(id);
  }
}
