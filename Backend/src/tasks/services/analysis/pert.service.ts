import { Injectable } from '@nestjs/common';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PertEstimateDto, PertEstimateResponseDto } from '../../dto/pert-estimate.dto';
import { TaskDocument } from '../../schemas/task.schema';
import { TasksMetricsService } from './metrics.service';
import { UpdatePertDto } from '../../dto/suggest-pert.dto';

@Injectable()
export class PertService {
	calculateExpectedTime(estimate: PertEstimateDto): number {
		const { optimistic, mostLikely, pessimistic } = estimate;
		return (optimistic + 4 * mostLikely + pessimistic) / 6;
	}

	calculateVariance(estimate: PertEstimateDto): number {
		const range = estimate.pessimistic - estimate.optimistic;
		return Math.pow(range / 6, 2);
	}

	calculateStandardDeviation(estimate: PertEstimateDto): number {
		const variance = this.calculateVariance(estimate);
		return Math.sqrt(variance);
	}

	validateEstimate(estimate: PertEstimateDto): boolean {
		const { optimistic, mostLikely, pessimistic } = estimate;
		return optimistic <= mostLikely && mostLikely <= pessimistic;
	}

	calculatePertMetrics(estimate: PertEstimateDto): PertEstimateResponseDto {
		if (!this.validateEstimate(estimate)) {
			throw new Error('Estimativas inválidas: deve ser Otimista ≤ Provável ≤ Pessimista');
		}

		const expectedTime = this.calculateExpectedTime(estimate);
		const variance = this.calculateVariance(estimate);
		const standardDeviation = this.calculateStandardDeviation(estimate);

		return {
			expectedTime: Math.round(expectedTime * 100) / 100,
			variance: Math.round(variance * 100) / 100,
			standardDeviation: Math.round(standardDeviation * 100) / 100,
			formula: '(O + 4M + P) / 6',
			estimate,
		};
	}

	formatMinutes(minutes: number): string {
		const hours = Math.floor(minutes / 60);
		const mins = Math.round(minutes % 60);

		if (hours === 0) {
			return `${mins}min`;
		}
		if (mins === 0) {
			return `${hours}h`;
		}
		return `${hours}h ${mins}min`;
	}

	getRecommendation(variance: number, expectedTime: number): string {
		const coefficientOfVariation = Math.sqrt(variance) / expectedTime;

		if (coefficientOfVariation > 0.5) {
			return '⚠️ Alta incerteza. Considere decompor esta tarefa em sub-tarefas menores.';
		}
		if (coefficientOfVariation > 0.3) {
			return '⚡ Incerteza moderada. Monitore o progresso de perto.';
		}
		return '✅ Incerteza baixa. Estimativa confiável.';
	}
}

@Injectable()
export class TasksPertService {
	constructor(
		@InjectModel('Task') private readonly taskModel: Model<TaskDocument>,
		private readonly pertService: PertService,
		private readonly metricsService: TasksMetricsService,
	) {}

	async updatePert(taskId: string, updatePertDto: UpdatePertDto): Promise<TaskDocument> {
		if (!taskId || !Types.ObjectId.isValid(taskId)) {
			throw new BadRequestException(`ID inválido: ${taskId}`);
		}

		const {
			pertOptimisticMinutes: optimistic,
			pertMostLikelyMinutes: mostLikely,
			pertPessimisticMinutes: pessimistic,
		} = updatePertDto;

		if (
			typeof optimistic !== 'number' ||
			typeof mostLikely !== 'number' ||
			typeof pessimistic !== 'number'
		) {
			throw new BadRequestException('Todos os valores PERT devem ser números');
		}
		if (!(optimistic > 0 && mostLikely > 0 && pessimistic > 0)) {
			throw new BadRequestException('Valores PERT devem ser maiores que zero');
		}
		if (!(optimistic <= mostLikely && mostLikely <= pessimistic)) {
			throw new BadRequestException('Ordem inválida: Otimista ≤ Provável ≤ Pessimista');
		}

		const pertMetrics = this.pertService.calculatePertMetrics({
			optimistic,
			mostLikely,
			pessimistic,
		});

		const task = await this.taskModel.findById(taskId).exec();
		if (!task) {
			throw new NotFoundException(`Task with id ${taskId} not found`);
		}

		const createdAt = task.createdAt || new Date();
		const deadline = this.metricsService.calculateDeadline(createdAt, pertMetrics.expectedTime);

		const updatedTask = await this.taskModel
			.findByIdAndUpdate(
				taskId,
				{
					pertOptimisticMinutes: optimistic,
					pertMostLikelyMinutes: mostLikely,
					pertPessimisticMinutes: pessimistic,
					pertExpectedMinutes: pertMetrics.expectedTime,
					pertVariance: pertMetrics.variance,
					deadline,
				},
				{ new: true },
			)
			.exec();

		if (!updatedTask) {
			throw new NotFoundException(`Task with id ${taskId} not found`);
		}

		return updatedTask;
	}

	async savePertEstimate(
		taskId: string,
		pertEstimateDto: PertEstimateDto,
	): Promise<PertEstimateResponseDto> {
		const task = await this.taskModel.findById(taskId).exec();
		if (!task) {
			throw new NotFoundException(`Tarefa com ID ${taskId} não encontrada`);
		}

		const pertMetrics = this.pertService.calculatePertMetrics(pertEstimateDto);

		await this.taskModel
			.findByIdAndUpdate(
				taskId,
				{
					pertOptimisticMinutes: pertEstimateDto.optimistic,
					pertMostLikelyMinutes: pertEstimateDto.mostLikely,
					pertPessimisticMinutes: pertEstimateDto.pessimistic,
					pertExpectedMinutes: Math.round(pertMetrics.expectedTime),
					pertVariance: pertMetrics.variance,
				},
				{ new: true },
			)
			.exec();

		return pertMetrics;
	}
}
