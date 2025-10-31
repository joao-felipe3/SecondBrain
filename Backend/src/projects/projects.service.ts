import { InjectModel } from '@nestjs/mongoose';
import { TaskDocument } from '../tasks/schemas/task.schema';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Model } from 'mongoose';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectDocument } from './schemas/project.schema';

@Injectable()
export class ProjectsService {
	constructor(
		@InjectModel('Project') private readonly projectModel: Model<ProjectDocument>,
		@InjectModel('Task') private readonly taskModel: Model<TaskDocument>,
	) {}

	async getTasksForProject(projectId: string): Promise<TaskDocument[]> {
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
		return await this.projectModel.findById(id).exec();
	}

	async update(id: string, dto: UpdateProjectDto): Promise<ProjectDocument | null> {
		return await this.projectModel.findByIdAndUpdate(id, dto, { new: true }).exec();
	}

	async remove(id: string): Promise<boolean> {
		const result = await this.projectModel.findByIdAndDelete(id).exec();
		return result !== null;
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

	async recalculateProjectStats(projectId: string): Promise<ProjectDocument> {
		const project = await this.projectModel.findById(projectId).exec();
		if (!project) throw new NotFoundException('Project not found');

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
