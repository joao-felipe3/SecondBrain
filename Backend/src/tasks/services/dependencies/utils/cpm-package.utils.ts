import { TaskNodeResponseDto, PackageCriticalityResponseDto } from '../../../dto/dependencies/cpm.dto';

interface GroupedPackageTasks {
  path?: string;
  tasks: TaskNodeResponseDto[];
}

interface RawPackageMetrics {
  packageId: string;
  packagePath?: string;
  taskCount: number;
  criticalTaskCount: number;
  criticalRatio: number;
  minSlack: number;
  criticalDuration: number;
  criticalPathTaskCount: number;
}

export function computePackageCriticality(
  tasks: TaskNodeResponseDto[],
  criticalPath: string[],
): PackageCriticalityResponseDto[] {
  const criticalPathSet = new Set(criticalPath);
  const grouped = groupTasksByPackage(tasks);

  if (grouped.size === 0) return [];

  const byPackage = [...grouped.entries()].map(([packageId, group]) =>
    calculateRawPackageMetrics(packageId, group, criticalPathSet),
  );

  const scored = computeScoresAndFormat(byPackage);
  sortPackageCriticalityList(scored);

  return scored;
}

function groupTasksByPackage(tasks: TaskNodeResponseDto[]): Map<string, GroupedPackageTasks> {
  const grouped = new Map<string, GroupedPackageTasks>();

  for (const task of tasks) {
    const packageId = String(task.parentWbsNodeId || task.wbsPath || 'unassigned');
    const existing = grouped.get(packageId) || { path: task.wbsPath, tasks: [] };
    existing.tasks.push(task);
    if (!existing.path && task.wbsPath) existing.path = task.wbsPath;
    grouped.set(packageId, existing);
  }

  return grouped;
}

function calculateRawPackageMetrics(
  packageId: string,
  group: GroupedPackageTasks,
  criticalPathSet: Set<string>,
): RawPackageMetrics {
  const totalTaskCount = group.tasks.length;
  const criticalTasks = group.tasks.filter((t) => Boolean(t.isCritical));
  const criticalTaskCount = criticalTasks.length;
  const criticalRatio = totalTaskCount > 0 ? criticalTaskCount / totalTaskCount : 0;

  let minSlack = Number.POSITIVE_INFINITY;
  for (const t of group.tasks) {
    if (typeof t.slack === 'number') minSlack = Math.min(minSlack, t.slack);
  }
  if (!Number.isFinite(minSlack)) minSlack = 0;

  const criticalDuration = criticalTasks.reduce((sum, t) => sum + (Number(t.duration) || 0), 0);
  const criticalPathTaskCount = group.tasks.reduce(
    (count, task) => count + (criticalPathSet.has(task.id) ? 1 : 0),
    0,
  );

  return {
    packageId,
    packagePath: group.path,
    taskCount: totalTaskCount,
    criticalTaskCount,
    criticalRatio,
    minSlack,
    criticalDuration,
    criticalPathTaskCount,
  };
}

function computeScoresAndFormat(
  rawMetrics: RawPackageMetrics[],
): PackageCriticalityResponseDto[] {
  const maxCriticalDuration = Math.max(...rawMetrics.map((item) => item.criticalDuration), 0);

  return rawMetrics.map((item) => {
    const criticalRatioScore = item.criticalRatio * 100;
    const slackRiskScore = (1 - Math.min(1, Math.max(0, item.minSlack) / 8)) * 100;
    const durationScore =
      maxCriticalDuration > 0 ? (item.criticalDuration / maxCriticalDuration) * 100 : 0;
    const score = criticalRatioScore * 0.3 + slackRiskScore * 0.2 + durationScore * 0.5;

    return {
      packageId: item.packageId,
      packagePath: item.packagePath,
      taskCount: item.taskCount,
      criticalTaskCount: item.criticalTaskCount,
      criticalRatio: Math.round(item.criticalRatio * 1000) / 10,
      minSlack: Math.round(item.minSlack * 100) / 100,
      criticalDuration: Math.round(item.criticalDuration * 100) / 100,
      criticalPathTaskCount: item.criticalPathTaskCount,
      score: Math.round(score * 100) / 100,
    };
  });
}

function sortPackageCriticalityList(list: PackageCriticalityResponseDto[]): void {
  list.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.criticalRatio !== a.criticalRatio) return b.criticalRatio - a.criticalRatio;
    if (a.minSlack !== b.minSlack) return a.minSlack - b.minSlack;
    return a.packageId.localeCompare(b.packageId);
  });
}
