import { Controller, Get, Post, Param, Body, Logger, Inject, forwardRef } from '@nestjs/common';
import { BufferService, TaskNode, CPMAnalysis } from '../services/analysis';
import { CPMService } from '../services/dependencies';
import type { TaskMetrics as BufferTaskMetrics } from '../services/analysis/buffer.service';
import { TasksService } from '../tasks.service';

@Controller('buffers')
export class BufferController {
  private readonly logger = new Logger(BufferController.name);

  constructor(
    private bufferService: BufferService,
    private cpmService: CPMService,
    private tasksService: TasksService,
  ) {}

  /**
   * POST /buffers/projects/:projectId/calculate
   * Calcula el buffer del proyecto basado en el análisis CPM
   */
  @Post('projects/:projectId/calculate')
  async calculateProjectBuffer(@Param('projectId') projectId: string) {
    try {
      // Buscar todas las tarefas del proyecto con sus duraciones PERT
      const tasks = await this.tasksService.findByProjectId(projectId);

      // Convertir a TaskNode
      const taskNodes: TaskNode[] = tasks.map((task: any) => ({
        id: task._id?.toString() || task.id,
        name: task.title || task.name || 'Task',
        duration: task.pertExpectedMinutes || task.estimatedMinutes || 60,
        dependencies: [],
      }));

      // Buscar todas las dependencias del proyecto
      const dependencies = await this.cpmService.getDependencies(projectId);

      // Llenar las dependencias en TaskNodes
      const nodeById = new Map<string, TaskNode>();
      for (const n of taskNodes) nodeById.set(n.id, n);

      for (const dep of dependencies as any[]) {
        const taskId = String(dep?.taskId ?? '').trim();
        const depId = String(dep?.dependsOnTaskId ?? '').trim();
        if (!taskId || !depId) continue;
        const taskNode = nodeById.get(taskId);
        if (taskNode) taskNode.dependencies.push(depId);
      }

      // Calcular CPM
      const analysis: CPMAnalysis = this.cpmService.calculateCriticalPath(taskNodes);

      // Convertir a TaskMetrics para BufferService
      const taskMetrics: BufferTaskMetrics[] = (analysis.tasksByImpact || []).map((task: any) => ({
        taskId: task.id,
        estimatedHours: task.duration || 0,
        variance: task.variance || 0,
        isCritical: task.isCritical,
      }));

      // Calcular buffer
      const buffer = await this.bufferService.calculateProjectBuffer(
        projectId,
        taskMetrics,
        analysis.criticalPath,
      );

      if (!buffer) {
        return {
          success: false,
          error: 'No se pudo calcular el buffer',
        };
      }

      return {
        success: true,
        buffer: {
          projectId: buffer.projectId,
          totalBuffer: buffer.projectBuffer,
          criticalPathDuration: buffer.criticalPathDuration,
          totalVariance: buffer.totalVariance,
          standardDeviation: buffer.standardDeviation,
          message: `Buffer calculado: ${buffer.projectBuffer}h (50% de ${buffer.criticalPathDuration}h)`,
        },
      };
    } catch (error: any) {
      this.logger.error(`Error calculando buffer: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * GET /buffers/projects/:projectId/status
   * Obtiene el estado actual del buffer
   */
  @Get('projects/:projectId/status')
  async getBufferStatus(@Param('projectId') projectId: string) {
    try {
      const status = await this.bufferService.getBufferStatus(projectId);
      const alerts = await this.bufferService.checkBufferHealth(projectId);

      return {
        success: true,
        status: {
          total: status.total,
          consumed: status.consumed,
          remaining: status.remaining,
          percentageUsed: status.percentageUsed,
          isAlert: status.isAlert,
          alerts,
        },
      };
    } catch (error: any) {
      this.logger.error(`Error obteniendo status del buffer: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * POST /buffers/projects/:projectId/consume
   * Registra consumo de buffer (cuando se completan tareas)
   */
  @Post('projects/:projectId/consume')
  async consumeBuffer(@Param('projectId') projectId: string, @Body() body: { hoursUsed: number }) {
    try {
      const status = await this.bufferService.consumeBuffer(projectId, body.hoursUsed);

      return {
        success: true,
        status: {
          total: status.total,
          consumed: status.consumed,
          remaining: status.remaining,
          percentageUsed: status.percentageUsed,
          isAlert: status.isAlert,
          message: `Buffer actualizado: ${status.consumed}h/${status.total}h consumido (${status.percentageUsed}%)`,
        },
      };
    } catch (error: any) {
      this.logger.error(`Error consumiendo buffer: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * GET /buffers/projects/:projectId/health
   * Obtiene alertas sobre la salud del buffer
   */
  @Get('projects/:projectId/health')
  async checkBufferHealth(@Param('projectId') projectId: string) {
    try {
      const alerts = await this.bufferService.checkBufferHealth(projectId);
      const status = await this.bufferService.getBufferStatus(projectId);

      return {
        success: true,
        health: {
          alerts,
          status: {
            percentageUsed: status.percentageUsed,
            isHealthy: status.percentageUsed < 50,
            isWarning: status.percentageUsed >= 50 && status.percentageUsed < 75,
            isCritical: status.percentageUsed >= 75,
          },
        },
      };
    } catch (error: any) {
      this.logger.error(`Error verificando salud del buffer: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * POST /buffers/projects/:projectId/reset
   * Reseta el consumo de buffer (para fines de prueba/recálculo)
   */
  @Post('projects/:projectId/reset')
  async resetBufferConsumption(@Param('projectId') projectId: string) {
    try {
      await this.bufferService.resetBufferConsumption(projectId);

      return {
        success: true,
        message: `Buffer reseteado para proyecto: ${projectId}`,
      };
    } catch (error: any) {
      this.logger.error(`Error reseteando buffer: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * GET /buffers/projects/:projectId/history
   * Obtiene el histórico de consumo del buffer
   */
  @Get('projects/:projectId/history')
  async getBufferHistory(@Param('projectId') projectId: string) {
    try {
      const history = await this.bufferService.getBufferHistory(projectId);

      return {
        success: true,
        history,
      };
    } catch (error: any) {
      this.logger.error(`Error obteniendo histórico del buffer: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
}
