import { TaskNodeResponseDto, PackageCriticalityResponseDto } from '../../../dto/dependencies/cpm.dto';
import { GroupedPackageTasks, RawPackageMetrics } from '../../../interfaces/cpm.interface';

const roundTo = (value: number, decimals = 2): number => {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
};

export function computePackageCriticality(
  tasks: TaskNodeResponseDto[],
  criticalPath: string[],
): PackageCriticalityResponseDto[] {
  const criticalPathSet = new Set(criticalPath);
  const grouped = groupTasksByPackage(tasks);

  if (grouped.size === 0) return [];

  const rawMetrics = [...grouped.entries()].map(([packageId, group]) =>
    calculateRawPackageMetrics(packageId, group, criticalPathSet),
  );

  const scoredList = computeScoresAndFormat(rawMetrics);

  return sortPackageCriticalityList(scoredList);
}

function groupTasksByPackage(tasks: TaskNodeResponseDto[]): Map<string, GroupedPackageTasks> {
  const grouped = new Map<string, GroupedPackageTasks>();

  for (const task of tasks) {
    const packageId = String(task.parentWbsNodeId || task.wbsPath || 'unassigned');

    if (!grouped.has(packageId)) {
      grouped.set(packageId, { path: task.wbsPath, tasks: [] });
    }

    const currentGroup = grouped.get(packageId)!;
    currentGroup.tasks.push(task);

    if (!currentGroup.path && task.wbsPath) {
      currentGroup.path = task.wbsPath;
    }
  }

  return grouped;
}

function calculateRawPackageMetrics(
  packageId: string,
  group: GroupedPackageTasks,
  criticalPathSet: Set<string>,
): RawPackageMetrics {
  let criticalTaskCount = 0;
  let criticalDuration = 0;
  let criticalPathTaskCount = 0;
  let minSlack = Number.POSITIVE_INFINITY;

  for (const task of group.tasks) {
    if (task.isCritical) {
      criticalTaskCount++;
      criticalDuration += Number(task.duration) || 0;
    }
    if (typeof task.slack === 'number') {
      minSlack = Math.min(minSlack, task.slack);
    }
    if (criticalPathSet.has(task.id)) {
      criticalPathTaskCount++;
    }
  }

  const taskCount = group.tasks.length;

  return {
    packageId,
    packagePath: group.path,
    taskCount,
    criticalTaskCount,
    criticalRatio: taskCount > 0 ? criticalTaskCount / taskCount : 0,
    minSlack: Number.isFinite(minSlack) ? minSlack : 0,
    criticalDuration,
    criticalPathTaskCount,
  };
}

function computeScoresAndFormat(rawMetrics: RawPackageMetrics[]): PackageCriticalityResponseDto[] {
  const maxCriticalDuration = Math.max(...rawMetrics.map((item) => item.criticalDuration), 0);

  return rawMetrics.map(({ minSlack, criticalRatio, criticalDuration, ...rest }) => {
    const criticalRatioScore = criticalRatio * 100;
    const slackRiskScore = (1 - Math.min(1, Math.max(0, minSlack) / 8)) * 100;
    const durationScore = maxCriticalDuration > 0 ? (criticalDuration / maxCriticalDuration) * 100 : 0;

    const score = criticalRatioScore * 0.3 + slackRiskScore * 0.2 + durationScore * 0.5;

    return {
      ...rest,
      criticalRatio: roundTo(criticalRatio * 100, 1),
      minSlack: roundTo(minSlack),
      criticalDuration: roundTo(criticalDuration),
      score: roundTo(score),
    };
  });
}

function sortPackageCriticalityList(
  list: PackageCriticalityResponseDto[],
): PackageCriticalityResponseDto[] {
  return [...list].sort(
    (a, b) =>
      b.score - a.score ||
      b.criticalRatio - a.criticalRatio ||
      a.minSlack - b.minSlack ||
      a.packageId.localeCompare(b.packageId),
  );
}
