import { ApiProperty } from '@nestjs/swagger';
import {
  CPMDiagnostics,
  CPMValidation,
  MissingDependencySample,
  SlackBuckets,
  TaskNode,
  TopBottleneck,
  TopUnlocker,
} from '../../interfaces/cpm.interface';

export class SlackBucketsDto implements SlackBuckets {
  @ApiProperty({ description: 'Quantidade de tarefas com folga negativa' })
  negative: number;

  @ApiProperty({ description: 'Quantidade de tarefas críticas (folga menor que 0.1h)' })
  critical: number;

  @ApiProperty({ description: 'Quantidade de tarefas quase críticas (folga < 2h)' })
  nearCritical: number;

  @ApiProperty({ description: 'Quantidade de tarefas com folga baixa (folga < 8h)' })
  lowSlack: number;

  @ApiProperty({ description: 'Quantidade de tarefas confortáveis (folga >= 8h)' })
  comfortable: number;
}

export class TopUnlockerDto implements TopUnlocker {
  @ApiProperty({ description: 'ID da tarefa' })
  taskId: string;

  @ApiProperty({ description: 'Nome da tarefa' })
  taskName: string;

  @ApiProperty({ description: 'Grau de saída (out-degree) da tarefa' })
  outDegree: number;
}

export class TopBottleneckDto implements TopBottleneck {
  @ApiProperty({ description: 'ID da tarefa' })
  taskId: string;

  @ApiProperty({ description: 'Nome da tarefa' })
  taskName: string;

  @ApiProperty({ description: 'Grau de entrada (in-degree) da tarefa' })
  inDegree: number;
}

export class MissingDependencySampleDto implements MissingDependencySample {
  @ApiProperty({ description: 'ID da tarefa' })
  taskId: string;

  @ApiProperty({ description: 'ID da tarefa de que depende e que está ausente no projeto' })
  dependsOnTaskId: string;
}

export class CPMValidationDto implements CPMValidation {
  @ApiProperty({ description: 'Quantidade de dependências com referências ausentes no projeto' })
  missingDependencyRefs: number;

  @ApiProperty({ type: [MissingDependencySampleDto], description: 'Amostras de dependências ausentes' })
  missingDependencySamples: MissingDependencySampleDto[];

  @ApiProperty({ enum: ['high', 'medium', 'low'], description: 'Grau de confiabilidade do cálculo' })
  reliability: 'high' | 'medium' | 'low';
}

export class CPMDiagnosticsDto implements CPMDiagnostics {
  @ApiProperty({ description: 'Total de tarefas consideradas no cálculo' })
  taskCount: number;

  @ApiProperty({ description: 'Quantidade de tarefas críticas' })
  criticalCount: number;

  @ApiProperty({ description: 'Percentual de tarefas críticas' })
  criticalPercent: number;

  @ApiProperty({ description: 'Quantidade de tarefas no caminho crítico' })
  criticalChainTaskCount: number;

  @ApiProperty({ description: 'Duração total do caminho crítico em horas' })
  criticalChainDuration: number;

  @ApiProperty({ description: 'Quantidade de tarefas quase críticas (folga < 2h)' })
  nearCriticalCount: number;

  @ApiProperty({ description: 'Trabalho total (soma das durações das tarefas) em horas' })
  totalWork: number;

  @ApiProperty({ description: 'Paralelismo implícito (totalWork / projectDuration)' })
  impliedParallelism: number;

  @ApiProperty({ description: 'Indica se foi detectado algum ciclo (loop) de dependência' })
  hasCycle: boolean;

  @ApiProperty({ description: 'Quantidade de nós não processados no forward pass' })
  unprocessedForward: number;

  @ApiProperty({ description: 'Quantidade de nós não processados no backward pass' })
  unprocessedBackward: number;

  @ApiProperty({ description: 'Quantidade de conexões (arestas) no grafo' })
  edgeCount: number;

  @ApiProperty({ description: 'Quantidade de nós de início (sem predecessores)' })
  startNodeCount: number;

  @ApiProperty({ description: 'Quantidade de nós de término (sem sucessores)' })
  endNodeCount: number;

  @ApiProperty({ description: 'Média de dependências por tarefa' })
  avgDependenciesPerTask: number;

  @ApiProperty({ type: SlackBucketsDto })
  slackBuckets: SlackBucketsDto;

  @ApiProperty({ type: [TopUnlockerDto] })
  topUnlockers: TopUnlockerDto[];

  @ApiProperty({ type: [TopBottleneckDto] })
  topBottlenecks: TopBottleneckDto[];

  @ApiProperty({ type: CPMValidationDto })
  validation: CPMValidationDto;

  constructor(params: {
    tasksInHours: TaskNode[];
    criticalTasks: TaskNode[];
    criticalPathSequence: string[];
    projectDuration: number;
    indegree: Map<string, number>;
    outdegree: Map<string, number>;
    edgeCount: number;
    depSum: number;
    hasCycle: boolean;
    unprocessedForward: number;
    unprocessedBackward: number;
    missingDependencyRefs: number;
    missingDependencySamples: Array<{ taskId: string; dependsOnTaskId: string }>;
  }) {
    const {
      tasksInHours,
      criticalTasks,
      criticalPathSequence,
      projectDuration,
      indegree,
      outdegree,
      edgeCount,
      depSum,
      hasCycle,
      unprocessedForward,
      unprocessedBackward,
      missingDependencyRefs,
      missingDependencySamples,
    } = params;

    const taskById = new Map<string, TaskNode>();
    for (const t of tasksInHours) {
      taskById.set(t.id, t);
    }

    const rawCriticalChainDuration = criticalPathSequence.reduce(
      (sum, id) => sum + (taskById.get(id)?.duration ?? 0),
      0,
    );

    const rawTotalWork = tasksInHours.reduce(
      (sum, t) => sum + (typeof t.duration === 'number' ? t.duration : 0),
      0,
    );

    const rawImpliedParallelism = projectDuration > 0 ? rawTotalWork / projectDuration : 0;

    const reliability: 'high' | 'medium' | 'low' = hasCycle
      ? 'low'
      : missingDependencyRefs > 0
        ? 'medium'
        : 'high';

    this.taskCount = tasksInHours.length;
    this.criticalCount = criticalTasks.length;
    this.criticalPercent =
      tasksInHours.length > 0 ? Math.round((criticalTasks.length / tasksInHours.length) * 1000) / 10 : 0;
    this.criticalChainTaskCount = criticalPathSequence.length;
    this.criticalChainDuration = Math.round(rawCriticalChainDuration * 100) / 100;
    this.nearCriticalCount = tasksInHours.filter((t) => {
      const slack = typeof t.slack === 'number' ? t.slack : 0;
      return slack >= 0 && slack < 2;
    }).length;
    this.totalWork = Math.round(rawTotalWork * 100) / 100;
    this.impliedParallelism = Math.round(rawImpliedParallelism * 100) / 100;
    this.hasCycle = hasCycle;
    this.unprocessedForward = unprocessedForward;
    this.unprocessedBackward = unprocessedBackward;
    this.edgeCount = edgeCount;
    this.startNodeCount = [...indegree.values()].filter((v) => v === 0).length;
    this.endNodeCount = [...outdegree.values()].filter((v) => v === 0).length;
    this.avgDependenciesPerTask =
      tasksInHours.length > 0 ? Math.round((depSum / tasksInHours.length) * 100) / 100 : 0;

    // Slack Buckets calculation
    const negative = tasksInHours.filter((t) => (t.slack ?? 0) < 0).length;
    const critical = tasksInHours.filter(
      (t) => Math.abs(t.slack ?? 0) < 0.1 && (t.slack ?? 0) >= 0,
    ).length;
    const nearCritical = tasksInHours.filter((t) => (t.slack ?? 0) >= 0.1 && (t.slack ?? 0) < 2).length;
    const lowSlack = tasksInHours.filter((t) => (t.slack ?? 0) >= 2 && (t.slack ?? 0) < 8).length;
    const comfortable = tasksInHours.filter((t) => (t.slack ?? 0) >= 8).length;

    this.slackBuckets = { negative, critical, nearCritical, lowSlack, comfortable };

    // Top Unlockers and Bottlenecks calculations
    this.topUnlockers = [...outdegree.entries()]
      .filter(([, deg]) => (deg ?? 0) > 0)
      .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
      .slice(0, 8)
      .map(([taskId, deg]) => ({
        taskId,
        taskName: taskById.get(taskId)?.name ?? taskId,
        outDegree: Number(deg ?? 0),
      }));

    this.topBottlenecks = [...indegree.entries()]
      .filter(([, deg]) => (deg ?? 0) > 0)
      .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
      .slice(0, 8)
      .map(([taskId, deg]) => ({
        taskId,
        taskName: taskById.get(taskId)?.name ?? taskId,
        inDegree: Number(deg ?? 0),
      }));

    this.validation = {
      missingDependencyRefs,
      missingDependencySamples: (missingDependencySamples || []).map((s) => ({
        taskId: s.taskId,
        dependsOnTaskId: s.dependsOnTaskId,
      })),
      reliability,
    };
  }
}
