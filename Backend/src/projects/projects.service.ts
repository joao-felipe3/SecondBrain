import { InjectModel } from '@nestjs/mongoose';
import { TaskDocument } from '../tasks/schemas/task.schema';
import { Injectable, NotFoundException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { Model, Types } from 'mongoose';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectDocument } from './schemas/project.schema';
import { CPMService, type TaskNode } from '../tasks/services/cpm.service';
import type { GanttDataResponse } from './dto/gantt.dto';
import type { PertDiagramDataResponse } from './dto/pert-diagram.dto';
import { ProjectWave, type ProjectWaveDocument } from './schemas/project-wave.schema';
import type { CreateXMatrixDto, XMatrixResponseDto, XMatrixStrength } from './dto/x-matrix.dto';
import { XMatrixSnapshot, type XMatrixSnapshotDocument } from './schemas/x-matrix-snapshot.schema';

@Injectable()
export class ProjectsService {
	constructor(
		@InjectModel('Project') private readonly projectModel: Model<ProjectDocument>,
		@InjectModel('Task') private readonly taskModel: Model<TaskDocument>,
		@InjectModel(ProjectWave.name) private readonly waveModel: Model<ProjectWaveDocument>,
		@InjectModel(XMatrixSnapshot.name) private readonly xMatrixSnapshotModel: Model<XMatrixSnapshotDocument>,
		@Inject(forwardRef(() => CPMService))
		private readonly cpmService: CPMService,
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
			'de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o', 'as', 'os', 'um', 'uma',
			'para', 'com', 'por', 'no', 'na', 'nos', 'nas', 'em', 'the', 'and', 'to',
			'of', 'for', 'in', 'on', 'at', 'is', 'are', 'be', 'ser', 'estar', 'que',
		]);

		const tokens = normalized
			.split(/\s+/g)
			.map((token) => token.trim())
			.filter((token) => token.length >= 3 && !stopwords.has(token));

		return new Set(tokens);
	}

	private scoreStrength(fromText: string, toText: string): { strength: XMatrixStrength; score: number; rationale: string } {
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
		if (!projectId || projectId === 'null' || projectId === 'undefined' || !Types.ObjectId.isValid(projectId)) {
			throw new BadRequestException(`ID invalido: ${projectId}`);
		}

		const project = await this.projectModel.findById(projectId).exec();
		if (!project) throw new NotFoundException('Project not found');

		const includeCompleted = dto?.includeCompleted ?? true;
		const maxTacticalItems = Math.max(20, Math.min(160, Number(dto?.maxTacticalItems || 80)));
		const wbsLevels = new Set((dto?.wbsLevels || [1, 2]).filter((level) => Number.isFinite(level) && level >= 1));

		const taskQuery: Record<string, any> = { project: projectId };
		if (!includeCompleted) taskQuery.isConcluded = { $ne: true };
		if (dto?.taskIds?.length) {
			taskQuery._id = { $in: dto.taskIds.filter((id) => Types.ObjectId.isValid(id)).map((id) => new Types.ObjectId(id)) };
		}

		const [tasks, waves] = await Promise.all([
			this.taskModel.find(taskQuery).exec(),
			this.waveModel.find({ projectId: new Types.ObjectId(projectId) }).sort({ waveNumber: 1 }).exec(),
		]);

		const strategyFromDto = (dto?.strategy3to5Years || []).map((item) => String(item || '').trim()).filter(Boolean);
		const strategyFallback = [
			...this.splitGoalText(project.longTermGoal),
			...this.splitGoalText(project.smartObjective?.relevant),
			...this.splitGoalText(project.smartObjective?.summary),
		].filter(Boolean);
		const strategyGoalsRaw = strategyFromDto.length ? strategyFromDto : strategyFallback;

		const annualFromDto = (dto?.annualGoals || []).map((item) => String(item || '').trim()).filter(Boolean);
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
				const wavesText = Array.from(item.waveNumbers.values()).sort((a, b) => a - b).join(', ');
				return {
					id: item.id || `TAC${index + 1}`,
					label: wavesText ? `${item.label} (Ondas ${wavesText})` : item.label,
					source: 'wbs-l1-l2',
				};
			});

		const tacticalContextById = new Map<string, string>();
		for (const item of Array.from(tacticalById.values())) {
			const wavesText = Array.from(item.waveNumbers.values()).sort((a, b) => a - b).join(', ');
			const mergedDescriptions = item.descriptions.slice(0, 4).join(' | ');
			tacticalContextById.set(
				item.id,
				[item.label, mergedDescriptions, wavesText ? `Ondas ${wavesText}` : 'Sem onda definida'].filter(Boolean).join(' | '),
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
		if (strategyGoals.length === 0) warnings.push('Nao foi possivel identificar objetivos estrategicos.');
		if (annualGoals.length === 0) warnings.push('Nao foi possivel identificar metas anuais.');
		if (tacticalItems.length === 0) warnings.push('Projeto sem iniciativas taticas suficientes (WBS nivel 1/2).');
		if (tacticalById.size > tacticalItems.length) {
			warnings.push(`Eixo tatico truncado para ${tacticalItems.length} iniciativas para manter legibilidade.`);
		}
		if (waves.length === 0) warnings.push('Nenhuma onda encontrada. Defina ondas para aplicar zoom tatico mensal/trimestral.');

		const projectStart = project.startDate ? new Date(project.startDate) : null;
		const projectEnd = project.deadline ? new Date(project.deadline) : null;
		if (projectStart && projectEnd && projectEnd.getTime() > projectStart.getTime()) {
			const durationDays = Math.ceil((projectEnd.getTime() - projectStart.getTime()) / (1000 * 60 * 60 * 24));
			if (durationDays <= 120) {
				warnings.push('Zoom fractal aplicado: trate Norte como fim do semestre e Estrategico como metas mensais.');
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

		const usefulAnnualIds = usefulAnnualIdsFromNorth.size > 0
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

			if (activeStrategyIds.size === 0) activeStrategyIds = new Set(strategyGoals.map((item) => item.id));
			if (activeTacticalIds.size === 0) activeTacticalIds = new Set(tacticalItems.map((item) => item.id));
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
			warnings.push(`Metas estrategicas sem correlacao foram ocultadas (${annualGoals.length - filteredAnnualGoals.length}).`);
		}
		if (filteredStrategyGoals.length < strategyGoals.length) {
			warnings.push(`Diretrizes norte sem correlacao foram ocultadas (${strategyGoals.length - filteredStrategyGoals.length}).`);
		}
		if (filteredTacticalItems.length < tacticalItems.length) {
			warnings.push(`Iniciativas taticas sem correlacao foram ocultadas (${tacticalItems.length - filteredTacticalItems.length}).`);
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

		await this.xMatrixSnapshotModel.updateOne(
			{ projectId: new Types.ObjectId(projectId) },
			{ $set: { data: response } },
			{ upsert: true },
		).exec();

		return response;
	}

	async getSavedXMatrix(projectId: string): Promise<XMatrixResponseDto | null> {
		if (!projectId || projectId === 'null' || projectId === 'undefined' || !Types.ObjectId.isValid(projectId)) {
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
			await this.xMatrixSnapshotModel.updateOne(
				{ projectId: new Types.ObjectId(projectId) },
				{ $set: { data: legacySnapshot } },
				{ upsert: true },
			).exec();

			await this.projectModel.updateOne(
				{ _id: projectId },
				{ $unset: { xMatrixSnapshot: '' } },
			).exec();

			return legacySnapshot as XMatrixResponseDto;
		}

		return null;
	}

	async getGanttData(
		projectId: string,
		options?: { includeCompleted?: boolean },
	): Promise<GanttDataResponse> {
		if (!projectId || projectId === 'null' || projectId === 'undefined' || !Types.ObjectId.isValid(projectId)) {
			throw new BadRequestException(`ID inválido: ${projectId}`);
		}

		const project = await this.projectModel.findById(projectId).exec();
		if (!project) {
			throw new NotFoundException('Project not found');
		}

		const includeCompleted = options?.includeCompleted ?? true;
		const query: Record<string, any> = { project: projectId };
		if (!includeCompleted) query.isConcluded = { $ne: true };

		const [tasks, dependencies, waves] = await Promise.all([
			this.taskModel.find(query).exec(),
			this.cpmService.getDependencies(projectId),
			this.waveModel.find({ projectId: new Types.ObjectId(projectId) }).sort({ waveNumber: 1 }).exec(),
		]);

		const toMinutes = (task: any): number => {
			if (typeof task?.pertExpectedMinutes === 'number' && task.pertExpectedMinutes > 0) {
				return task.pertExpectedMinutes;
			}
			if (typeof task?.pomodorosPlanned === 'number' && task.pomodorosPlanned > 0) {
				return task.pomodorosPlanned * 25;
			}
			return 60;
		};

		const taskNodes: TaskNode[] = tasks.map((task: any) => ({
			id: task?._id?.toString?.() || String(task?.id || ''),
			name: String(task?.title || task?.name || 'Task'),
			duration: toMinutes(task),
			dependencies: [],
			dependencyEdges: [],
			parentWbsNodeId: task?.parentWbsNodeId ? String(task.parentWbsNodeId) : undefined,
			wbsPath: task?.wbsPath ? String(task.wbsPath) : undefined,
		}));

		const nodeById = new Map<string, TaskNode>();
		for (const node of taskNodes) nodeById.set(node.id, node);

		for (const dep of dependencies as any[]) {
			const taskId = String(dep?.taskId || '').trim();
			const dependsOnTaskId = String(dep?.dependsOnTaskId || '').trim();
			if (!taskId || !dependsOnTaskId) continue;
			const node = nodeById.get(taskId);
			if (node) {
				node.dependencies.push(dependsOnTaskId);
				node.dependencyEdges?.push({
					predecessorId: dependsOnTaskId,
					relationship: this.cpmService.normalizeRelationship(dep?.relationship),
				});
			}
		}

		const analysis = this.cpmService.calculateCriticalPath(taskNodes);

		const waveByTaskId = new Map<string, ProjectWaveDocument>();
		for (const wave of waves) {
			for (const taskId of (wave.taskIds || [])) {
				waveByTaskId.set(String(taskId), wave);
			}
		}

		const fallbackProjectStart = project.startDate
			? new Date(project.startDate)
			: (waves[0]?.startDate ? new Date(waves[0].startDate) : new Date());

		const metricsById = new Map<string, TaskNode>();
		for (const metric of analysis.tasksByImpact) {
			metricsById.set(metric.id, metric);
		}

		const round2 = (value: number) => Number((Number.isFinite(value) ? value : 0).toFixed(2));
		const addHours = (base: Date, hours: number) => {
			const date = new Date(base);
			date.setTime(date.getTime() + Math.max(0, hours) * 60 * 60 * 1000);
			return date.toISOString();
		};

		const resolveWindowByDeadline = (task: any, durationHours: number) => {
			const taskId = task?._id?.toString?.() || String(task?.id || '');
			const wave = waveByTaskId.get(taskId) || null;

			const waveStart = wave?.startDate ? new Date(wave.startDate) : null;
			const waveEnd = wave?.endDate ? new Date(wave.endDate) : null;

			const taskDeadline = task?.deadline ? new Date(task.deadline) : null;
			const projectDeadline = project.deadline ? new Date(project.deadline) : null;
			const durationMs = Math.max(1, durationHours) * 60 * 60 * 1000;

			let effectiveEnd = taskDeadline || waveEnd || projectDeadline || new Date();
			if (waveEnd && effectiveEnd.getTime() > waveEnd.getTime()) {
				effectiveEnd = new Date(waveEnd);
			}

			let effectiveStart = new Date(effectiveEnd.getTime() - durationMs);

			if (waveStart && effectiveStart.getTime() < waveStart.getTime()) {
				effectiveStart = new Date(waveStart);
			}

			if (waveEnd && effectiveStart.getTime() > waveEnd.getTime()) {
				effectiveStart = new Date(Math.max(waveStart?.getTime?.() || (waveEnd.getTime() - durationMs), waveEnd.getTime() - durationMs));
				effectiveEnd = new Date(waveEnd);
			}

			if (effectiveStart.getTime() > effectiveEnd.getTime()) {
				effectiveStart = new Date(effectiveEnd.getTime() - durationMs);
			}

			return {
				startDate: effectiveStart.toISOString(),
				endDate: effectiveEnd.toISOString(),
			};
		};

		const taskItems = tasks
			.map((task: any) => {
				const id = task?._id?.toString?.() || String(task?.id || '');
				const metric = metricsById.get(id);
				const durationHours = round2(toMinutes(task) / 60);
				const earlyStart = round2(metric?.earlyStart ?? 0);
				const earlyFinish = round2(metric?.earlyFinish ?? durationHours);
				const lateStart = round2(metric?.lateStart ?? earlyStart);
				const lateFinish = round2(metric?.lateFinish ?? earlyFinish);
				const progress = Math.max(0, Math.min(100, Number(task?.evmProgress || 0) * 100));
				const timelineWindow = resolveWindowByDeadline(task, durationHours);

				return {
					id,
					name: String(task?.title || task?.name || 'Task'),
					startDate: timelineWindow.startDate,
					endDate: timelineWindow.endDate,
					durationHours,
					earlyStart,
					earlyFinish,
					lateStart,
					lateFinish,
					slack: round2(metric?.slack ?? 0),
					isCritical: Boolean(metric?.isCritical),
					progress: round2(progress),
					isConcluded: Boolean(task?.isConcluded),
					priority: Number(task?.priority || 0),
					parentWbsNodeId: task?.parentWbsNodeId ? String(task.parentWbsNodeId) : undefined,
					wbsPath: task?.wbsPath ? String(task.wbsPath) : undefined,
				};
			})
			.sort((a, b) => {
				const left = new Date(a.startDate).getTime();
				const right = new Date(b.startDate).getTime();
				return left - right || a.name.localeCompare(b.name);
			});

		const dependencyItems = (dependencies as any[])
			.map((dep: any) => ({
				id: dep?._id?.toString?.() || `${dep.taskId}-${dep.dependsOnTaskId}`,
				fromTaskId: String(dep?.dependsOnTaskId || ''),
				toTaskId: String(dep?.taskId || ''),
				relationship: (dep?.relationship || 'finish-to-start') as 'finish-to-start' | 'start-to-start' | 'finish-to-finish',
				reason: dep?.reason ? String(dep.reason) : undefined,
				isAutoIdentified: Boolean(dep?.isAutoIdentified),
			}))
			.filter((dep) => dep.fromTaskId && dep.toTaskId);

		return {
			projectId,
			projectName: String(project.name || 'Projeto'),
			projectStartDate: fallbackProjectStart.toISOString(),
			projectDeadline: project.deadline ? new Date(project.deadline).toISOString() : null,
			projectDurationHours: round2(analysis.projectDuration),
			tasks: taskItems,
			dependencies: dependencyItems,
			criticalPath: analysis.criticalPath,
			alerts: analysis.alerts,
			diagnostics: analysis.diagnostics,
			packageCriticality: analysis.packageCriticality,
		};
	}

	async getPertDiagramData(
		projectId: string,
		options?: { includeCompleted?: boolean },
	): Promise<PertDiagramDataResponse> {
		if (!projectId || projectId === 'null' || projectId === 'undefined' || !Types.ObjectId.isValid(projectId)) {
			throw new BadRequestException(`ID inválido: ${projectId}`);
		}

		const project = await this.projectModel.findById(projectId).exec();
		if (!project) {
			throw new NotFoundException('Project not found');
		}

		const includeCompleted = options?.includeCompleted ?? true;
		const query: Record<string, any> = { project: projectId };
		if (!includeCompleted) query.isConcluded = { $ne: true };

		const [tasks, dependencies] = await Promise.all([
			this.taskModel.find(query).exec(),
			this.cpmService.getDependencies(projectId),
		]);

		const toMinutes = (task: any): number => {
			if (typeof task?.pertExpectedMinutes === 'number' && task.pertExpectedMinutes > 0) return task.pertExpectedMinutes;
			if (typeof task?.pomodorosPlanned === 'number' && task.pomodorosPlanned > 0) return task.pomodorosPlanned * 25;
			return 60;
		};

		const round2 = (value: number) => Number((Number.isFinite(value) ? value : 0).toFixed(2));

		const taskNodes: TaskNode[] = tasks.map((task: any) => ({
			id: task?._id?.toString?.() || String(task?.id || ''),
			name: String(task?.title || task?.name || 'Task'),
			duration: toMinutes(task),
			dependencies: [],
			dependencyEdges: [],
			parentWbsNodeId: task?.parentWbsNodeId ? String(task.parentWbsNodeId) : undefined,
			wbsPath: task?.wbsPath ? String(task.wbsPath) : undefined,
		}));

		const nodeById = new Map<string, TaskNode>();
		for (const node of taskNodes) nodeById.set(node.id, node);

		for (const dep of dependencies as any[]) {
			const taskId = String(dep?.taskId || '').trim();
			const dependsOnTaskId = String(dep?.dependsOnTaskId || '').trim();
			if (!taskId || !dependsOnTaskId) continue;
			const node = nodeById.get(taskId);
			if (node) {
				node.dependencies.push(dependsOnTaskId);
				node.dependencyEdges?.push({
					predecessorId: dependsOnTaskId,
					relationship: this.cpmService.normalizeRelationship(dep?.relationship),
				});
			}
		}

		const analysis = this.cpmService.calculateCriticalPath(taskNodes);
		const metricsById = new Map<string, TaskNode>();
		for (const metric of analysis.tasksByImpact) metricsById.set(metric.id, metric);

		const predecessorCount = new Map<string, number>();
		const predecessorMap = new Map<string, Set<string>>();
		for (const task of tasks as any[]) {
			const id = task?._id?.toString?.() || String(task?.id || '');
			predecessorCount.set(id, 0);
			predecessorMap.set(id, new Set<string>());
		}

		for (const dep of dependencies as any[]) {
			const target = String(dep?.taskId || '').trim();
			const source = String(dep?.dependsOnTaskId || '').trim();
			if (!predecessorMap.has(target) || !predecessorMap.has(source)) continue;
			if (!predecessorMap.get(target)!.has(source)) {
				predecessorMap.get(target)!.add(source);
				predecessorCount.set(target, (predecessorCount.get(target) || 0) + 1);
			}
		}

		const levelMemo = new Map<string, number>();
		const computeLevel = (taskId: string, stack = new Set<string>()): number => {
			if (levelMemo.has(taskId)) return levelMemo.get(taskId)!;
			if (stack.has(taskId)) return 0;
			stack.add(taskId);
			const predecessors = Array.from(predecessorMap.get(taskId) || []);
			if (predecessors.length === 0) {
				levelMemo.set(taskId, 0);
				stack.delete(taskId);
				return 0;
			}

			const level = 1 + Math.max(...predecessors.map((id) => computeLevel(id, stack)));
			levelMemo.set(taskId, level);
			stack.delete(taskId);
			return level;
		};

		const criticalSet = new Set(analysis.criticalPath || []);
		const nodes = tasks.map((task: any) => {
			const id = task?._id?.toString?.() || String(task?.id || '');
			const metric = metricsById.get(id);
			const durationHours = round2(toMinutes(task) / 60);
			const earlyStart = round2(metric?.earlyStart ?? 0);
			const earlyFinish = round2(metric?.earlyFinish ?? durationHours);
			const lateStart = round2(metric?.lateStart ?? earlyStart);
			const lateFinish = round2(metric?.lateFinish ?? earlyFinish);
			const slack = round2(metric?.slack ?? 0);
			const progress = Math.max(0, Math.min(100, Number(task?.evmProgress || 0) * 100));
			const level = computeLevel(id);
			return {
				id,
				name: String(task?.title || task?.name || 'Task'),
				durationHours,
				earlyStart,
				earlyFinish,
				lateStart,
				lateFinish,
				slack,
				isCritical: Boolean(metric?.isCritical),
				progress: round2(progress),
				isConcluded: Boolean(task?.isConcluded),
				priority: Number(task?.priority || 0),
				parentWbsNodeId: task?.parentWbsNodeId ? String(task.parentWbsNodeId) : undefined,
				wbsPath: task?.wbsPath ? String(task.wbsPath) : undefined,
				x: level,
				y: earlyStart,
			};
		});

		const edges = (dependencies as any[])
			.map((dep: any) => {
				const source = String(dep?.dependsOnTaskId || '').trim();
				const target = String(dep?.taskId || '').trim();
				if (!source || !target || !nodeById.has(source) || !nodeById.has(target)) return null;

				return {
					id: dep?._id?.toString?.() || `${source}-${target}`,
					source,
					target,
					relationship: (dep?.relationship || 'finish-to-start') as 'finish-to-start' | 'start-to-start' | 'finish-to-finish',
					reason: dep?.reason ? String(dep.reason) : undefined,
					isAutoIdentified: Boolean(dep?.isAutoIdentified),
					isCriticalEdge: criticalSet.has(source) && criticalSet.has(target),
				};
			})
			.filter(Boolean) as PertDiagramDataResponse['edges'];

		const totalTasks = nodes.length;
		const criticalTasks = nodes.filter((node) => node.isCritical).length;

		return {
			projectId,
			projectName: String(project.name || 'Projeto'),
			projectDurationHours: round2(analysis.projectDuration),
			nodes,
			edges,
			criticalPath: analysis.criticalPath,
			alerts: analysis.alerts,
			statistics: {
				totalTasks,
				criticalTasks,
				criticalPercent: totalTasks > 0 ? round2((criticalTasks / totalTasks) * 100) : 0,
				totalEdges: edges.length,
				maxParallelism: round2(analysis.diagnostics?.impliedParallelism || 0),
			},
			diagnostics: analysis.diagnostics,
			packageCriticality: analysis.packageCriticality,
		};
	}

	async getTasksForProject(projectId: string): Promise<TaskDocument[]> {
		if (!projectId || projectId === 'null' || projectId === 'undefined' || !Types.ObjectId.isValid(projectId)) {
			throw new BadRequestException(`ID inválido: ${projectId}`);
		}
		return this.taskModel.find({ project: projectId }).exec();
	}

	async create(dto: CreateProjectDto): Promise<ProjectDocument> {
		const created = new this.projectModel(dto);
		return await created.save();
	}

	async findAll(): Promise<ProjectDocument[]> {
		return await this.projectModel.find().exec();
	}

	async findOne(id: string): Promise<ProjectDocument | null> {
		if (!id || id === 'null' || id === 'undefined' || !Types.ObjectId.isValid(id)) {
			throw new BadRequestException(`ID inválido: ${id}`);
		}
		return await this.projectModel.findById(id).exec();
	}

	async update(id: string, dto: UpdateProjectDto): Promise<ProjectDocument | null> {
		if (!id || id === 'null' || id === 'undefined' || !Types.ObjectId.isValid(id)) {
			throw new BadRequestException(`ID inválido: ${id}`);
		}
		return await this.projectModel.findByIdAndUpdate(id, dto, { new: true }).exec();
	}

	async remove(id: string): Promise<boolean> {
		if (!id || id === 'null' || id === 'undefined' || !Types.ObjectId.isValid(id)) {
			throw new BadRequestException(`ID inválido: ${id}`);
		}
		const result = await this.projectModel.findByIdAndDelete(id).exec();
		return result !== null;
	}

	/**
	 * Delete a project with options for handling associated tasks
	 * @param id - Project ID
	 * @param deleteTasks - If true, delete all tasks; if false, just unlink them
	 */
	async removeWithOptions(id: string, deleteTasks: boolean): Promise<{ deleted: boolean; tasksAffected: number }> {
		if (!id || id === 'null' || id === 'undefined' || !Types.ObjectId.isValid(id)) {
			throw new BadRequestException(`ID inválido: ${id}`);
		}
		
		const project = await this.projectModel.findById(id).exec();
		if (!project) {
			return { deleted: false, tasksAffected: 0 };
		}

		const tasks = await this.taskModel.find({ project: id }).exec();
		const tasksAffected = tasks.length;

		if (deleteTasks) {
			// Delete all tasks associated with this project
			await this.taskModel.deleteMany({ project: id }).exec();
		} else {
			// Just unlink tasks from project
			await this.taskModel.updateMany(
				{ project: id },
				{ $unset: { project: '' } }
			).exec();
		}

		// Delete the project
		const result = await this.projectModel.findByIdAndDelete(id).exec();
		return { deleted: result !== null, tasksAffected };
	}

	async incrementHoursWorked(id: string, hours: number): Promise<ProjectDocument> {
		const project = await this.projectModel.findById(id).exec();
		if (!project) throw new NotFoundException('Project not found');
		project.totalHoursWorked = (project.totalHoursWorked || 0) + hours;
		// optionally recompute progress if plannedHours exists
		if (project.plannedHours) {
			const pct = (project.totalHoursWorked / project.plannedHours) * 100;
			project.progressPercentage = Math.min(100, +pct.toFixed(2));
		}
		return await project.save();
	}

	async addTaskToProject(projectId: string, taskId: string): Promise<void> {
		await this.projectModel.findByIdAndUpdate(
			projectId,
			{ $addToSet: { tasks: taskId } },
			{ new: true }
		).exec();
	}

	async removeTaskFromProject(projectId: string, taskId: string): Promise<void> {
		await this.projectModel.findByIdAndUpdate(
			projectId,
			{ $pull: { tasks: taskId } },
			{ new: true }
		).exec();
	}

	async moveTaskToProject(taskId: string, oldProjectId: string, newProjectId: string): Promise<void> {
		if (oldProjectId) {
			await this.removeTaskFromProject(oldProjectId, taskId);
			await this.recalculateProjectStats(oldProjectId);
		}
		await this.addTaskToProject(newProjectId, taskId);
		await this.recalculateProjectStats(newProjectId);
	}

	async recalculateProjectStats(projectId: string): Promise<ProjectDocument | null> {
		// Validar ObjectId
		if (!projectId || projectId === 'null' || projectId === 'undefined' || !Types.ObjectId.isValid(projectId)) {
			console.warn(`recalculateProjectStats: ID inválido ignorado: ${projectId}`);
			return null;
		}
		
		const project = await this.projectModel.findById(projectId).exec();
		if (!project) {
			// Project doesn't exist anymore, skip recalculation
			return null;
		}

		const tasks = await this.taskModel.find({ project: projectId }).exec();

		// Calculate plannedHours: sum of (pomodorosPlanned * 0.5) for each task
		const plannedHours = tasks.reduce((sum, task) => {
			const pomodoros = task.pomodorosPlanned || 0;
			return sum + (pomodoros * 0.5);
		}, 0);

		// Calculate experience: sum of experience from all tasks
		const experience = tasks.reduce((sum, task) => {
			return sum + (task.experience || 0);
		}, 0);

		// Calculate reward: sum of prize from all tasks
		const reward = tasks.reduce((sum, task) => {
			return sum + (task.prize || 0);
		}, 0);

		// Update project
		project.plannedHours = plannedHours;
		project.experience = experience;
		project.reward = reward;

		// Recalculate progress percentage
		if (project.plannedHours > 0) {
			const pct = (project.totalHoursWorked / project.plannedHours) * 100;
			project.progressPercentage = Math.min(100, +pct.toFixed(2));
		} else {
			project.progressPercentage = 0;
		}

		return await project.save();
	}
}
