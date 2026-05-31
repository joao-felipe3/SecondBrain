import { Injectable } from '@nestjs/common';
import { PertEstimateDto, PertEstimateResponseDto } from '../../dto/pert-estimate.dto';

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
