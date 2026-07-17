import { ProjectWaveDocument } from '../../../schemas/project-wave.schema';
import { ProjectDocument } from '../../../schemas/project.schema';
import { splitGoalText, scoreStrength } from './x-matrix-text-helpers.util';
import { CreateXMatrixDto, XMatrixAxisItemDto, XMatrixCellDto, XMatrixResponseDto } from '../../../dto/x-matrix.dto';
import {
  CalculateCorrelationsOptions,
  GenerateWarningsOptions,
  ApplyFractalFilterOptions,
  ActiveIds,
  FilteredData,
  GenerateXMatrixDataOptions,
} from '../../../interfaces/x-matrix.interface';

import { buildTacticalItems } from './x-matrix-tactical-helpers.util';
export { buildTacticalItems };

function dedupe(items: string[]): string[] {
  return Array.from(new Set(items.map((v) => v.trim()).filter(Boolean)));
}

function formatWaveGoal(wave: ProjectWaveDocument): string {
  const start = wave.startDate ? new Date(wave.startDate).toISOString().slice(0, 10) : null;
  const end = wave.endDate ? new Date(wave.endDate).toISOString().slice(0, 10) : null;
  const range = start && end ? `${start}..${end}` : 'periodo indefinido';
  return `Meta de execucao da Onda ${wave.waveNumber} (${range})`;
}

export function resolveStrategyGoals(
  project: ProjectDocument,
  dto: CreateXMatrixDto,
): XMatrixAxisItemDto[] {
  const strategyFromDto = (dto?.strategy3to5Years || [])
    .map((item) => String(item).trim())
    .filter(Boolean);

  const strategyFallback = [
    project.longTermGoal,
    project.smartObjective?.relevant,
    project.smartObjective?.summary,
  ].flatMap(splitGoalText);

  const seed = strategyFromDto.length ? strategyFromDto : strategyFallback;

  return dedupe(seed).map((label, index) => ({
    id: `S${index + 1}`,
    label,
    source: 'strategy',
  }));
}

export function resolveAnnualGoals(
  project: ProjectDocument,
  waves: ProjectWaveDocument[],
  dto: CreateXMatrixDto,
): XMatrixAxisItemDto[] {
  const annualFromDto = (dto?.annualGoals || []).map((item) => String(item).trim()).filter(Boolean);

  const annualFallback = [
    project.shortTermGoal,
    project.midTermGoal,
    project.smartObjective?.specific,
    project.smartObjective?.measurable,
  ].flatMap(splitGoalText);

  const seed = annualFromDto.length
    ? annualFromDto
    : annualFallback.length
      ? annualFallback
      : waves.map(formatWaveGoal);

  return dedupe(seed).map((label, index) => ({
    id: `A${index + 1}`,
    label,
    source: 'annual',
  }));
}

export function calculateCorrelations(options: CalculateCorrelationsOptions): {
  strategyToAnnual: XMatrixCellDto[];
  annualToTactical: XMatrixCellDto[];
} {
  const { strategyGoals, annualGoals, tacticalItems, tacticalContextById } = options;

  const strategyToAnnual = buildCorrelations(strategyGoals, annualGoals);
  const annualToTactical = buildCorrelations(annualGoals, tacticalItems, tacticalContextById);

  return { strategyToAnnual, annualToTactical };
}

function buildCorrelations(
  fromItems: XMatrixAxisItemDto[],
  toItems: XMatrixAxisItemDto[],
  toContextMap?: Map<string, string>,
): XMatrixCellDto[] {
  return fromItems.flatMap((from) => {
    return toItems.map((to) => {
      const toContext = toContextMap?.get(to.id) || to.label;
      const scored = scoreStrength(from.label, toContext);
      return {
        fromId: from.id,
        toId: to.id,
        ...scored,
      };
    });
  });
}

export function generateWarnings(options: GenerateWarningsOptions): string[] {
  const { strategyGoals, annualGoals, tacticalItems, tacticalByIdSize, wavesCount, project } = options;

  return [
    strategyGoals.length === 0 && 'Nao foi possivel identificar objetivos estrategicos.',
    annualGoals.length === 0 && 'Nao foi possivel identificar metas anuais.',
    tacticalItems.length === 0 && 'Projeto sem iniciativas taticas suficientes (WBS nivel 1/2).',
    tacticalByIdSize > tacticalItems.length &&
      `Eixo tatico truncado para ${tacticalItems.length} iniciativas para manter legibilidade.`,
    wavesCount === 0 &&
      'Nenhuma onda encontrada. Defina ondas para aplicar zoom tatico mensal/trimestral.',
    hasShortDuration(project) &&
      'Zoom fractal aplicado: trate Norte como fim do semestre e Estrategico como metas mensais.',
  ].filter((warning): warning is string => typeof warning === 'string');
}

function hasShortDuration(project: ProjectDocument): boolean {
  const projectStart = project.startDate ? new Date(project.startDate) : null;
  const projectEnd = project.deadline ? new Date(project.deadline) : null;
  if (!projectStart || !projectEnd || projectEnd.getTime() <= projectStart.getTime()) {
    return false;
  }
  const durationDays = Math.ceil(
    (projectEnd.getTime() - projectStart.getTime()) / (1000 * 60 * 60 * 24),
  );
  return durationDays <= 120;
}

export function applyFractalFilter(
  options: ApplyFractalFilterOptions,
): FilteredData & { extraWarnings: string[] } {
  const { strategyToAnnual, annualToTactical } = options;

  const usefulAnnualIds = findUsefulAnnualIds(strategyToAnnual, annualToTactical);
  const activeIds = determineActiveIds(usefulAnnualIds, options);
  const filtered = buildFilteredData(activeIds, options);

  const extraWarnings = generateHiddenWarnings(filtered, options);

  return {
    ...filtered,
    extraWarnings,
  };
}

/*******************************************************************************
 * Métodos Auxiliares Locais
 ******************************************************************************/

function findUsefulAnnualIds(
  strategyToAnnual: XMatrixCellDto[],
  annualToTactical: XMatrixCellDto[],
): Set<string> {
  const fromNorth = strategyToAnnual.filter((cell) => cell.strength !== 'none').map((cell) => cell.toId);
  const fromTactical = annualToTactical
    .filter((cell) => cell.strength !== 'none')
    .map((cell) => cell.fromId);

  if (fromNorth.length > 0) return new Set(fromNorth);
  return new Set([...fromNorth, ...fromTactical]);
}

function determineActiveIds(
  usefulAnnualIds: Set<string>,
  options: ApplyFractalFilterOptions,
): ActiveIds {
  const { strategyGoals, annualGoals, tacticalItems, strategyToAnnual, annualToTactical } = options;

  const allStrategyIds = new Set(strategyGoals.map((item) => item.id));
  const allTacticalIds = new Set(tacticalItems.map((item) => item.id));

  if (usefulAnnualIds.size === 0) {
    return {
      activeStrategyIds: allStrategyIds,
      activeAnnualIds: new Set(annualGoals.map((item) => item.id)),
      activeTacticalIds: allTacticalIds,
    };
  }

  const activeAnnualIds = usefulAnnualIds;

  const filteredStrategyIds = findConnectedIds(strategyToAnnual, activeAnnualIds, 'toId', 'fromId');
  const filteredTacticalIds = findConnectedIds(annualToTactical, activeAnnualIds, 'fromId', 'toId');

  return {
    activeAnnualIds,
    activeStrategyIds: filteredStrategyIds.size ? filteredStrategyIds : allStrategyIds,
    activeTacticalIds: filteredTacticalIds.size ? filteredTacticalIds : allTacticalIds,
  };
}

function findConnectedIds(
  cells: XMatrixCellDto[],
  activeAnnualIds: Set<string>,
  annualKey: 'fromId' | 'toId',
  targetKey: 'fromId' | 'toId',
): Set<string> {
  const ids = cells
    .filter((cell) => cell.strength !== 'none' && activeAnnualIds.has(cell[annualKey]))
    .map((cell) => cell[targetKey]);
  return new Set(ids);
}

function buildFilteredData(activeIds: ActiveIds, options: ApplyFractalFilterOptions): FilteredData {
  const { strategyGoals, annualGoals, tacticalItems, strategyToAnnual, annualToTactical } = options;
  const { activeStrategyIds, activeAnnualIds, activeTacticalIds } = activeIds;

  return {
    filteredStrategyGoals: strategyGoals.filter((item) => activeStrategyIds.has(item.id)),
    filteredAnnualGoals: annualGoals.filter((item) => activeAnnualIds.has(item.id)),
    filteredTacticalItems: tacticalItems.filter((item) => activeTacticalIds.has(item.id)),
    filteredStrategyToAnnual: strategyToAnnual.filter(
      (cell) => activeStrategyIds.has(cell.fromId) && activeAnnualIds.has(cell.toId),
    ),
    filteredAnnualToTactical: annualToTactical.filter(
      (cell) => activeAnnualIds.has(cell.fromId) && activeTacticalIds.has(cell.toId),
    ),
  };
}

function generateHiddenWarnings(filtered: FilteredData, original: ApplyFractalFilterOptions): string[] {
  return [
    filtered.filteredAnnualGoals.length < original.annualGoals.length &&
      `Metas estrategicas sem correlacao foram ocultadas (${original.annualGoals.length - filtered.filteredAnnualGoals.length}).`,
    filtered.filteredStrategyGoals.length < original.strategyGoals.length &&
      `Diretrizes norte sem correlacao foram ocultadas (${original.strategyGoals.length - filtered.filteredStrategyGoals.length}).`,
    filtered.filteredTacticalItems.length < original.tacticalItems.length &&
      `Iniciativas taticas sem correlacao foram ocultadas (${original.tacticalItems.length - filtered.filteredTacticalItems.length}).`,
  ].filter((w): w is string => typeof w === 'string');
}

export function generateXMatrixData(options: GenerateXMatrixDataOptions): Omit<XMatrixResponseDto, 'projectId' | 'projectName'> {
  const { project, tasks, waves, dto } = options;

  const maxTacticalItems = Math.max(20, Math.min(160, Number(dto?.maxTacticalItems || 80)));
  const wbsLevels = new Set<number>(
    (dto?.wbsLevels || [1, 2]).filter((level) => Number.isFinite(level) && level >= 1),
  );

  const strategyGoals = resolveStrategyGoals(project, dto);
  const annualGoals = resolveAnnualGoals(project, waves, dto);

  const { tacticalItems, tacticalContextById, tacticalByIdSize } = buildTacticalItems({
    tasks,
    waves,
    wbsLevels,
    maxTacticalItems,
  });

  const { strategyToAnnual, annualToTactical } = calculateCorrelations({
    strategyGoals,
    annualGoals,
    tacticalItems,
    tacticalContextById,
  });

  const warnings = generateWarnings({
    strategyGoals,
    annualGoals,
    tacticalItems,
    tacticalByIdSize,
    wavesCount: waves.length,
    project,
  });

  const {
    filteredStrategyGoals,
    filteredAnnualGoals,
    filteredTacticalItems,
    filteredStrategyToAnnual,
    filteredAnnualToTactical,
    extraWarnings,
  } = applyFractalFilter({
    strategyGoals,
    annualGoals,
    tacticalItems,
    strategyToAnnual,
    annualToTactical,
  });

  warnings.push(...extraWarnings);

  return {
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
}
