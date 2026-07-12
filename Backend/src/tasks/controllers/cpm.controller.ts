import { Controller, Post, Get, Delete, Body, Param, Query } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import {
  CPMAnalysis,
  TaskNode,
  TaskMetrics as CpmTaskMetrics,
  BufferService,
  BufferTaskMetrics,
} from '../services/analysis';
import { CPMService, DependencyInferenceService } from '../services/dependencies';
import { TasksService } from '../tasks.service';
import { TaskDependency } from '../entities/task-dependency.entity';
import {
  AddDependencyDto,
  DependencyResponseDto,
  AutoInferDependenciesDto,
  ClearDependencyCycleDto,
  CPMAnalysisResponseDto,
  CalculateCriticalPathResponseDto,
  GetDependenciesResponseDto,
  AutoInferDependenciesResponseDto,
  TaskMetricsResponseDto,
} from '../dto';

@ApiTags('CPM - Critical Path Method')
@ApiBearerAuth()
@Controller('tasks')
export class CPMController {
  private readonly logger = new Logger(CPMController.name);

  constructor(
    private readonly cpmService: CPMService,
    private readonly tasksService: TasksService,
    private readonly dependencyInference: DependencyInferenceService,
    private readonly bufferService: BufferService, // NOVO: Injeta BufferService
  ) {}

  @Post('projects/:projectId/dependencies/auto-infer')
  @ApiOperation({
    summary: 'Inferir dependências automaticamente (IA/heurística)',
    description:
      'Gera dependências sugeridas para tarefas do projeto (por leaf/WBS). Pode retornar preview ou persistir (apply=true).',
  })
  @ApiResponse({
    status: 200,
    description: 'Dependências inferidas com sucesso',
    type: AutoInferDependenciesResponseDto,
  })
  async autoInferDependencies(
    @Param('projectId') projectId: string,
    @Body() body: AutoInferDependenciesDto,
  ) {
    const startedAt = Date.now();
    const requestId = `depinf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    const strategy = body?.strategy ?? 'ai-per-leaf';
    const apply = Boolean(body?.apply);
    const maxEdgesPerLeaf = Math.max(5, Math.min(Number(body?.maxEdgesPerLeaf ?? 60), 250));
    const includeInterLeafGates =
      typeof body?.includeInterLeafGates === 'boolean'
        ? body.includeInterLeafGates
        : strategy === 'ai-per-leaf';

    const interLeafStrategy: 'none' | 'heuristic' | 'ai' = !includeInterLeafGates
      ? 'none'
      : body?.interLeafStrategy
        ? body.interLeafStrategy
        : strategy === 'ai-per-leaf'
          ? 'ai'
          : 'none';

    const maxInterLeafEdges = Math.max(2, Math.min(Number(body?.maxInterLeafEdges ?? 28), 120));

    const inferConcurrency = Math.max(
      1,
      Math.min(Number(process.env.CPM_DEP_INFER_CONCURRENCY ?? 2), 6),
    );
    const inferTimeoutMs = Math.max(
      5_000,
      Math.min(Number(process.env.CPM_DEP_INFER_TIMEOUT_MS ?? 45_000), 180_000),
    );

    const withTimeout = async <T>(promise: Promise<T>, ms: number): Promise<T> => {
      let timer: NodeJS.Timeout | undefined;
      try {
        return await Promise.race([
          promise,
          new Promise<T>((_, reject) => {
            timer = setTimeout(() => reject(new Error(`Timeout após ${ms}ms`)), ms);
          }),
        ]);
      } finally {
        if (timer) clearTimeout(timer);
      }
    };

    const mapWithConcurrency = async <TIn, TOut>(
      items: TIn[],
      limit: number,
      fn: (item: TIn) => Promise<TOut>,
    ) => {
      const results: TOut[] = new Array(items.length);
      let index = 0;
      const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
        while (true) {
          const i = index++;
          if (i >= items.length) break;
          results[i] = await fn(items[i]);
        }
      });
      await Promise.all(workers);
      return results;
    };

    // Fetch tasks (scoped to project)
    const tasks = await this.tasksService.findByProjectId(projectId, {
      taskIds: body?.taskIds,
      parentWbsNodeId: body?.parentWbsNodeId,
    });

    // Group by parentWbsNodeId
    const groups = new Map<string, any[]>();
    for (const t of tasks as any[]) {
      const leafId = String(t?.parentWbsNodeId ?? '').trim() || 'no-leaf';
      const arr = groups.get(leafId) ?? [];
      arr.push(t);
      groups.set(leafId, arr);
    }

    const previewByLeaf: Record<string, any> = {};
    let totalDeps = 0;

    this.logger.log(
      `[auto-infer] requestId=${requestId} projectId=${projectId} strategy=${strategy} apply=${apply} ` +
        `tasks=${tasks.length} maxEdgesPerLeaf=${maxEdgesPerLeaf} concurrency=${inferConcurrency} timeoutMs=${inferTimeoutMs}`,
    );

    const entries = [...groups.entries()];
    const leafResults = await mapWithConcurrency(
      entries,
      inferConcurrency,
      async ([leafId, leafTasks]) => {
        const leafStartedAt = Date.now();
        const inferenceTasks = leafTasks.map((t: any) => ({
          id: String(t?._id ?? t?.id ?? ''),
          name: String(t?.name ?? t?.title ?? 'Task'),
          description: t?.description,
          checklist: t?.checklist,
          definitionOfDone: t?.definitionOfDone,
          microTaskType: t?.microTaskType,
          durationMinutes: Number(t?.pertExpectedMinutes ?? t?.estimatedMinutes ?? 60),
        }));

        const leafWbsPath = String(leafTasks?.[0]?.wbsPath ?? '').trim();

        // Gate selection helpers.
        // Goal: pick gates that actually constrain the leaf graph (high outdegree / high indegree),
        // not just "short tasks"; otherwise inter-leaf edges won't propagate.
        const phaseOrder = ['prepare', 'produce', 'test', 'consolidate', 'practice'];
        const phaseOf = (raw: any) => {
          const s = String(raw ?? '')
            .trim()
            .toLowerCase();
          return phaseOrder.includes(s) ? s : 'produce';
        };

        const pickMinDurationInPhase = (phases: string[], fallbackFirst: boolean) => {
          const candidates = inferenceTasks
            .filter((it: any) => it?.id && phases.includes(phaseOf(it?.microTaskType)))
            .map((it: any) => ({
              id: String(it.id),
              dur: Number(it.durationMinutes ?? 60),
            }));
          if (candidates.length === 0) {
            return fallbackFirst
              ? String(inferenceTasks?.[0]?.id ?? '')
              : String(inferenceTasks?.[inferenceTasks.length - 1]?.id ?? '');
          }
          candidates.sort((a, b) => a.dur - b.dur);
          return String(candidates[0].id);
        };

        const pickGatesFromLeafGraph = (deps: Array<{ taskId: string; dependsOnTaskId: string }>) => {
          const ids = inferenceTasks.map((t: any) => String(t?.id ?? '')).filter(Boolean);
          const durById = new Map<string, number>();
          for (const t of inferenceTasks as any[])
            durById.set(String(t.id), Number(t.durationMinutes ?? 60));

          const indegree = new Map<string, number>();
          const outdegree = new Map<string, number>();
          for (const id of ids) {
            indegree.set(id, 0);
            outdegree.set(id, 0);
          }

          for (const d of deps || []) {
            const taskId = String(d?.taskId ?? '').trim();
            const depId = String(d?.dependsOnTaskId ?? '').trim();
            if (!taskId || !depId) continue;
            if (!indegree.has(taskId) || !outdegree.has(depId)) continue;
            // precedence edge depId -> taskId
            indegree.set(taskId, (indegree.get(taskId) || 0) + 1);
            outdegree.set(depId, (outdegree.get(depId) || 0) + 1);
          }

          const pickMax = (m: Map<string, number>, fallback: () => string) => {
            let bestId = '';
            let bestVal = -1;
            let bestDur = Number.POSITIVE_INFINITY;
            for (const [id, val] of m.entries()) {
              const dur = durById.get(id) ?? 60;
              if (val > bestVal || (val === bestVal && dur < bestDur)) {
                bestId = id;
                bestVal = val;
                bestDur = dur;
              }
            }
            if (!bestId || bestVal <= 0) return fallback();
            return bestId;
          };

          const startFallback = () =>
            pickMinDurationInPhase(['prepare', 'produce'], true) ||
            String(inferenceTasks?.[0]?.id ?? '');
          const endFallback = () =>
            pickMinDurationInPhase(['practice', 'consolidate', 'test'], false) ||
            String(inferenceTasks?.[inferenceTasks.length - 1]?.id ?? '');

          const startGateId = pickMax(outdegree, startFallback);
          let endGateId = pickMax(indegree, endFallback);

          if (startGateId && endGateId && startGateId === endGateId) {
            // Avoid degenerate same gate; fall back for end.
            const alt = endFallback();
            if (alt && alt !== startGateId) endGateId = alt;
          }

          return {
            startGateId: String(startGateId || startFallback()),
            endGateId: String(endGateId || endFallback()),
          };
        };

        try {
          const depsPromise =
            strategy === 'heuristic-phases'
              ? Promise.resolve(this.dependencyInference.inferHeuristicPhases(inferenceTasks))
              : this.dependencyInference.inferWithAi({
                  requestId,
                  leafName: leafId,
                  wbsPath: leafWbsPath,
                  tasks: inferenceTasks,
                  maxEdges: maxEdgesPerLeaf,
                });

          const deps = await withTimeout(depsPromise, inferTimeoutMs);

          const gates = pickGatesFromLeafGraph(Array.isArray(deps) ? (deps as any) : []);

          this.logger.log(
            `[auto-infer] requestId=${requestId} leaf=${leafId} tasks=${inferenceTasks.length} deps=${deps.length} durationMs=${
              Date.now() - leafStartedAt
            }`,
          );

          return {
            leafId,
            tasks: inferenceTasks.length,
            dependencies: deps,
            durationMs: Date.now() - leafStartedAt,
            upserted: 0,
            wbsPath: leafWbsPath,
            startGateId: gates.startGateId,
            endGateId: gates.endGateId,
          };
        } catch (err: any) {
          const msg = String(err?.message || err || 'Falha ao inferir dependências');
          this.logger.warn(`[auto-infer] requestId=${requestId} leaf=${leafId} failed: ${msg}`);
          return {
            leafId,
            tasks: inferenceTasks.length,
            dependencies: [],
            error: msg,
            durationMs: Date.now() - leafStartedAt,
            upserted: 0,
            wbsPath: leafWbsPath,
            startGateId:
              pickMinDurationInPhase(['prepare', 'produce'], true) ||
              String(inferenceTasks?.[0]?.id ?? ''),
            endGateId:
              pickMinDurationInPhase(['practice', 'consolidate', 'test'], false) ||
              String(inferenceTasks?.[inferenceTasks.length - 1]?.id ?? ''),
          };
        }
      },
    );

    for (const r of leafResults) {
      previewByLeaf[r.leafId] = {
        tasks: r.tasks,
        dependencies: r.dependencies,
        durationMs: r.durationMs,
        upserted: r.upserted,
        ...(r.wbsPath ? { wbsPath: r.wbsPath } : {}),
        ...(r.error ? { error: r.error } : {}),
      };
      totalDeps += Array.isArray(r.dependencies) ? r.dependencies.length : 0;
    }

    // Optionally add a tiny cross-leaf ordering set to avoid unrealistic global parallelism.
    // Default for IA: a second IA pass using only leaf gates (then global anti-cycle filter will keep DAG).
    // Fallback: a simple WBS-ordered gate chain.
    let interLeafMode: 'none' | 'ai' | 'heuristic' = 'none';
    let interLeafDeps: Array<{
      taskId: string;
      dependsOnTaskId: string;
      relationship?: string;
      reason?: string;
      confidence?: number;
    }> = [];
    const sortedLeaves = [...leafResults]
      .filter((r: any) => r?.leafId && r.leafId !== 'no-leaf')
      .sort((a: any, b: any) => {
        const ap = String(a?.wbsPath ?? '');
        const bp = String(b?.wbsPath ?? '');
        if (ap && bp && ap !== bp) return ap.localeCompare(bp);
        return String(a.leafId).localeCompare(String(b.leafId));
      });

    const gateToLeaf = new Map<string, string>();
    for (const l of sortedLeaves as any[]) {
      const leafId = String(l?.leafId ?? '').trim();
      const s = String(l?.startGateId ?? '').trim();
      const e = String(l?.endGateId ?? '').trim();
      if (leafId && s) gateToLeaf.set(s, leafId);
      if (leafId && e) gateToLeaf.set(e, leafId);
    }

    const buildHeuristicGateChain = () => {
      const deps: any[] = [];
      for (let i = 1; i < sortedLeaves.length; i++) {
        const prev = sortedLeaves[i - 1] as any;
        const cur = sortedLeaves[i] as any;
        const from = String(cur?.startGateId ?? '').trim();
        const to = String(prev?.endGateId ?? '').trim();
        if (!from || !to) continue;
        if (from === to) continue;
        deps.push({
          taskId: from,
          dependsOnTaskId: to,
          relationship: 'FINISH_TO_START',
          reason: 'Heurística: gate entre leafs (ordem WBS) para reduzir paralelismo global',
          confidence: 0.25,
        });
      }
      return deps;
    };

    if (includeInterLeafGates && interLeafStrategy !== 'none' && sortedLeaves.length >= 2) {
      if (interLeafStrategy === 'ai') {
        try {
          const leavesForAi = (sortedLeaves as any[]).map((l) => ({
            leafId: String(l?.leafId ?? ''),
            leafName: String(l?.leafId ?? ''),
            wbsPath: String(l?.wbsPath ?? ''),
            startGateId: String(l?.startGateId ?? ''),
            endGateId: String(l?.endGateId ?? ''),
            taskCount: Number(l?.tasks ?? l?.taskCount ?? 0) || undefined,
          }));

          const aiDeps = await withTimeout(
            this.dependencyInference.inferInterLeafWithAi({
              requestId,
              projectId,
              leaves: leavesForAi,
              maxEdges: maxInterLeafEdges,
            }),
            inferTimeoutMs,
          );

          this.logger.log(
            `[auto-infer] requestId=${requestId} interLeaf ai rawEdges=${Array.isArray(aiDeps) ? aiDeps.length : 0} leaves=${leavesForAi.length}`,
          );

          interLeafDeps = (aiDeps || []).map((d: any) => ({
            ...d,
            relationship: d?.relationship || 'FINISH_TO_START',
            reason: d?.reason || 'IA: dependência entre leafs (gates) para conectar macro-fluxo',
            confidence: typeof d?.confidence === 'number' ? d.confidence : 0.35,
          }));
          interLeafMode = 'ai';
        } catch (err: any) {
          this.logger.warn(
            `[auto-infer] requestId=${requestId} interLeaf ai failed; falling back to heuristic. error=${String(
              err?.message || err,
            )}`,
          );
          interLeafDeps = buildHeuristicGateChain();
          interLeafMode = 'heuristic';
        }
      } else if (interLeafStrategy === 'heuristic') {
        interLeafDeps = buildHeuristicGateChain();
        interLeafMode = 'heuristic';
      }

      // Ensure cross-leaf only.
      interLeafDeps = (interLeafDeps || []).filter((d: any) => {
        const a = String(d?.taskId ?? '').trim();
        const b = String(d?.dependsOnTaskId ?? '').trim();
        if (!a || !b) return false;
        if (a === b) return false;
        const la = gateToLeaf.get(a);
        const lb = gateToLeaf.get(b);
        if (!la || !lb) return false;
        return la !== lb;
      });

      // If IA returned a sparse inter-leaf graph, optionally supplement with a small number
      // of deterministic edges to reduce disconnected "islands". This helps inter-leaf
      // constraints propagate meaningfully without forcing a single fully-serial chain.
      const supplementEnabledRaw = String(process.env.CPM_INTERLEAF_SUPPLEMENT ?? 'true')
        .trim()
        .toLowerCase();
      const supplementEnabled =
        supplementEnabledRaw === '1' ||
        supplementEnabledRaw === 'true' ||
        supplementEnabledRaw === 'yes';

      const targetChainsRaw = Number(process.env.CPM_INTERLEAF_TARGET_CHAINS ?? 3);
      const targetChains = Math.max(
        1,
        Math.min(Number.isFinite(targetChainsRaw) ? Math.floor(targetChainsRaw) : 3, 6),
      );

      if (interLeafMode === 'ai' && supplementEnabled && sortedLeaves.length >= 6) {
        const edgeKey = (taskId: string, dependsOnTaskId: string) => `${taskId}<-${dependsOnTaskId}`;
        const existing = new Set<string>();
        for (const d of interLeafDeps as any[]) {
          const taskId = String(d?.taskId ?? '').trim();
          const depId = String(d?.dependsOnTaskId ?? '').trim();
          if (!taskId || !depId) continue;
          existing.add(edgeKey(taskId, depId));
        }

        // Build adjacency of gates for cycle check (precedence: dependsOn -> task)
        const gateIds = new Set<string>();
        for (const l of sortedLeaves as any[]) {
          const s = String(l?.startGateId ?? '').trim();
          const e = String(l?.endGateId ?? '').trim();
          if (s) gateIds.add(s);
          if (e) gateIds.add(e);
        }
        const adj = new Map<string, Set<string>>();
        for (const id of gateIds) adj.set(id, new Set());
        for (const d of interLeafDeps as any[]) {
          const taskId = String(d?.taskId ?? '').trim();
          const depId = String(d?.dependsOnTaskId ?? '').trim();
          if (!taskId || !depId) continue;
          if (!adj.has(depId)) continue;
          adj.get(depId)!.add(taskId);
        }

        const wouldCreateCycle = (taskId: string, dependsOnTaskId: string) => {
          const start = taskId;
          const target = dependsOnTaskId;
          const stack = [start];
          const visited = new Set<string>();
          while (stack.length) {
            const cur = stack.pop()!;
            if (cur === target) return true;
            if (visited.has(cur)) continue;
            visited.add(cur);
            const nexts = adj.get(cur);
            if (!nexts) continue;
            for (const n of nexts) stack.push(n);
          }
          return false;
        };

        // Determine how many edges we'd expect for a lightly-connected multi-chain layout.
        const minDesiredEdges = Math.max(0, sortedLeaves.length - targetChains);
        const isSparse = interLeafDeps.length < Math.floor(minDesiredEdges * 0.6);

        if (isSparse) {
          const leavesByWbs = [...sortedLeaves];

          // Partition into contiguous segments to create `targetChains` independent chains.
          const chains: any[][] = [];
          const per = Math.ceil(leavesByWbs.length / targetChains);
          for (let c = 0; c < targetChains; c++) {
            const seg = leavesByWbs.slice(c * per, (c + 1) * per);
            if (seg.length) chains.push(seg);
          }

          let added = 0;
          for (const chain of chains) {
            for (let i = 1; i < chain.length; i++) {
              const prev = chain[i - 1];
              const cur = chain[i];
              const from = String(cur?.startGateId ?? '').trim();
              const to = String(prev?.endGateId ?? '').trim();
              if (!from || !to) continue;
              if (from === to) continue;
              const la = gateToLeaf.get(from);
              const lb = gateToLeaf.get(to);
              if (!la || !lb || la === lb) continue;

              const k = edgeKey(from, to);
              if (existing.has(k)) continue;
              if (wouldCreateCycle(from, to)) continue;

              existing.add(k);
              adj.get(to)?.add(from);
              interLeafDeps.push({
                taskId: from,
                dependsOnTaskId: to,
                relationship: 'FINISH_TO_START',
                reason: `Suplemento: trilha inter-leaf (WBS) para reduzir ilhas paralelas (chains=${targetChains})`,
                confidence: 0.15,
              });
              added++;
            }
          }

          if (added > 0) {
            this.logger.log(
              `[auto-infer] requestId=${requestId} interLeaf supplement added=${added} targetChains=${targetChains} totalInterLeaf=${interLeafDeps.length}`,
            );
          }
        }
      }

      if (interLeafMode !== 'none') {
        this.logger.log(
          `[auto-infer] requestId=${requestId} interLeaf mode=${interLeafMode} edgesAfterCrossLeafFilter=${interLeafDeps.length}`,
        );
        if (interLeafMode === 'ai' && interLeafDeps.length === 0) {
          this.logger.warn(
            `[auto-infer] requestId=${requestId} interLeaf ai produced 0 usable edges (may be overly conservative output).`,
          );
        }
      }
    }

    if (includeInterLeafGates && interLeafDeps.length > 0) {
      const bucket = interLeafMode === 'ai' ? '__inter-leaf-ai__' : '__inter-leaf-gates__';
      previewByLeaf[bucket] = {
        tasks: sortedLeaves.length,
        dependencies: interLeafDeps,
        durationMs: 0,
        upserted: 0,
      };
      totalDeps += interLeafDeps.length;
    }

    // If apply=true, apply once globally with a cycle-prevention filter across the whole project.
    let applySummary:
      | {
          attempted: number;
          accepted: number;
          rejectedCycle: number;
          skippedExisting: number;
          upserted: number;
          existingHasCycle: boolean;
          interLeafEdges: number;
        }
      | undefined;

    if (apply) {
      const allSuggested = leafResults
        .flatMap((r) => (Array.isArray(r.dependencies) ? r.dependencies : []))
        .concat(interLeafDeps as any);
      const taskIds = new Set(
        (tasks as any[]).map((t: any) => String(t?._id ?? t?.id ?? '').trim()).filter(Boolean),
      );
      const existingDeps = await this.cpmService.getDependencies(projectId);

      const existingCycle = this.findCycleInDependenciesScoped(existingDeps as any, taskIds);

      const edgeKey = (taskId: string, dependsOnTaskId: string) => `${taskId}<-${dependsOnTaskId}`;
      const existingKeys = new Set<string>();
      for (const d of existingDeps as any[]) {
        const taskId = String(d?.taskId ?? '').trim();
        const depId = String(d?.dependsOnTaskId ?? '').trim();
        if (!taskId || !depId) continue;
        existingKeys.add(edgeKey(taskId, depId));
      }

      // precedence adjacency: dependsOn -> task
      const adj = new Map<string, Set<string>>();
      for (const id of taskIds) adj.set(id, new Set());
      for (const d of existingDeps as any[]) {
        const taskId = String(d?.taskId ?? '').trim();
        const depId = String(d?.dependsOnTaskId ?? '').trim();
        if (!taskId || !depId) continue;
        if (!taskIds.has(taskId) || !taskIds.has(depId)) continue;
        adj.get(depId)!.add(taskId);
      }

      const wouldCreateCycle = (taskId: string, dependsOnTaskId: string) => {
        // adding edge dependsOn -> task creates cycle if task reaches dependsOn already
        const start = taskId;
        const target = dependsOnTaskId;
        const stack = [start];
        const visited = new Set<string>();
        while (stack.length) {
          const cur = stack.pop()!;
          if (cur === target) return true;
          if (visited.has(cur)) continue;
          visited.add(cur);
          const nexts = adj.get(cur);
          if (!nexts) continue;
          for (const n of nexts) stack.push(n);
        }
        return false;
      };

      const accepted: any[] = [];
      let rejectedCycle = 0;
      let skippedExisting = 0;

      for (const d of allSuggested as any[]) {
        const taskId = String(d?.taskId ?? '').trim();
        const depId = String(d?.dependsOnTaskId ?? '').trim();
        if (!taskId || !depId) continue;
        if (taskId === depId) continue;
        if (!taskIds.has(taskId) || !taskIds.has(depId)) continue;

        const k = edgeKey(taskId, depId);
        if (existingKeys.has(k)) {
          skippedExisting++;
          continue;
        }

        if (wouldCreateCycle(taskId, depId)) {
          rejectedCycle++;
          continue;
        }

        // accept
        existingKeys.add(k);
        adj.get(depId)!.add(taskId);
        accepted.push({
          taskId,
          dependsOnTaskId: depId,
          projectId,
          relationship: d?.relationship,
          reason: d?.reason,
          isAutoIdentified: true,
        });
      }

      const upserted = accepted.length > 0 ? await this.cpmService.upsertDependencies(accepted) : 0;

      applySummary = {
        attempted: allSuggested.length,
        accepted: accepted.length,
        rejectedCycle,
        skippedExisting,
        upserted,
        existingHasCycle: Boolean(existingCycle?.hasCycle),
        interLeafEdges: interLeafDeps.length,
      };

      this.logger.log(
        `[auto-infer] requestId=${requestId} applySummary attempted=${applySummary.attempted} accepted=${
          applySummary.accepted
        } rejectedCycle=${applySummary.rejectedCycle} skippedExisting=${
          applySummary.skippedExisting
        } upserted=${applySummary.upserted}`,
      );
    }

    this.logger.log(
      `[auto-infer] requestId=${requestId} done leafGroups=${groups.size} depsSuggested=${totalDeps} durationMs=${Date.now() - startedAt}`,
    );

    return {
      projectId,
      requestId,
      strategy,
      apply,
      includeInterLeafGates,
      interLeafStrategy,
      interLeafMode,
      maxInterLeafEdges,
      inferConcurrency,
      inferTimeoutMs,
      leafGroups: groups.size,
      dependenciesSuggested: totalDeps,
      previewByLeaf,
      ...(applySummary ? { applySummary } : {}),
      durationMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    };
  }

  private findCycleInDependencies(dependencies: TaskDependency[]): {
    hasCycle: boolean;
    cycleTaskIds: string[];
    cycleEdges: Array<{
      id?: string;
      taskId: string;
      dependsOnTaskId: string;
      isAutoIdentified?: boolean;
      reason?: string;
    }>;
  } {
    return this.findCycleInDependenciesScoped(dependencies);
  }

  private findCycleInDependenciesScoped(
    dependencies: TaskDependency[],
    validTaskIds?: Set<string>,
  ): {
    hasCycle: boolean;
    cycleTaskIds: string[];
    cycleEdges: Array<{
      id?: string;
      taskId: string;
      dependsOnTaskId: string;
      isAutoIdentified?: boolean;
      reason?: string;
    }>;
  } {
    const deps = Array.isArray(dependencies) ? dependencies : [];
    const adj = new Map<string, string[]>(); // taskId -> dependsOnTaskId[]
    const edgeByKey = new Map<string, any>();
    const nodes = new Set<string>();

    for (const d of deps as any[]) {
      const taskId = String(d?.taskId ?? '').trim();
      const depId = String(d?.dependsOnTaskId ?? '').trim();
      if (!taskId || !depId) continue;
      if (validTaskIds && (!validTaskIds.has(taskId) || !validTaskIds.has(depId))) continue;
      nodes.add(taskId);
      nodes.add(depId);
      const list = adj.get(taskId) ?? [];
      list.push(depId);
      adj.set(taskId, list);
      edgeByKey.set(`${taskId}<-${depId}`, d);
    }

    const color = new Map<string, 0 | 1 | 2>();
    const parent = new Map<string, string>();

    for (const id of nodes) color.set(id, 0);

    const buildCycle = (cur: string, next: string) => {
      // cur -> next where next is currently in recursion stack
      const path: string[] = [cur];
      let p = cur;
      while (parent.has(p) && parent.get(p)! !== next) {
        p = parent.get(p)!;
        path.push(p);
        if (path.length > nodes.size + 5) break;
      }
      // Ensure we include next
      path.push(next);
      path.reverse();
      return path;
    };

    const dfs = (u: string): string[] | null => {
      color.set(u, 1);
      for (const v of adj.get(u) ?? []) {
        const c = color.get(v) ?? 0;
        if (c === 0) {
          parent.set(v, u);
          const found = dfs(v);
          if (found) return found;
        } else if (c === 1) {
          return buildCycle(u, v);
        }
      }
      color.set(u, 2);
      return null;
    };

    let cycleTaskIds: string[] = [];
    for (const id of nodes) {
      if ((color.get(id) ?? 0) === 0) {
        const found = dfs(id);
        if (found && found.length >= 2) {
          cycleTaskIds = found;
          break;
        }
      }
    }

    if (cycleTaskIds.length === 0) {
      return { hasCycle: false, cycleTaskIds: [], cycleEdges: [] };
    }

    const cycleEdges: Array<{
      id?: string;
      taskId: string;
      dependsOnTaskId: string;
      isAutoIdentified?: boolean;
      reason?: string;
    }> = [];
    for (let i = 0; i < cycleTaskIds.length - 1; i++) {
      const taskId = cycleTaskIds[i];
      const dependsOnTaskId = cycleTaskIds[i + 1];
      const doc = edgeByKey.get(`${taskId}<-${dependsOnTaskId}`);
      cycleEdges.push({
        id: doc?._id?.toString?.() ?? doc?.id,
        taskId,
        dependsOnTaskId,
        isAutoIdentified: Boolean(doc?.isAutoIdentified),
        reason: doc?.reason,
      });
    }

    return { hasCycle: true, cycleTaskIds, cycleEdges };
  }

  @Get('projects/:projectId/dependencies/cycle')
  @ApiOperation({
    summary: 'Detectar ciclo em dependências do projeto',
    description:
      'Retorna um exemplo de ciclo (lista de taskIds e arestas) para diagnóstico no frontend.',
  })
  async getDependencyCycle(@Param('projectId') projectId: string) {
    const tasks = await this.tasksService.findByProjectId(projectId);
    const validTaskIds = new Set(
      (tasks as any[]).map((t: any) => String(t?._id ?? t?.id ?? '').trim()).filter(Boolean),
    );
    const deps = await this.cpmService.getDependencies(projectId);
    const cycle = this.findCycleInDependenciesScoped(deps as any, validTaskIds);
    return {
      projectId,
      hasCycle: cycle.hasCycle,
      taskCount: validTaskIds.size,
      totalDependencies: Array.isArray(deps) ? deps.length : 0,
      cycleTaskIds: cycle.cycleTaskIds,
      cycleEdges: cycle.cycleEdges,
      timestamp: new Date().toISOString(),
    };
  }

  @Post('projects/:projectId/dependencies/cycle/clear')
  @ApiOperation({
    summary: 'Quebrar ciclo removendo dependências',
    description:
      'Remove arestas que formam ciclos. Por padrão, remove apenas dependências auto-identificadas (mais seguro).',
  })
  async clearDependencyCycle(
    @Param('projectId') projectId: string,
    @Body() body: ClearDependencyCycleDto,
  ) {
    const startedAt = Date.now();
    const mode = body?.mode ?? 'auto-only';
    const maxRemovals = Math.max(1, Math.min(Number(body?.maxRemovals ?? 25), 200));

    const tasks = await this.tasksService.findByProjectId(projectId);
    const validTaskIds = new Set(
      (tasks as any[]).map((t: any) => String(t?._id ?? t?.id ?? '').trim()).filter(Boolean),
    );

    let deps = await this.cpmService.getDependencies(projectId);
    const removedEdges: Array<{
      id?: string;
      taskId: string;
      dependsOnTaskId: string;
      isAutoIdentified?: boolean;
      reason?: string;
    }> = [];

    for (let i = 0; i < maxRemovals; i++) {
      const cycle = this.findCycleInDependenciesScoped(deps as any, validTaskIds);
      if (!cycle.hasCycle) {
        const durationMs = Date.now() - startedAt;
        this.logger.log(
          `[cycle-clear] projectId=${projectId} mode=${mode} removed=${removedEdges.length} done durationMs=${durationMs}`,
        );
        return {
          projectId,
          cleared: removedEdges.length > 0,
          hasCycleAfter: false,
          taskCount: validTaskIds.size,
          removedEdges,
          durationMs,
          timestamp: new Date().toISOString(),
        };
      }

      const candidates =
        mode === 'all' ? cycle.cycleEdges : cycle.cycleEdges.filter((e) => e.isAutoIdentified);

      if (!candidates || candidates.length === 0) {
        const durationMs = Date.now() - startedAt;
        this.logger.warn(
          `[cycle-clear] projectId=${projectId} mode=${mode} cannotClear removed=${removedEdges.length} durationMs=${durationMs}`,
        );
        return {
          projectId,
          cleared: removedEdges.length > 0,
          hasCycleAfter: true,
          taskCount: validTaskIds.size,
          reason:
            mode === 'auto-only'
              ? 'Ciclo detectado, mas não há arestas auto-identificadas no ciclo. Use mode="all" se quiser forçar.'
              : 'Ciclo detectado, mas não há arestas removíveis.',
          removedEdges,
          cycleTaskIds: cycle.cycleTaskIds,
          cycleEdges: cycle.cycleEdges,
          durationMs,
          timestamp: new Date().toISOString(),
        };
      }

      // Remove one edge at a time to safely break cycles
      const edge = candidates[0];
      if (!edge?.id) {
        // Fallback: remove by key if id missing
        const beforeLen = deps.length;
        deps = deps.filter(
          (d: any) =>
            !(String(d?.taskId) === edge.taskId && String(d?.dependsOnTaskId) === edge.dependsOnTaskId),
        );
        if (deps.length === beforeLen) {
          // nothing removed
          continue;
        }
        removedEdges.push(edge);
        continue;
      }

      const deleted = await this.cpmService.removeDependenciesByIds([edge.id]);
      if (deleted > 0) {
        removedEdges.push(edge);
        deps = deps.filter((d: any) => String(d?._id ?? d?.id ?? '') !== String(edge.id));
      } else {
        // If delete failed, avoid infinite loop
        break;
      }
    }

    // Max removals reached
    const finalDeps = await this.cpmService.getDependencies(projectId);
    const finalCycle = this.findCycleInDependenciesScoped(finalDeps as any, validTaskIds);
    const durationMs = Date.now() - startedAt;
    return {
      projectId,
      cleared: removedEdges.length > 0,
      hasCycleAfter: finalCycle.hasCycle,
      taskCount: validTaskIds.size,
      removedEdges,
      cycleTaskIds: finalCycle.cycleTaskIds,
      cycleEdges: finalCycle.cycleEdges,
      durationMs,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Adiciona uma dependência entre duas tarefas
   * @param projectId ID do projeto
   * @param addDependencyDto DTO com taskId, dependsOnTaskId, relationship e reason opcionais
   */
  @Post(':projectId/dependencies')
  @ApiOperation({
    summary: 'Adicionar dependência entre tarefas',
    description:
      'Cria uma nova relação de dependência entre duas tarefas. Por exemplo, a Tarefa B depende da Tarefa A.',
  })
  @ApiResponse({
    status: 201,
    description: 'Dependência criada com sucesso',
    type: DependencyResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Erro de validação (tarefas não encontradas ou ciclo detectado)',
  })
  @ApiResponse({
    status: 409,
    description: 'Dependência já existe ou criaria um ciclo',
  })
  async addDependency(
    @Param('projectId') projectId: string,
    @Body() addDependencyDto: AddDependencyDto,
  ) {
    // Validar que ambas as tarefas existem
    const [task1, task2] = await Promise.all([
      this.tasksService.findOne(addDependencyDto.taskId),
      this.tasksService.findOne(addDependencyDto.dependsOnTaskId),
    ]);

    if (!task1 || !task2) {
      throw new Error('Uma ou ambas as tarefas não foram encontradas');
    }

    const dependency = await this.cpmService.addDependency({
      taskId: addDependencyDto.taskId,
      dependsOnTaskId: addDependencyDto.dependsOnTaskId,
      projectId,
      reason: addDependencyDto.reason,
      relationship: addDependencyDto.relationship || 'FINISH_TO_START',
    });

    return {
      id: dependency.id,
      taskId: dependency.taskId,
      dependsOnTaskId: dependency.dependsOnTaskId,
      relationship: dependency.relationship,
      reason: dependency.reason,
      createdAt: dependency.createdAt,
    };
  }

  /**
   * Remove uma dependência entre duas tarefas
   * @param taskId ID da tarefa dependente
   * @param dependsOnTaskId ID da tarefa que ela depende
   */
  @Delete(':taskId/dependencies/:dependsOnTaskId')
  @ApiOperation({
    summary: 'Remover dependência entre tarefas',
    description:
      'Remove a relação de dependência entre Tarefa A (taskId) e sua predecessora (dependsOnTaskId).',
  })
  @ApiResponse({
    status: 200,
    description: 'Dependência removida com sucesso',
  })
  @ApiResponse({
    status: 404,
    description: 'Dependência não encontrada',
  })
  async removeDependency(
    @Param('taskId') taskId: string,
    @Param('dependsOnTaskId') dependsOnTaskId: string,
  ) {
    await this.cpmService.removeDependency(taskId, dependsOnTaskId);
    return { message: 'Dependência removida com sucesso' };
  }

  /**
   * Calcula o caminho crítico do projeto
   * Retorna quais tarefas são críticas e a duração total do projeto
   * @param projectId ID do projeto
   */
  @Get('projects/:projectId/critical-path')
  @ApiOperation({
    summary: 'Calcular Caminho Crítico (CPM)',
    description:
      'Analisa todas as tarefas do projeto e calcula o caminho crítico, identificando quais tarefas podem causar atraso no prazo final se atrasarem.',
  })
  @ApiResponse({
    status: 200,
    description: 'Análise CPM realizada com sucesso',
    type: CalculateCriticalPathResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Projeto não encontrado',
  })
  async calculateCriticalPath(@Param('projectId') projectId: string) {
    // Buscar todas as tarefas do projeto com suas durações PERT
    const tasks = await this.tasksService.findByProjectId(projectId);

    // Converter para TaskNode
    const taskNodes: TaskNode[] = tasks.map((task) => ({
      id: (task as any)._id?.toString() || task.id,
      name: (task as any).title || (task as any).name || 'Task',
      duration: (task as any).pertExpectedMinutes || (task as any).estimatedMinutes || 60, // Fallback se PERT não calculado
      dependencies: [], // Será preenchido abaixo
      dependencyEdges: [],
      parentWbsNodeId: (task as any).parentWbsNodeId ? String((task as any).parentWbsNodeId) : undefined,
      wbsPath: (task as any).wbsPath ? String((task as any).wbsPath) : undefined,
    }));

    // Buscar todas as dependências do projeto
    const dependencies = await this.cpmService.getDependencies(projectId);

    // Preencher as dependências nas TaskNodes (Map para eficiência)
    const nodeById = new Map<string, TaskNode>();
    for (const n of taskNodes) nodeById.set(n.id, n);

    for (const dep of dependencies as any[]) {
      const taskId = String(dep?.taskId ?? '').trim();
      const depId = String(dep?.dependsOnTaskId ?? '').trim();
      if (!taskId || !depId) continue;
      const taskNode = nodeById.get(taskId);
      if (taskNode) {
        taskNode.dependencies.push(depId);
        taskNode.dependencyEdges?.push({
          predecessorId: depId,
          relationship: this.cpmService.normalizeRelationship(dep?.relationship),
        });
      }
    }

    // Calcular CPM
    const analysis = this.cpmService.calculateCriticalPath(taskNodes);

    // NOVO: Calcular buffer consolidado também quando CPM é calculado
    try {
      const taskDocs = await this.tasksService.findByProjectId(projectId);

      const taskMetrics: BufferTaskMetrics[] = (taskDocs as any[]).map((task) => {
        const id = task._id?.toString() || task.id;
        const minutes = Number(task.pertExpectedMinutes ?? task.estimatedMinutes ?? 60);
        return {
          taskId: String(id ?? ''),
          // Keep same units used by CPM (minutes) to avoid unit mismatch with other callers.
          estimatedHours: Number(minutes ?? 0),
          variance: Number(task.pertVariance ?? task.variance ?? 0),
          isCritical: analysis.criticalPath.includes(String(id ?? '')),
        } as BufferTaskMetrics;
      });

      // Diagnóstico: contar tarefas com variança > 0
      const tasksWithVariance = taskMetrics.filter((t) => (t.variance ?? 0) > 0).length;
      const totalVariance = taskMetrics.reduce((sum, t) => sum + (t.variance ?? 0), 0);

      this.logger.log(
        `[Buffer Calc] ${tasksWithVariance}/${taskMetrics.length} tarefas com variança, variança total: ${totalVariance.toFixed(2)}`,
      );

      await this.bufferService.calculateProjectBuffer({
        projectId,
        tasks: taskMetrics,
        criticalPath: analysis.criticalPath,
      });
      this.logger.log(`Buffer recalculado para projeto ${projectId}`);
    } catch (error: any) {
      this.logger.warn(`Erro ao calcular buffer: ${error?.message ?? String(error)}`);
      // Não falha o CPM se buffer falhar - apenas log
    }

    return {
      projectId,
      analysis: analysis,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Obtém métricas detalhadas de uma tarefa específica
   * @param taskId ID da tarefa
   * @param projectId ID do projeto (query parameter)
   */
  @Get(':taskId/metrics')
  @ApiOperation({
    summary: 'Obter métricas de uma tarefa',
    description:
      'Retorna as métricas CPM detalhadas de uma tarefa: ES (Início Cedo), EF (Término Cedo), LS (Início Tarde), LF (Término Tarde), Folga e Status Crítico.',
  })
  @ApiResponse({
    status: 200,
    description: 'Métricas retornadas com sucesso',
    type: TaskMetricsResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Tarefa não encontrada',
  })
  async getTaskMetrics(
    @Param('taskId') taskId: string,
    @Query('projectId') projectId: string,
  ): Promise<TaskMetricsResponseDto> {
    // Buscar tarefa
    const task = await this.tasksService.findOne(taskId);

    if (!task) {
      throw new Error('Tarefa não encontrada');
    }

    // Criar TaskNode e calcular métricas
    const taskNode: TaskNode = {
      id: (task as any)._id?.toString() || task.id,
      name: (task as any).title || (task as any).name || 'Task',
      duration: (task as any).pertExpectedMinutes || (task as any).estimatedMinutes || 60,
      dependencies: [],
      dependencyEdges: [],
      parentWbsNodeId: (task as any).parentWbsNodeId ? String((task as any).parentWbsNodeId) : undefined,
      wbsPath: (task as any).wbsPath ? String((task as any).wbsPath) : undefined,
    };

    // Buscar dependências
    const dependencies = await this.cpmService.getDependencies(projectId);
    const taskDeps = dependencies.filter((d) => d.taskId.toString() === taskId);
    taskNode.dependencies = taskDeps.map((d) => d.dependsOnTaskId.toString());
    taskNode.dependencyEdges = taskDeps.map((d: any) => ({
      predecessorId: String(d.dependsOnTaskId),
      relationship: this.cpmService.normalizeRelationship(d.relationship),
    }));

    // Calcular CPM completo do projeto para ter contexto correto
    const projectTasks = await this.tasksService.findByProjectId(projectId);
    const allTaskNodes: TaskNode[] = projectTasks.map((t) => ({
      id: (t as any)._id?.toString() || t.id,
      name: (t as any).title || (t as any).name || 'Task',
      duration: (t as any).pertExpectedMinutes || (t as any).estimatedMinutes || 60,
      dependencies: [],
      dependencyEdges: [],
      parentWbsNodeId: (t as any).parentWbsNodeId ? String((t as any).parentWbsNodeId) : undefined,
      wbsPath: (t as any).wbsPath ? String((t as any).wbsPath) : undefined,
    }));

    const nodeById = new Map<string, TaskNode>();
    for (const n of allTaskNodes) nodeById.set(n.id, n);
    for (const dep of dependencies as any[]) {
      const taskIdStr = String(dep?.taskId ?? '').trim();
      const depIdStr = String(dep?.dependsOnTaskId ?? '').trim();
      if (!taskIdStr || !depIdStr) continue;
      const node = nodeById.get(taskIdStr);
      if (node) {
        node.dependencies.push(depIdStr);
        node.dependencyEdges?.push({
          predecessorId: depIdStr,
          relationship: this.cpmService.normalizeRelationship(dep?.relationship),
        });
      }
    }

    // Calcular CPM
    const analysis = this.cpmService.calculateCriticalPath(allTaskNodes);

    // Encontrar a tarefa na análise
    const taskWithMetrics = analysis.tasksByImpact.find((t) => t.id === taskId);

    if (!taskWithMetrics) {
      throw new Error('Não foi possível calcular métricas para a tarefa');
    }

    return {
      taskId: taskWithMetrics.id,
      taskName: taskWithMetrics.name,
      earlyStart: taskWithMetrics.earlyStart ?? 0,
      earlyFinish: taskWithMetrics.earlyFinish ?? 0,
      lateStart: taskWithMetrics.lateStart ?? 0,
      lateFinish: taskWithMetrics.lateFinish ?? 0,
      slack: taskWithMetrics.slack ?? 0,
      isCritical: Boolean(taskWithMetrics.isCritical),
    };
  }

  /**
   * Lista todas as dependências de um projeto
   * @param projectId ID do projeto
   */
  @Get('projects/:projectId/dependencies')
  @ApiOperation({
    summary: 'Listar todas as dependências do projeto',
    description: 'Retorna uma lista de todas as relações de dependência entre tarefas do projeto.',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de dependências',
    type: GetDependenciesResponseDto,
  })
  async getDependencies(@Param('projectId') projectId: string) {
    const dependencies = await this.cpmService.getDependencies(projectId);

    return {
      projectId,
      count: dependencies.length,
      dependencies: dependencies.map((d) => {
        return {
          id: d.id,
          taskId: d.taskId,
          dependsOnTaskId: d.dependsOnTaskId,
          relationship: d.relationship,
          reason: d.reason,
          isAutoIdentified: d.isAutoIdentified,
          createdAt: d.createdAt,
        };
      }),
    };
  }
}
