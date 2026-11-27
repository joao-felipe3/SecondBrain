import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ProjectWave, ProjectWaveDocument, WaveSlice } from '../../schemas/project-wave.schema';
import { ProjectsService } from '../../projects.service';
import { WBSService } from '../wbs/core/wbs.service';
import { RollingWaveAIService } from '../../../ai/services/projects/rolling-wave-ai.service';
import { DeterministicProjectInput } from '../../interfaces/rolling-wave.interface';
import { UpdateProjectDto } from '../../dto/update-project.dto';
import { WBSNodeDto } from '../../dto/wbs.dto';
import { getLeafNodesWithPaths } from '../wbs/utils/wbs-helpers.util';
import { estimateTaskHours } from './utils/rolling-wave-helpers.util';
import {
  PlannedSlice,
  SlicingPackage,
  resolveWaveTargetHours,
  scheduleWaves,
  describeWaveFromSlices,
  roundToHalf,
  sliceWbsPackagesIntoWaves,
} from './utils/wave-slicing.util';

/** Horas abaixo disso não viram fatia (sobra de arredondamento). */
const MIN_REMAINING_HOURS = 0.5;

/**
 * Planejamento Rolling Wave a partir da WBS:
 * pacotes folha → fatias (≤20h) distribuídas em ondas pela capacidade diária.
 * Micro-tarefas NÃO são criadas aqui; elas vêm depois, por onda (WaveDetailingService).
 */
/** parentWbsNodeId pode vir como string ou ObjectId. */
function idToString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Types.ObjectId) return value.toHexString();
  return '';
}

@Injectable()
export class RollingWavePlanningService {
  private readonly logger = new Logger(RollingWavePlanningService.name);

  constructor(
    @InjectModel(ProjectWave.name)
    private waveModel: Model<ProjectWaveDocument>,
    private readonly projectsService: ProjectsService,
    private readonly wbsService: WBSService,
    private readonly rollingWaveAIService: RollingWaveAIService,
  ) {}

  /**
   * Planeja (ou replaneja) as ondas. Ondas já iniciadas, concluídas ou com fatias detalhadas
   * são preservadas; só o trabalho ainda não planejado é fatiado em ondas novas depois delas.
   */
  async createInitialWaves(
    projectId: string,
    project: DeterministicProjectInput,
  ): Promise<ProjectWave[]> {
    const dailyCapacityHours = Number(process.env.ROLLING_WAVE_DAILY_CAPACITY_HOURS || 6);
    const waveTargetHours = resolveWaveTargetHours(process.env.ROLLING_WAVE_TARGET_HOURS);
    const projectObjectId = new Types.ObjectId(projectId);

    const existing = await this.waveModel
      .find({ projectId: projectObjectId })
      .sort({ waveNumber: 1 })
      .exec();
    const kept = existing.filter((w) => this.isWaveLocked(w));
    const replaceable = existing.filter((w) => !this.isWaveLocked(w));

    const wbsTree = await this.wbsService.getWBS(projectId);
    const tasks = await this.projectsService.getTasksForProject(projectId);
    const packages = this.buildSlicingPackages(wbsTree, tasks, kept);
    const totalHours = packages.reduce((sum, p) => sum + p.remainingHours, 0);

    if (replaceable.length > 0) {
      await this.waveModel.deleteMany({ _id: { $in: replaceable.map((w) => w._id) } }).exec();
    }
    if (totalHours < MIN_REMAINING_HOURS) {
      this.logger.debug(
        `[waves] ${projectId}: nada a planejar (todas as horas já planejadas/detalhadas)`,
      );
      return this.waveModel.find({ projectId: projectObjectId }).sort({ waveNumber: 1 }).exec();
    }

    const today = new Date();
    const lastKept = kept[kept.length - 1];
    const startDate = lastKept && lastKept.endDate > today ? new Date(lastKept.endDate) : today;
    // Ondas pequenas (≈ meta de horas) e equilibradas; as datas vêm depois, proporcionais à carga.
    const slicesByWave = sliceWbsPackagesIntoWaves(packages, waveTargetHours);
    const structure = scheduleWaves({
      waveHours: slicesByWave.map((slices) => slices.reduce((sum, sl) => sum + sl.hours, 0)),
      startDate,
      deadline: project?.deadline ?? null,
      dailyCapacityHours,
    });

    if (structure.adjustedDeadline) {
      const updateDto: UpdateProjectDto = { deadline: structure.adjustedDeadline };
      await this.projectsService.update(projectId, updateDto);
      this.logger.warn(
        `Prazo ajustado para ${structure.adjustedDeadline.toISOString()} (capacidade de ${dailyCapacityHours}h/dia)`,
      );
    }

    await this.applySliceGoals(project, packages, slicesByWave);

    const firstNumber = (lastKept?.waveNumber ?? 0) + 1;
    for (let i = 0; i < structure.waves.length; i++) {
      const slot = structure.waves[i];
      const slices = slicesByWave[i];
      await new this.waveModel({
        projectId: projectObjectId,
        waveNumber: firstNumber + i,
        startDate: slot.startDate,
        endDate: slot.endDate,
        status: 'planned',
        taskIds: [],
        description: describeWaveFromSlices(slices),
        slices: slices.map((s) => this.toSliceDoc(s)),
      }).save();
    }

    this.logger.debug(
      `[waves] ${projectId}: ${structure.waves.length} ondas novas, ${packages.length} pacotes, ${roundToHalf(totalHours)}h`,
    );
    return this.waveModel.find({ projectId: projectObjectId }).sort({ waveNumber: 1 }).exec();
  }

  /** Onda que não pode ser refeita: em andamento, concluída, com fatia detalhada ou do fluxo antigo. */
  private isWaveLocked(wave: ProjectWaveDocument): boolean {
    if (wave.status !== 'planned') return true;
    const slices = wave.slices || [];
    if (slices.some((s) => s.status === 'detailed')) return true;
    return slices.length === 0 && (wave.taskIds || []).length > 0;
  }

  /**
   * Horas restantes de cada pacote folha = estimativa − horas das tarefas já criadas para ele
   * − horas de fatias ainda planejadas em ondas preservadas.
   */
  private buildSlicingPackages(
    wbsTree: WBSNodeDto[],
    tasks: Array<{ parentWbsNodeId?: unknown; pertExpectedMinutes?: number; pomodorosPlanned?: number }>,
    keptWaves: ProjectWaveDocument[],
  ): SlicingPackage[] {
    const usedHours = new Map<string, number>();
    const add = (id: string, hours: number) => usedHours.set(id, (usedHours.get(id) ?? 0) + hours);

    for (const task of tasks || []) {
      const id = idToString(task?.parentWbsNodeId);
      if (id) add(id, estimateTaskHours(task as Parameters<typeof estimateTaskHours>[0]));
    }
    for (const wave of keptWaves) {
      for (const slice of wave.slices || []) {
        if (slice.status === 'planned') add(String(slice.wbsNodeId), Number(slice.hours) || 0);
      }
    }

    return getLeafNodesWithPaths(wbsTree || [])
      .map(({ node, path }) => {
        const id = node._id ? String(node._id) : '';
        const remaining = roundToHalf(Number(node.estimatedHours || 0) - (usedHours.get(id) ?? 0));
        return {
          wbsNodeId: id,
          wbsPath: path,
          packageName: node.name,
          description: node.description,
          branchKey: path.split(' > ')[0] || path,
          remainingHours: remaining,
        };
      })
      .filter((p) => p.wbsNodeId && p.remainingHours >= MIN_REMAINING_HOURS);
  }

  /** Troca os objetivos provisórios ("Parte n/m") pelos escritos pela IA, quando houver. */
  private async applySliceGoals(
    project: DeterministicProjectInput,
    packages: SlicingPackage[],
    slicesByWave: PlannedSlice[][],
  ): Promise<void> {
    const allSlices = slicesByWave.flat();
    const sliceHours = new Map<string, number[]>();
    for (const s of allSlices) {
      if (s.sliceCount < 2) continue;
      const list = sliceHours.get(s.wbsNodeId) ?? [];
      list[s.sliceIndex - 1] = s.hours;
      sliceHours.set(s.wbsNodeId, list);
    }
    if (sliceHours.size === 0) return;

    const goals = await this.rollingWaveAIService.describeSlices({
      projectName: String(project?.name || 'Projeto'),
      projectSummary: project?.smartObjective?.summary || project?.description || undefined,
      packages: packages
        .filter((p) => sliceHours.has(p.wbsNodeId))
        .map((p) => ({
          id: p.wbsNodeId,
          path: p.wbsPath,
          name: p.packageName,
          description: p.description,
          branchKey: p.branchKey,
          sliceHours: sliceHours.get(p.wbsNodeId) ?? [],
        })),
    });

    for (const slice of allSlices) {
      const list = goals.get(slice.wbsNodeId);
      if (list?.[slice.sliceIndex - 1]) slice.goal = list[slice.sliceIndex - 1];
    }
  }

  private toSliceDoc(slice: PlannedSlice): WaveSlice {
    return {
      wbsNodeId: slice.wbsNodeId,
      wbsPath: slice.wbsPath,
      packageName: slice.packageName,
      sliceIndex: slice.sliceIndex,
      sliceCount: slice.sliceCount,
      goal: slice.goal,
      hours: slice.hours,
      status: 'planned',
      taskIds: [],
    };
  }
}
