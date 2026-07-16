import { TaskDocument } from '../../../../tasks/schemas/task.schema';
import { ProjectWaveDocument } from '../../../schemas/project-wave.schema';
import { XMatrixAxisItemDto } from '../../../dto/x-matrix.dto';
import {
  BuildTacticalItemsOptions,
  TacticalAgg,
} from '../../../interfaces/x-matrix.interface';
import { inferInitiativeFromWbsPath } from './x-matrix-text-helpers.util';

export function buildTacticalItems(options: BuildTacticalItemsOptions): {
  tacticalItems: XMatrixAxisItemDto[];
  tacticalContextById: Map<string, string>;
  tacticalByIdSize: number;
} {
  const { tasks, waves, wbsLevels, maxTacticalItems } = options;

  const waveByTaskId = buildWaveByTaskIdMap(waves);
  const tacticalById = groupTasksIntoTacticalAgg(tasks, waveByTaskId, wbsLevels);
  const tacticalItems = formatTacticalItems(tacticalById, maxTacticalItems);
  const tacticalContextById = buildTacticalContextById(tacticalById);

  return {
    tacticalItems,
    tacticalContextById,
    tacticalByIdSize: tacticalById.size,
  };
}

function buildWaveByTaskIdMap(waves: ProjectWaveDocument[]): Map<string, number[]> {
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
  return waveByTaskId;
}

function groupTasksIntoTacticalAgg(
  tasks: TaskDocument[],
  waveByTaskId: Map<string, number[]>,
  wbsLevels: Set<number>,
): Map<string, TacticalAgg> {
  const tacticalById = new Map<string, TacticalAgg>();
  for (const task of tasks) {
    const taskId = String(task._id || '').trim();
    const pathLabel = inferInitiativeFromWbsPath(task.wbsPath, wbsLevels);
    const parentNodeId = String(task.parentWbsNodeId || '').trim();
    const fallbackLabel = String((task as any).title || task.name || '').trim() || 'Iniciativa sem nome';
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
    if (task.description) existing.descriptions.push(String(task.description));

    const wavesForTask = waveByTaskId.get(taskId) || [];
    for (const waveNumber of wavesForTask) {
      existing.waveNumbers.add(waveNumber);
    }

    tacticalById.set(initiativeId, existing);
  }
  return tacticalById;
}

function formatTacticalItems(
  tacticalById: Map<string, TacticalAgg>,
  maxTacticalItems: number,
): XMatrixAxisItemDto[] {
  return Array.from(tacticalById.values())
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
}

function buildTacticalContextById(tacticalById: Map<string, TacticalAgg>): Map<string, string> {
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
  return tacticalContextById;
}
