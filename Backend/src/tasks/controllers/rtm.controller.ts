import { Controller, Post, Get, Delete, Param, Body, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { RTMService } from '../services/rtm.service';
import { TasksService } from '../tasks.service';
import { RequirementDocument } from '../schemas/requirement.schema';

@ApiTags('RTM - Rastreabilidade de Requisitos')
@ApiBearerAuth()
@Controller('projects')
export class RTMController {
  private readonly logger = new Logger(RTMController.name);

  constructor(
    private readonly rtmService: RTMService,
    private readonly tasksService: TasksService,
  ) {}

  /**
   * Gera requisitos automaticamente a partir de um Smart Objective
   */
  @Post(':projectId/requirements/auto-generate')
  @ApiOperation({
    summary: 'Gerar requisitos automaticamente com IA',
    description:
      'Analisa um Smart Objective e extrai uma lista de requisitos funcionais, não-funcionais e restrições usando Gemini.',
  })
  @ApiResponse({
    status: 201,
    description: 'Requisitos gerados e salvos com sucesso',
  })
  async autoGenerateRequirements(
    @Param('projectId') projectId: string,
    @Body() body: { smartObjective: any },
  ) {
    const startedAt = Date.now();

    this.logger.log(
      `[auto-gen-req] projectId=${projectId} iniciando geração automática de requisitos`,
    );

    try {
      // 1. Gerar requisitos com IA
      const generatedReqs = await this.rtmService.generateRequirements(body.smartObjective);

      if (generatedReqs.length === 0) {
        this.logger.warn(`[auto-gen-req] projectId=${projectId} nenhum requisito gerado`);
        return {
          success: false,
          message: 'Nenhum requisito foi gerado. Tente novamente ou forneça um Smart Objective mais detalhado.',
          requirements: [],
        };
      }

      // 2. Salvar no banco
      const saved = await this.rtmService.saveRequirements(
        projectId,
        generatedReqs.map((req: any) => ({
          description: req.description,
          type: req.type,
          source: 'auto_generated_from_smart_objective',
        })),
      );

      // 3. Validar
      const validation = await this.rtmService.validateRTM(projectId);

      this.logger.log(
        `[auto-gen-req] projectId=${projectId} ${saved.length} requisitos salvos (${validation.coverage.toFixed(1)}% cobertura) - ${
          Date.now() - startedAt
        }ms`,
      );

      return {
        success: true,
        count: saved.length,
        requirements: saved.map((req: any) => ({
          id: req._id?.toString() || req.id,
          description: req.description,
          type: req.type,
          status: req.status,
        })),
        validation,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      this.logger.error(
        `[auto-gen-req] projectId=${projectId} erro: ${error?.message}`,
      );
      return {
        success: false,
        error: error?.message,
        requirements: [],
      };
    }
  }

  /**
   * Retorna a matriz de rastreabilidade completa
   */
  @Get(':projectId/rtm-matrix')
  @ApiOperation({
    summary: 'Obter matriz de rastreabilidade (RTM)',
    description:
      'Retorna uma matriz requisitos × tarefas mostrando quais tarefas rastreiam cada requisito.',
  })
  @ApiResponse({
    status: 200,
    description: 'Matriz RTM retornada com sucesso',
  })
  async getRTMMatrix(@Param('projectId') projectId: string) {
    const startedAt = Date.now();

    this.logger.log(`[rtm-matrix] projectId=${projectId} gerando matriz`);

    try {
      // 1. Buscar tarefas do projeto
      const tasks = await this.tasksService.findByProjectId(projectId);

      // 2. Gerar matriz
      const matrixData = await this.rtmService.getRTMMatrix(projectId, tasks);

      // 3. Converter matriz para formato serializable (para JSON)
      const matrixJson: Record<string, string[]> = {};
      for (const [reqId, taskIds] of matrixData.matrix.entries()) {
        matrixJson[reqId] = Array.from(taskIds);
      }

      this.logger.log(
        `[rtm-matrix] projectId=${projectId} matriz gerada (${matrixData.requirements.length} req × ${matrixData.tasks.length} tasks) - ${
          Date.now() - startedAt
        }ms`,
      );

      // Debug: log WBS distribution
      const wbsDistribution = new Map<string, number>();
      matrixData.tasks.forEach((t: any) => {
        const wbsName = t.wbsNodeName || 'Sem WBS';
        wbsDistribution.set(wbsName, (wbsDistribution.get(wbsName) || 0) + 1);
      });
      this.logger.debug(
        `[rtm-matrix] WBS Distribution: ${JSON.stringify(Array.from(wbsDistribution.entries()))}`,
      );
      this.logger.debug(
        `[rtm-matrix] Sample tasks: ${JSON.stringify(matrixData.tasks.slice(0, 3))}`,
      );

      return {
        success: true,
        projectId,
        requirements: matrixData.requirements,
        tasks: matrixData.tasks,
        matrix: matrixJson,
        validation: matrixData.validation,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      this.logger.error(`[rtm-matrix] projectId=${projectId} erro: ${error?.message}`);
      return {
        success: false,
        error: error?.message,
      };
    }
  }

  /**
   * Mapeia um requisito para uma tarefa (rastreamento)
   */
  @Post(':projectId/requirements/map')
  @ApiOperation({
    summary: 'Mapear requisito para tarefa',
    description: 'Associa uma tarefa a um requisito para rastreabilidade.',
  })
  @ApiResponse({
    status: 200,
    description: 'Mapeamento realizado com sucesso',
  })
  async mapRequirementToTask(
    @Param('projectId') projectId: string,
    @Body() body: { requirementId: string; taskId: string },
  ) {
    this.logger.log(
      `[map-req] projectId=${projectId} req=${body.requirementId} task=${body.taskId}`,
    );

    try {
      const result = await this.rtmService.mapRequirementToTask(
        projectId,
        body.requirementId,
        body.taskId,
      );

      if (!result) {
        return { success: false, message: 'Requisito não encontrado' };
      }

      // Revalidar
      const validation = await this.rtmService.validateRTM(projectId);

      return {
        success: true,
        message: 'Mapeamento realizado com sucesso',
        requirement: {
          id: (result as RequirementDocument)._id?.toString(),
          description: result.description,
          traceableItems: result.traceableItems,
          status: result.status,
        },
        validation,
      };
    } catch (error: any) {
      this.logger.error(`[map-req] projectId=${projectId} erro: ${error?.message}`);
      return { success: false, error: error?.message };
    }
  }

  /**
   * Remove mapeamento de um requisito
   */
  @Post(':projectId/requirements/unmap')
  @ApiOperation({
    summary: 'Remover mapeamento de um requisito',
    description: 'Remove a associação de uma tarefa a um requisito.',
  })
  @ApiResponse({
    status: 200,
    description: 'Mapeamento removido com sucesso',
  })
  async unmapRequirementFromTask(
    @Param('projectId') projectId: string,
    @Body() body: { requirementId: string; taskId: string },
  ) {
    this.logger.log(
      `[unmap-req] projectId=${projectId} req=${body.requirementId} task=${body.taskId}`,
    );

    try {
      const result = await this.rtmService.unmapRequirementFromTask(
        body.requirementId,
        body.taskId,
      );

      if (!result) {
        return { success: false, message: 'Requisito não encontrado' };
      }

      // Revalidar
      const validation = await this.rtmService.validateRTM(projectId);

      return {
        success: true,
        message: 'Mapeamento removido com sucesso',
        requirement: {
          id: (result as RequirementDocument)._id?.toString(),
          description: result.description,
          traceableItems: result.traceableItems,
          status: result.status,
        },
        validation,
      };
    } catch (error: any) {
      this.logger.error(`[unmap-req] projectId=${projectId} erro: ${error?.message}`);
      return { success: false, error: error?.message };
    }
  }

  /**
   * Deletar um requisito
   */
  @Delete('requirements/:requirementId')
  @ApiOperation({
    summary: 'Deletar requisito',
    description: 'Remove um requisito do projeto.',
  })
  @ApiResponse({
    status: 200,
    description: 'Requisito deletado com sucesso',
  })
  async deleteRequirement(@Param('requirementId') requirementId: string) {
    this.logger.log(`[delete-req] req=${requirementId}`);

    try {
      const deleted = await this.rtmService.deleteRequirement(requirementId);

      if (!deleted) {
        return { success: false, message: 'Requisito não encontrado' };
      }

      return { success: true, message: 'Requisito deletado com sucesso' };
    } catch (error: any) {
      this.logger.error(`[delete-req] erro: ${error?.message}`);
      return { success: false, error: error?.message };
    }
  }

  /**
   * Deletar todos os requisitos de um projeto
   */
  @Delete(':projectId/requirements')
  @ApiOperation({
    summary: 'Deletar todos os requisitos do projeto',
    description: 'Remove todos os requisitos de um projeto.',
  })
  @ApiResponse({
    status: 200,
    description: 'Todos os requisitos deletados com sucesso',
  })
  async deleteAllRequirements(@Param('projectId') projectId: string) {
    this.logger.log(`[delete-all-req] projectId=${projectId}`);

    try {
      const count = await this.rtmService.deleteAllRequirements(projectId);

      return {
        success: true,
        message: `${count} requisito(s) deletado(s) com sucesso`,
        count,
      };
    } catch (error: any) {
      this.logger.error(`[delete-all-req] projectId=${projectId} erro: ${error?.message}`);
      return { success: false, error: error?.message };
    }
  }

  /**
   * Listar todos os requisitos de um projeto
   */
  @Get(':projectId/requirements')
  @ApiOperation({
    summary: 'Listar requisitos do projeto',
    description: 'Retorna todos os requisitos de um projeto.',
  })
  @ApiResponse({
    status: 200,
    description: 'Requisitos retornados com sucesso',
  })
  async getRequirements(@Param('projectId') projectId: string) {
    try {
      const requirements = await this.rtmService.getRequirements(projectId);
      const validation = await this.rtmService.validateRTM(projectId);

      return {
        success: true,
        count: requirements.length,
        requirements: requirements.map((req: any) => ({
          id: req._id?.toString() || req.id,
          description: req.description,
          type: req.type,
          status: req.status,
          traceableItems: req.traceableItems,
        })),
        validation,
      };
    } catch (error: any) {
      this.logger.error(`[list-req] projectId=${projectId} erro: ${error?.message}`);
      return { success: false, error: error?.message };
    }
  }

  /**
   * Auto-mapeia requisitos para tarefas usando IA (100% cobertura)
   */
  @Post(':projectId/requirements/auto-map')
  @ApiOperation({
    summary: 'Auto-mapear requisitos para tarefas com IA',
    description:
      'Usa IA para mapear automaticamente cada tarefa a um requisito. Cria novos requisitos para tarefas órfãs. Atinge 100% de cobertura.',
  })
  @ApiResponse({
    status: 200,
    description: 'Mapeamento automático concluído com sucesso',
  })
  async autoMapRequirementsToTasks(@Param('projectId') projectId: string) {
    const startedAt = Date.now();

    this.logger.log(`[auto-map] projectId=${projectId} iniciando mapeamento automático`);

    try {
      // 1. Buscar tarefas do projeto
      const tasks = await this.tasksService.findByProjectId(projectId);

      if (tasks.length === 0) {
        return {
          success: false,
          message: 'Nenhuma tarefa encontrada no projeto.',
          mappedCount: 0,
          createdRequirementsCount: 0,
          coverage: 0,
        };
      }

      // 2. Executar mapeamento automático
      const result = await this.rtmService.autoMapRequirementsToTasks(projectId, tasks);

      this.logger.log(
        `[auto-map] projectId=${projectId} resultado: ${result.mappedCount} mapeadas, ${result.createdRequirementsCount} novos req, ${result.coverage}% cobertura - ${
          Date.now() - startedAt
        }ms`,
      );

      return {
        success: true,
        message: result.message,
        mappedCount: result.mappedCount,
        createdRequirementsCount: result.createdRequirementsCount,
        coverage: result.coverage,
        validation: result.validation,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      this.logger.error(`[auto-map] projectId=${projectId} erro: ${error?.message}`);
      return {
        success: false,
        error: error?.message,
        mappedCount: 0,
        createdRequirementsCount: 0,
        coverage: 0,
      };
    }
  }

  /**
   * Gera tarefas para requisitos não-mapeados
   */
  @Post(':projectId/tasks/auto-generate-from-unmapped-requirements')
  @ApiOperation({
    summary: 'Gerar tarefas para requisitos órfãos',
    description:
      'Para cada requisito que não possui tarefa mapeada, usa IA para gerar 1-2 tarefas práticas que o atendem.',
  })
  @ApiResponse({
    status: 200,
    description: 'Tarefas geradas e mapeadas com sucesso',
  })
  async generateTasksForUnmappedRequirements(@Param('projectId') projectId: string) {
    const startedAt = Date.now();

    this.logger.log(
      `[gen-tasks] projectId=${projectId} gerando tarefas para requisitos órfãos`,
    );

    try {
      const result = await this.rtmService.generateTasksForUnmappedRequirements(projectId);

      this.logger.log(
        `[gen-tasks] projectId=${projectId} resultado: ${result.createdTasksCount} tarefas criadas, ${result.coverage}% cobertura - ${
          Date.now() - startedAt
        }ms`,
      );

      return {
        success: true,
        message: result.message,
        createdTasksCount: result.createdTasksCount,
        coverage: result.coverage,
        validation: result.validation,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      this.logger.error(
        `[gen-tasks] projectId=${projectId} erro: ${error?.message}`,
      );
      return {
        success: false,
        error: error?.message,
        createdTasksCount: 0,
        coverage: 0,
      };
    }
  }
}
