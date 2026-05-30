import { InjectModel } from '@nestjs/mongoose';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Model, Types } from 'mongoose';
import { TaskDocument } from '../../tasks/schemas/task.schema';
import { ProjectDocument } from '../schemas/project.schema';
import { ProjectWave, type ProjectWaveDocument } from '../schemas/project-wave.schema';
import { CreateXMatrixDto, type XMatrixResponseDto, type XMatrixStrength } from '../dto/x-matrix.dto';
import { XMatrixSnapshot, type XMatrixSnapshotDocument } from '../schemas/x-matrix-snapshot.schema';

@Injectable()
export class ProjectsXMatrixService {
  constructor(
    @InjectModel('Project')
    private readonly projectModel: Model<ProjectDocument>,
    @InjectModel('Task') private readonly taskModel: Model<TaskDocument>,
    @InjectModel(ProjectWave.name)
    private readonly waveModel: Model<ProjectWaveDocument>,
    @InjectModel(XMatrixSnapshot.name)
    private readonly xMatrixSnapshotModel: Model<XMatrixSnapshotDocument>,
  ) {}

  private splitGoalText(input: string | undefined): string[] {
    const text = String(input || '').trim();
    if (!text) return [];

    const parts = text
      .split(/\n|;|\||•|\u2022|\.|,/g)
      .map((item) => item.trim())
      .filter(Boolean);

    if (parts.length <= 1) return [text];
    return parts;
  }

  private tokenize(text: string): Set<string> {
    const normalized = String(text || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ');

    const stopwords = new Set([
      'de',
      'da',
      'do',
      'das',
      'dos',
      'e',
      'a',
      'o',
      'as',
      'os',
      'um',
      'uma',
      'para',
      'com',
      'por',
      'no',
      'na',
      'nos',
      'nas',
      'em',
      'the',
      'and',
      'to',
      'of',
      'for',
      'in',
      'on',
      'at',
      'is',
      'are',
      'be',
      'ser',
      'estar',
      'que',
    ]);

    const tokens = normalized
      .split(/\s+/g)
      .map((token) => token.trim())
      .filter((token) => token.length >= 3 && !stopwords.has(token));

    return new Set(tokens);
  }

  private scoreStrength(
    fromText: string,
    toText: string,
  ): { strength: XMatrixStrength; score: number; rationale: string } {
    const fromTokens = this.tokenize(fromText);
    const toTokens = this.tokenize(toText);

    if (fromTokens.size === 0 || toTokens.size === 0) {
      return {
        strength: 'none',
        score: 0,
        rationale: 'Sem termos suficientes para correlacionar.',
      };
    }

    let intersection = 0;
    for (const token of fromTokens) {
      if (toTokens.has(token)) intersection += 1;
    }

    const minSize = Math.max(1, Math.min(fromTokens.size, toTokens.size));
    const score = Number((intersection / minSize).toFixed(2));

    if (score >= 0.5) {
      return {
        strength: 'strong',
        score,
        rationale: `Alta convergencia de termos (${intersection}).`,
      };
    }

    if (score >= 0.25) {
      return {
        strength: 'medium',
        score,
        rationale: `Convergencia moderada de termos (${intersection}).`,
      };
    }

    if (score > 0) {
      return {
        strength: 'weak',
        score,
        rationale: `Convergencia fraca de termos (${intersection}).`,
      };
    }

    return {
      strength: 'none',
      score: 0,
      rationale: 'Nao ha intersecao clara de termos.',
    };
  }

  private inferInitiativeFromWbsPath(path: string | undefined, levels: Set<number>): string | null {
    const raw = String(path || '').trim();
    if (!raw) return null;

    const segments = raw
      .split(/\s*(?:>|\/|\||::|->|›|»)\s*/g)
      .map((segment) => segment.trim())
      .filter(Boolean);

    if (segments.length === 0) return null;

    const maxLevel = Math.max(...Array.from(levels.values()), 1);
    const selected = segments.slice(0, Math.min(maxLevel, segments.length));
    return selected.join(' > ');
  }

  async createXMatrix(projectId: string, dto: CreateXMatrixDto): Promise<XMatrixResponseDto> {
    if (
      !projectId ||
      projectId === 'null' ||
      projectId === 'undefined' ||
      !Types.ObjectId.isValid(projectId)
    ) {
      throw new BadRequestException(`ID invalido: ${projectId}`);
    }

    const project = await this.projectModel.findById(projectId).exec();
    if (!project) throw new NotFoundException('Project not found');

    const includeCompleted = dto?.includeCompleted ?? true;
    const maxTacticalItems = Math.max(20, Math.min(160, Number(dto?.maxTacticalItems || 80)));
    const wbsLevels = new Set(
      (dto?.wbsLevels || [1, 2]).filter((level) => Number.isFinite(level) && level >= 1),
    );

    const taskQuery: Record<string, any> = { project: projectId };
    if (!includeCompleted) taskQuery.isConcluded = { $ne: true };
    if (dto?.taskIds?.length) {
      taskQuery._id = {
        $in: dto.taskIds.filter((id) => Types.ObjectId.isValid(id)).map((id) => new Types.ObjectId(id)),
      };
    }

    const [tasks, waves] = await Promise.all([
      this.taskModel.find(taskQuery).exec(),
      this.waveModel
        .find({ projectId: new Types.ObjectId(projectId) })
        .sort({ waveNumber: 1 })
        .exec(),
    ]);

    const strategyFromDto = (dto?.strategy3to5Years || [])
      .map((item) => String(item || '').trim())
      .filter(Boolean);
    const strategyFallback = [
      ...this.splitGoalText(project.longTermGoal),
      ...this.splitGoalText(project.smartObjective?.relevant),
      ...this.splitGoalText(project.smartObjective?.summary),
    ].filter(Boolean);
    const strategyGoalsRaw = strategyFromDto.length ? strategyFromDto : strategyFallback;

    const annualFromDto = (dto?.annualGoals || [])
      .map((item) => String(item || '').trim())
      .filter(Boolean);
    const annualFallback = [
      ...this.splitGoalText(project.shortTermGoal),
      ...this.splitGoalText(project.midTermGoal),
      ...this.splitGoalText(project.smartObjective?.specific),
      ...this.splitGoalText(project.smartObjective?.measurable),
    ].filter(Boolean);
    const annualGoalsRaw = annualFromDto.length ? annualFromDto : annualFallback;

    const dedupe = (items: string[]) => Array.from(new Set(items.map((v) => v.trim()).filter(Boolean)));
    const strategyGoals = dedupe(strategyGoalsRaw).map((label, index) => ({
      id: `S${index + 1}`,
      label,
      source: 'strategy',
    }));

    const annualSeed = annualGoalsRaw.length
      ? annualGoalsRaw
      : waves.map((wave) => {
          const start = wave.startDate ? new Date(wave.startDate).toISOString().slice(0, 10) : null;
          const end = wave.endDate ? new Date(wave.endDate).toISOString().slice(0, 10) : null;
          const range = start && end ? `${start}..${end}` : 'periodo indefinido';
          return `Meta de execucao da Onda ${wave.waveNumber} (${range})`;
        });

    const annualGoals = dedupe(annualSeed).map((label, index) => ({
      id: `A${index + 1}`,
      label,
      source: 'annual',
    }));

    const waveByTaskId = new Map<string, number[]>();
    for (const wave of waves) {
      const waveNumber = Number(wave.waveNumber || 0);
      for (const taskId of wave.taskIds || []) {
        const key = String(taskId);
        const current = waveByTaskId.get(key) || [];
        if (!current.includes(waveNumber)) current.push(waveNumber);
        waveByTaskId.set(key, current);
      }
    }

    type TacticalAgg = {
      id: string;
      label: string;
      taskCount: number;
      descriptions: string[];
      waveNumbers: Set<number>;
    };

    const tacticalById = new Map<string, TacticalAgg>();
    for (const task of tasks as any[]) {
      const taskId = String(task?._id || '').trim();
      const pathLabel = this.inferInitiativeFromWbsPath(task?.wbsPath, wbsLevels);
      const parentNodeId = String(task?.parentWbsNodeId || '').trim();
      const fallbackLabel = String(task?.title || task?.name || '').trim() || 'Iniciativa sem nome';
      const initiativeLabel = pathLabel || fallbackLabel;
      const initiativeId = parentNodeId || initiativeLabel.toLowerCase();

      const existing = tacticalById.get(initiativeId) || {
        id: initiativeId,
        label: initiativeLabel,
        taskCount: 0,
        descriptions: [],
        waveNumbers: new Set<number>(),
      };

      existing.taskCount += 1;
      if (task?.description) {
        existing.descriptions.push(String(task.description));
      }

      const wavesForTask = waveByTaskId.get(taskId) || [];
      for (const waveNumber of wavesForTask) {
        existing.waveNumbers.add(waveNumber);
      }

      tacticalById.set(initiativeId, existing);
    }

    const tacticalItems = Array.from(tacticalById.values())
      .sort((a, b) => b.taskCount - a.taskCount || a.label.localeCompare(b.label))
      .slice(0, maxTacticalItems)
      .map((item, index) => {
        const wavesText = Array.from(item.waveNumbers.values())
          .sort((a, b) => a - b)
          .join(', ');
        return {
          id: item.id || `TAC${index + 1}`,
          label: wavesText ? `${item.label} (Ondas ${wavesText})` : item.label,
          source: 'wbs-l1-l2',
        };
      });

    const tacticalContextById = new Map<string, string>();
    for (const item of Array.from(tacticalById.values())) {
      const wavesText = Array.from(item.waveNumbers.values())
        .sort((a, b) => a - b)
        .join(', ');
      const mergedDescriptions = item.descriptions.slice(0, 4).join(' | ');
      tacticalContextById.set(
        item.id,
        [item.label, mergedDescriptions, wavesText ? `Ondas ${wavesText}` : 'Sem onda definida']
          .filter(Boolean)
          .join(' | '),
      );
    }

    const strategyToAnnual = strategyGoals.flatMap((strategy) => {
      return annualGoals.map((annual) => {
        const scored = this.scoreStrength(strategy.label, annual.label);
        return {
          fromId: strategy.id,
          toId: annual.id,
          strength: scored.strength,
          score: scored.score,
          rationale: scored.rationale,
        };
      });
    });

    const annualToTactical = annualGoals.flatMap((annual) => {
      return tacticalItems.map((tactical) => {
        const tacticalContext = tacticalContextById.get(tactical.id) || tactical.label;
        const scored = this.scoreStrength(annual.label, tacticalContext);
        return {
          fromId: annual.id,
          toId: tactical.id,
          strength: scored.strength,
          score: scored.score,
          rationale: scored.rationale,
        };
      });
    });

    const warnings: string[] = [];
    if (strategyGoals.length === 0)
      warnings.push('Nao foi possivel identificar objetivos estrategicos.');
    if (annualGoals.length === 0) warnings.push('Nao foi possivel identificar metas anuais.');
    if (tacticalItems.length === 0)
      warnings.push('Projeto sem iniciativas taticas suficientes (WBS nivel 1/2).');
    if (tacticalById.size > tacticalItems.length) {
      warnings.push(
        `Eixo tatico truncado para ${tacticalItems.length} iniciativas para manter legibilidade.`,
      );
    }
    if (waves.length === 0)
      warnings.push('Nenhuma onda encontrada. Defina ondas para aplicar zoom tatico mensal/trimestral.');

    const projectStart = project.startDate ? new Date(project.startDate) : null;
    const projectEnd = project.deadline ? new Date(project.deadline) : null;
    if (projectStart && projectEnd && projectEnd.getTime() > projectStart.getTime()) {
      const durationDays = Math.ceil(
        (projectEnd.getTime() - projectStart.getTime()) / (1000 * 60 * 60 * 24),
      );
      if (durationDays <= 120) {
        warnings.push(
          'Zoom fractal aplicado: trate Norte como fim do semestre e Estrategico como metas mensais.',
        );
      }
    }

    let activeAnnualIds = new Set(annualGoals.map((item) => item.id));
    let activeStrategyIds = new Set(strategyGoals.map((item) => item.id));
    let activeTacticalIds = new Set(tacticalItems.map((item) => item.id));

    const usefulAnnualIdsFromNorth = new Set(
      strategyToAnnual.filter((cell) => cell.strength !== 'none').map((cell) => cell.toId),
    );
    const usefulAnnualIdsFromTactical = new Set(
      annualToTactical.filter((cell) => cell.strength !== 'none').map((cell) => cell.fromId),
    );

    const usefulAnnualIds =
      usefulAnnualIdsFromNorth.size > 0
        ? usefulAnnualIdsFromNorth
        : new Set<string>([
            ...Array.from(usefulAnnualIdsFromNorth),
            ...Array.from(usefulAnnualIdsFromTactical),
          ]);

    if (usefulAnnualIds.size > 0) {
      activeAnnualIds = usefulAnnualIds;
      activeStrategyIds = new Set(
        strategyToAnnual
          .filter((cell) => cell.strength !== 'none' && activeAnnualIds.has(cell.toId))
          .map((cell) => cell.fromId),
      );
      activeTacticalIds = new Set(
        annualToTactical
          .filter((cell) => cell.strength !== 'none' && activeAnnualIds.has(cell.fromId))
          .map((cell) => cell.toId),
      );

      if (activeStrategyIds.size === 0)
        activeStrategyIds = new Set(strategyGoals.map((item) => item.id));
      if (activeTacticalIds.size === 0)
        activeTacticalIds = new Set(tacticalItems.map((item) => item.id));
    }

    const filteredStrategyGoals = strategyGoals.filter((item) => activeStrategyIds.has(item.id));
    const filteredAnnualGoals = annualGoals.filter((item) => activeAnnualIds.has(item.id));
    const filteredTacticalItems = tacticalItems.filter((item) => activeTacticalIds.has(item.id));

    const filteredStrategyToAnnual = strategyToAnnual.filter(
      (cell) => activeStrategyIds.has(cell.fromId) && activeAnnualIds.has(cell.toId),
    );
    const filteredAnnualToTactical = annualToTactical.filter(
      (cell) => activeAnnualIds.has(cell.fromId) && activeTacticalIds.has(cell.toId),
    );

    if (filteredAnnualGoals.length < annualGoals.length) {
      warnings.push(
        `Metas estrategicas sem correlacao foram ocultadas (${annualGoals.length - filteredAnnualGoals.length}).`,
      );
    }
    if (filteredStrategyGoals.length < strategyGoals.length) {
      warnings.push(
        `Diretrizes norte sem correlacao foram ocultadas (${strategyGoals.length - filteredStrategyGoals.length}).`,
      );
    }
    if (filteredTacticalItems.length < tacticalItems.length) {
      warnings.push(
        `Iniciativas taticas sem correlacao foram ocultadas (${tacticalItems.length - filteredTacticalItems.length}).`,
      );
    }

    const response: XMatrixResponseDto = {
      projectId,
      projectName: String(project.name || 'Projeto'),
      strategyGoals: filteredStrategyGoals,
      annualGoals: filteredAnnualGoals,
      tacticalItems: filteredTacticalItems,
      tasks: filteredTacticalItems,
      strategyToAnnual: filteredStrategyToAnnual,
      annualToTactical: filteredAnnualToTactical,
      annualToTasks: filteredAnnualToTactical,
      diagnostics: {
        generatedAt: new Date().toISOString(),
        strategyCount: filteredStrategyGoals.length,
        annualCount: filteredAnnualGoals.length,
        tacticalCount: filteredTacticalItems.length,
        taskCount: filteredTacticalItems.length,
        warnings,
      },
    };

    await this.xMatrixSnapshotModel
      .updateOne(
        { projectId: new Types.ObjectId(projectId) },
        { $set: { data: response } },
        { upsert: true },
      )
      .exec();

    return response;
  }

  async getSavedXMatrix(projectId: string): Promise<XMatrixResponseDto | null> {
    if (
      !projectId ||
      projectId === 'null' ||
      projectId === 'undefined' ||
      !Types.ObjectId.isValid(projectId)
    ) {
      throw new BadRequestException(`ID invalido: ${projectId}`);
    }

    const project = await this.projectModel.findById(projectId).exec();
    if (!project) throw new NotFoundException('Project not found');

    const snapshot = await this.xMatrixSnapshotModel
      .findOne({ projectId: new Types.ObjectId(projectId) })
      .exec();

    if (snapshot?.data) return snapshot.data as XMatrixResponseDto;

    const legacySnapshot = (project as any).xMatrixSnapshot;
    if (legacySnapshot) {
      await this.xMatrixSnapshotModel
        .updateOne(
          { projectId: new Types.ObjectId(projectId) },
          { $set: { data: legacySnapshot } },
          { upsert: true },
        )
        .exec();

      await this.projectModel.updateOne({ _id: projectId }, { $unset: { xMatrixSnapshot: '' } }).exec();

      return legacySnapshot as XMatrixResponseDto;
    }

    return null;
  }
}
