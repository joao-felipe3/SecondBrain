import { InjectModel } from '@nestjs/mongoose';
import { TaskDocument } from '../tasks/schemas/task.schema';
import { Injectable, NotFoundException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { Model, Types } from 'mongoose';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectDocument } from './schemas/project.schema';
import { CPMService, type TaskNode } from '../tasks/services/cpm.service';
import type { GanttDataResponse } from './dto/gantt.dto';

@Injectable()
export class ProjectsService {
	constructor(
		@InjectModel('Project') private readonly projectModel: Model<ProjectDocument>,
		@InjectModel('Task') private readonly taskModel: Model<TaskDocument>,
		@Inject(forwardRef(() => CPMService))
		private readonly cpmService: CPMService,
	) {}

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

		const tasks = await this.taskModel.find(query).exec();
		const dependencies = await this.cpmService.getDependencies(projectId);

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
		}));

		const nodeById = new Map<string, TaskNode>();
		for (const node of taskNodes) nodeById.set(node.id, node);

		for (const dep of dependencies as any[]) {
			const taskId = String(dep?.taskId || '').trim();
			const dependsOnTaskId = String(dep?.dependsOnTaskId || '').trim();
			if (!taskId || !dependsOnTaskId) continue;
			const node = nodeById.get(taskId);
			if (node) node.dependencies.push(dependsOnTaskId);
		}

		const analysis = this.cpmService.calculateCriticalPath(taskNodes);

		const projectStart = project.startDate
			? new Date(project.startDate)
			: (() => {
				const minCreated = tasks
					.map((task: any) => (task?.createdAt ? new Date(task.createdAt) : null))
					.filter(Boolean)
					.sort((a: Date | null, b: Date | null) => (a?.getTime?.() || 0) - (b?.getTime?.() || 0))[0];
				return minCreated || new Date();
			})();

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

				return {
					id,
					name: String(task?.title || task?.name || 'Task'),
					startDate: addHours(projectStart, earlyStart),
					endDate: addHours(projectStart, earlyFinish),
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
			.sort((a, b) => a.earlyStart - b.earlyStart || a.name.localeCompare(b.name));

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
			projectStartDate: projectStart.toISOString(),
			projectDeadline: project.deadline ? new Date(project.deadline).toISOString() : null,
			projectDurationHours: round2(analysis.projectDuration),
			tasks: taskItems,
			dependencies: dependencyItems,
			criticalPath: analysis.criticalPath,
			alerts: analysis.alerts,
			diagnostics: analysis.diagnostics,
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
