import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ProjectWave, ProjectWaveDocument, WaveSlice } from '../../schemas/project-wave.schema';
import { TaskDocument } from '../../../tasks/schemas/task.schema';
import { ProjectsService } from '../../projects.service';
import { WBSService } from '../wbs/core/wbs.service';
import { WBSNodeDto } from '../../dto/wbs.dto';
import { getLeafNodesWithPaths } from '../wbs/utils/wbs-helpers.util';

type SliceDoc = WaveSlice & { _id: Types.ObjectId };

/** Item de detalhamento: o formato `LeafNode` que o diálogo interativo já consome. */
export interface WaveDetailItem {
  sliceId: string;
  node: WBSNodeDto;
  path: string;
  level: number;
  sliceIndex: number;
  sliceCount: number;
  goal: string;
}

export interface GenerateSliceTasksPreferences {
  targetPomodoros?: number;
  workflowMix?: Record<string, number>;
  modelOverride?: string;
  regenerateNonce?: string;
}

/**
 * Rolling Wave, segunda etapa: transforma as fatias de uma onda em micro-tarefas.
 * Só a onda atual e a seguinte (o horizonte) podem ser detalhadas.
 */
@Injectable()
export class WaveDetailingService {
  constructor(
    @InjectModel(ProjectWave.name) private readonly waveModel: Model<ProjectWaveDocument>,
    @InjectModel('Task') private readonly taskModel: Model<TaskDocument>,
    private readonly projectsService: ProjectsService,
    private readonly wbsService: WBSService,
  ) {}

  /** Onda atual (ativa, ou a primeira não concluída) e a seguinte. */
  async getHorizonWaveIds(projectId: string): Promise<string[]> {
    const waves = await this.waveModel
      .find({ projectId: new Types.ObjectId(projectId) })
      .sort({ waveNumber: 1 })
      .exec();
    let current = waves.findIndex((w) => w.status === 'active');
    if (current < 0) current = waves.findIndex((w) => w.status !== 'completed');
    if (current < 0) return [];
    return waves.slice(current, current + 2).map((w) => String(w._id));
  }

  async getDetailItems(projectId: string, waveId: string): Promise<WaveDetailItem[]> {
    const wave = await this.getWaveInHorizon(projectId, waveId);
    const packages = await this.getPackageInfo(projectId);
    const previousGoals = await this.getPreviousGoalsBySlice(projectId, wave);

    return (wave.slices as SliceDoc[])
      .filter((slice) => slice.status === 'planned')
      .map((slice) => ({
        sliceId: String(slice._id),
        node: this.buildSliceNode(
          slice,
          packages.get(slice.wbsNodeId),
          previousGoals.get(String(slice._id)) ?? [],
        ),
        path: slice.wbsPath,
        level: packages.get(slice.wbsNodeId)?.level ?? 1,
        sliceIndex: slice.sliceIndex,
        sliceCount: slice.sliceCount,
        goal: slice.goal,
      }));
  }

  /** Pré-visualização das micro-tarefas de uma fatia (não salva nada). */
  async generateSliceTasks(
    projectId: string,
    waveId: string,
    sliceId: string,
    preferences: GenerateSliceTasksPreferences = {},
  ) {
    const wave = await this.getWaveInHorizon(projectId, waveId);
    const slice = this.findSlice(wave, sliceId);
    const project = await this.projectsService.findOne(projectId);
    if (!project) throw new NotFoundException('Projeto não encontrado');

    const packages = await this.getPackageInfo(projectId);
    const previousGoals = await this.getPreviousGoalsBySlice(projectId, wave);
    const node = this.buildSliceNode(
      slice,
      packages.get(slice.wbsNodeId),
      previousGoals.get(sliceId) ?? [],
    );

    // Títulos já existentes no pacote (fatias anteriores): a geração não deve repeti-los.
    const existing = await this.taskModel
      .find({ project: new Types.ObjectId(projectId), parentWbsNodeId: slice.wbsNodeId }, { name: 1 })
      .lean()
      .exec();
    const avoidTaskTitles = existing.map((t) => String(t.name || '')).filter(Boolean);

    const result = await this.wbsService.generateTasksForSingleLeaf({
      leafNode: node,
      nodePath: slice.wbsPath,
      projectId,
      project,
      preferences,
      saveTasks: false,
      avoidTaskTitles,
    });

    const tasks = (result.tasks || []).map((task: Record<string, unknown>) => ({
      ...task,
      waveId,
      waveSliceId: sliceId,
    }));
    return { ...result, tasks, sliceId, waveId };
  }

  /**
   * Fecha o detalhamento: vincula às fatias as tarefas já salvas com `waveSliceId` e marca essas
   * fatias como detalhadas. Idempotente (deriva tudo do banco). Também aplica re-baselines.
   */
  async commitTasks(
    projectId: string,
    waveId: string,
    sliceHours: Array<{ sliceId: string; hours: number }> = [],
  ): Promise<ProjectWaveDocument> {
    const wave = await this.getWave(projectId, waveId);
    const tasks = await this.taskModel
      .find({ project: new Types.ObjectId(projectId), waveId }, { _id: 1, waveSliceId: 1 })
      .lean()
      .exec();

    const idsBySlice = new Map<string, Types.ObjectId[]>();
    for (const task of tasks) {
      const key = String(task.waveSliceId || '');
      if (!key) continue;
      const list = idsBySlice.get(key) ?? [];
      list.push(task._id);
      idsBySlice.set(key, list);
    }
    const hoursBySlice = new Map(sliceHours.map((s) => [String(s.sliceId), Number(s.hours)]));

    for (const slice of wave.slices as SliceDoc[]) {
      const id = String(slice._id);
      const ids = idsBySlice.get(id);
      if (ids?.length) {
        slice.taskIds = ids;
        slice.status = 'detailed';
      }
      const newHours = hoursBySlice.get(id);
      if (Number.isFinite(newHours) && (newHours as number) > 0) {
        slice.hours = Math.round((newHours as number) * 2) / 2;
      }
    }

    const allIds = new Map<string, Types.ObjectId>();
    for (const id of wave.taskIds || []) allIds.set(String(id), id);
    for (const slice of wave.slices) for (const id of slice.taskIds || []) allIds.set(String(id), id);
    wave.taskIds = Array.from(allIds.values());

    wave.markModified('slices');
    await wave.save();
    return wave;
  }

  // ---------------------------------------------------------------- helpers

  /** Nó-fatia: o pacote com as horas da fatia e o escopo dela explícito na descrição. */
  buildSliceNode(
    slice: WaveSlice & { _id?: Types.ObjectId },
    pkg: { description?: string; level?: number } | undefined,
    previousGoals: string[],
  ): WBSNodeDto {
    const lines = [String(pkg?.description || '').trim()];
    if (slice.sliceCount > 1) {
      lines.push(`Escopo desta fatia (${slice.sliceIndex}/${slice.sliceCount}): ${slice.goal}`);
      if (previousGoals.length) {
        lines.push(`Já coberto nas fatias anteriores (não repetir): ${previousGoals.join('; ')}`);
      }
    } else if (slice.goal) {
      lines.push(`Escopo: ${slice.goal}`);
    }
    return {
      _id: slice.wbsNodeId,
      name: slice.packageName,
      description: lines.filter(Boolean).join('\n'),
      level: pkg?.level ?? 1,
      estimatedHours: slice.hours,
      children: [],
    };
  }

  private async getWave(projectId: string, waveId: string): Promise<ProjectWaveDocument> {
    if (!Types.ObjectId.isValid(waveId)) throw new NotFoundException('Onda não encontrada');
    const wave = await this.waveModel
      .findOne({ _id: waveId, projectId: new Types.ObjectId(projectId) })
      .exec();
    if (!wave) throw new NotFoundException('Onda não encontrada');
    return wave;
  }

  private async getWaveInHorizon(projectId: string, waveId: string): Promise<ProjectWaveDocument> {
    const wave = await this.getWave(projectId, waveId);
    const horizon = await this.getHorizonWaveIds(projectId);
    if (!horizon.includes(String(wave._id))) {
      throw new ConflictException(
        `A onda ${wave.waveNumber} está fora do horizonte de detalhamento (onda atual e a seguinte). ` +
          'Ela será detalhada quando as anteriores avançarem.',
      );
    }
    return wave;
  }

  private findSlice(wave: ProjectWaveDocument, sliceId: string): SliceDoc {
    const slice = (wave.slices as SliceDoc[]).find((s) => String(s._id) === sliceId);
    if (!slice) throw new NotFoundException('Fatia não encontrada nesta onda');
    return slice;
  }

  private async getPackageInfo(
    projectId: string,
  ): Promise<Map<string, { description?: string; level: number }>> {
    const tree = await this.wbsService.getWBS(projectId);
    return new Map(
      getLeafNodesWithPaths(tree || []).map(({ node, level }) => [
        String(node._id),
        { description: node.description, level },
      ]),
    );
  }

  /** Objetivos das fatias anteriores do mesmo pacote (em qualquer onda), por fatia desta onda. */
  private async getPreviousGoalsBySlice(
    projectId: string,
    wave: ProjectWaveDocument,
  ): Promise<Map<string, string[]>> {
    const waves = await this.waveModel
      .find({ projectId: new Types.ObjectId(projectId) }, { slices: 1 })
      .lean()
      .exec();
    const goalsByPackage = new Map<string, Array<{ index: number; goal: string }>>();
    for (const w of waves) {
      for (const s of w.slices || []) {
        const list = goalsByPackage.get(s.wbsNodeId) ?? [];
        list.push({ index: s.sliceIndex, goal: s.goal });
        goalsByPackage.set(s.wbsNodeId, list);
      }
    }
    const result = new Map<string, string[]>();
    for (const slice of wave.slices as SliceDoc[]) {
      const previous = (goalsByPackage.get(slice.wbsNodeId) ?? [])
        .filter((g) => g.index < slice.sliceIndex && g.goal)
        .sort((a, b) => a.index - b.index)
        .map((g) => g.goal);
      result.set(String(slice._id), previous);
    }
    return result;
  }
}
