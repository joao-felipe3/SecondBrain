import { Injectable, Logger } from '@nestjs/common';
import { GeminiService } from '../core/gemini.service';
import {
  buildPlanWaveStructurePrompt,
  buildPlanWaveGroupingPrompt,
} from '../../prompts';
import {
  AIPlan,
  AIWaveStructure,
  PlanWaveStructureParams,
  PlanWaveGroupingParams,
} from '../../../projects/interfaces/rolling-wave.interface';
import {
  estimateTaskHours,
  buildBalancedWaveDurations,
  normalizeWavePlanShape,
} from '../../../projects/services/strategy/utils/rolling-wave-helpers.util';
import { extractAndValidateJSON } from '../../utils/json-sanitizer.util';
import { rebalanceWaveDistribution } from '../../utils/rolling-wave-rebalance.helper';

@Injectable()
export class RollingWaveAIService {
  private readonly logger = new Logger(RollingWaveAIService.name);

  constructor(private readonly geminiService: GeminiService) {}

  /**
   * Determinar número ideal de ondas
   */
  async planWaveStructure(params: PlanWaveStructureParams): Promise<AIWaveStructure | null> {
    const { project, tasks, dailyCapacityHours } = params;
    try {
      const modelName = process.env.GEMINI_MODEL || 'gemma-3-27b-it';

      const today = new Date();
      const deadline = new Date(project.deadline);
      const availableDays = Math.ceil((deadline.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
      const totalTaskHours = tasks.reduce((sum, t) => sum + estimateTaskHours(t), 0);

      const prompt = buildPlanWaveStructurePrompt({
        projectName: project.name || 'Sem nome',
        todayIso: today.toISOString().split('T')[0],
        deadlineIso: deadline.toISOString().split('T')[0],
        availableDays,
        taskCount: tasks.length,
        totalTaskHours,
        dailyCapacityHours,
      });

      const responseText = await this.geminiService.generateContent(prompt, { model: modelName });

      const parsed = extractAndValidateJSON<AIWaveStructure>(
        responseText,
        ['recommendedWaveCount', 'totalDurationDays', 'description', 'reasoning'],
        this.logger,
      );

      if (!parsed) {
        this.logger.warn(
          `[PARSE_ERROR] planWaveStructure: Resposta inválida.\nRaw: ${responseText.substring(0, 500)}`,
        );
        return null;
      }

      if (
        !parsed.recommendedWaveCount ||
        !parsed.totalDurationDays ||
        parsed.totalDurationDays < availableDays
      ) {
        this.logger.warn(
          `[VALIDATION_ERROR] planWaveStructure: Valores inválidos. waveCount=${parsed.recommendedWaveCount}, totalDays=${parsed.totalDurationDays}, required=${availableDays}`,
        );
        return null;
      }

      this.logger.debug(
        `Estrutura de ondas sugerida: ${parsed.recommendedWaveCount} ondas em ${parsed.totalDurationDays} dias`,
      );
      return parsed;
    } catch (error: any) {
      this.logger.warn(`Erro ao chamar Gemini para estrutura: ${error.message}`);
      return null;
    }
  }

  /**
   * Determinar alocação de WBS para cada onda
   */
  async planWaveGrouping(params: PlanWaveGroupingParams): Promise<AIPlan | null> {
    const { project, tasks, waveCount, wbsTree, dailyCapacityHours } = params;
    try {
      const modelName = process.env.GEMINI_STRONG_MODEL || 'gemini-2.5-flash-lite';

      const today = new Date();
      const deadline = new Date(project.deadline);
      const totalAvailableDays = Math.ceil(
        (deadline.getTime() - today.getTime()) / (24 * 60 * 60 * 1000),
      );
      const waveDurations = buildBalancedWaveDurations(totalAvailableDays, waveCount);

      const totalTasks = tasks.length;
      const tasksPerWave = Math.ceil(totalTasks / waveCount);
      const minTasksPerWave = Math.max(1, Math.floor(tasksPerWave * 0.8));
      const maxTasksPerWave = Math.ceil(tasksPerWave * 1.2);

      this.logger.debug(
        `[DISTRIBUTION] Total tasks: ${totalTasks}, waves: ${waveCount}, target: ${tasksPerWave}±20% (${minTasksPerWave}-${maxTasksPerWave})`,
      );

      const wbsTaskCount = new Map<string, number>();
      const tasksByWbs = new Map<string, any[]>();

      for (const task of tasks) {
        const wbsPath = task.wbsPath || 'SEM_WBS';
        wbsTaskCount.set(wbsPath, (wbsTaskCount.get(wbsPath) || 0) + 1);

        if (!tasksByWbs.has(wbsPath)) {
          tasksByWbs.set(wbsPath, []);
        }
        tasksByWbs.get(wbsPath)!.push(task);
      }

      const wbsDistribution = Array.from(wbsTaskCount.entries())
        .map(([wbs, count]) => ({ wbs, count }))
        .sort((a, b) => b.count - a.count);

      const taskExamplesByWbs = new Map<string, string[]>();
      for (const [wbs, taskList] of tasksByWbs.entries()) {
        taskExamplesByWbs.set(
          wbs,
          taskList.slice(0, 5).map((t) => t.name || 'sem título'),
        );
      }

      const wbsWithExamples = wbsDistribution.map((item) => ({
        wbs: item.wbs,
        count: item.count,
        examples: (taskExamplesByWbs.get(item.wbs) || []).slice(0, 3),
      }));

      const prompt = buildPlanWaveGroupingPrompt({
        projectName: project.name || 'Sem nome',
        totalAvailableDays,
        waveCount,
        totalTasks,
        tasksPerWave,
        minTasksPerWave,
        maxTasksPerWave,
        waveDurations,
        wbsWithExamples,
      });

      const responseText = await this.geminiService.generateContent(prompt, { model: modelName });

      const parsed = extractAndValidateJSON<AIPlan>(responseText, ['waves', 'rationale'], this.logger);

      if (!parsed || !parsed.waves || parsed.waves.length === 0) {
        this.logger.warn(
          `[PARSE_ERROR] planWaveGrouping: Resposta inválida.\nRaw: ${responseText.substring(0, 500)}`,
        );
        return null;
      }

      if (parsed.waves.length !== waveCount) {
        this.logger.warn(
          `[WAVE_COUNT_MISMATCH] Gemini retornou ${parsed.waves.length} ondas, mas eras esperadas ${waveCount}. O plano será normalizado.`,
        );
      }

      const normalizedPlan = normalizeWavePlanShape(parsed, waveCount, totalAvailableDays);
      const taskCursorByWbs = new Map<string, number>();

      for (const wave of normalizedPlan.waves) {
        const taskIds: string[] = [];
        const wbsAllocation = wave.wbsAllocation || {};
        for (const [wbs, quantityNeeded] of Object.entries(wbsAllocation)) {
          const tasksInWbs = tasksByWbs.get(wbs) || [];
          const startIndex = taskCursorByWbs.get(wbs) || 0;
          const safeQuantityNeeded = Math.max(0, Number(quantityNeeded) || 0);

          const selectedTasks = tasksInWbs.slice(startIndex, startIndex + safeQuantityNeeded);

          for (const task of selectedTasks) {
            taskIds.push(String(task._id || task.id));
          }

          taskCursorByWbs.set(wbs, startIndex + selectedTasks.length);

          if (selectedTasks.length < safeQuantityNeeded) {
            this.logger.warn(
              `[WBS_ALLOCATION_SHORTFALL] Wave ${wave.waveNumber}: WBS "${wbs}" pediu ${safeQuantityNeeded}, mas só ${selectedTasks.length} tarefas estavam disponíveis.`,
            );
          }
        }

        wave.taskIds = taskIds;
      }

      this.logger.debug(
        `[GEMINI] Agrupamento (WBS-based) retornou: ${normalizedPlan.waves.length} ondas`,
      );
      for (const wave of normalizedPlan.waves) {
        const wbsList = Object.entries(wave.wbsAllocation || {})
          .map(([w, c]) => `${w}(${c})`)
          .join(', ');
        this.logger.debug(
          `[GEMINI] Wave ${wave.waveNumber}: ${wave.durationDays}d, ${wave.taskIds.length} tasks | Desc: "${wave.description}" | WBS=[${wbsList}]`,
        );
      }

      const allTaskIds = tasks.map((t) => String(t._id || t.id));
      const taskCountByWave = normalizedPlan.waves.map((w) => w.taskIds.length);
      const allocatedUniqueTaskIds = new Set(normalizedPlan.waves.flatMap((w) => w.taskIds));
      const missingTaskCount = allTaskIds.length - allocatedUniqueTaskIds.size;
      const unbalancedWaves = taskCountByWave.filter(
        (cnt) => cnt < minTasksPerWave || cnt > maxTasksPerWave,
      );

      if (parsed.waves.length !== waveCount || missingTaskCount > 0 || unbalancedWaves.length > 0) {
        this.logger.warn(
          `[DISTRIBUTION] Plano inválido para persistência direta: mismatchOndas=${parsed.waves.length !== waveCount}, missingTasks=${missingTaskCount}, ondasForaDoRange=${unbalancedWaves.length}. Rebalanceando...`,
        );
        return rebalanceWaveDistribution({
          aiPlan: normalizedPlan,
          allTaskIds,
          minTasksPerWave,
          maxTasksPerWave,
          expectedWaveCount: waveCount,
          totalDurationDays: totalAvailableDays,
          logger: this.logger,
        });
      }

      return normalizedPlan;
    } catch (error: any) {
      this.logger.warn(`Erro ao chamar Gemini para agrupamento WBS: ${error.message}`);
      return null;
    }
  }
}
