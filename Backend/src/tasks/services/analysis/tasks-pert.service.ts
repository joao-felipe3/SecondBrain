import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { TaskDocument } from '../../schemas/task.schema';
import { PertService } from './pert.service';
import { TasksMetricsService } from './metrics.service';
import { PertEstimateDto, PertEstimateResponseDto } from '../../dto/pert-estimate.dto';
import { UpdatePertDto } from '../../dto/suggest-pert.dto';

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