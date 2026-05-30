import { Injectable } from '@nestjs/common';
import { PertEstimateDto, PertEstimateResponseDto } from '../dto/pert-estimate.dto';

/**
 * Serviço para cálculos de estimativas PERT (Program Evaluation and Review Technique)
 *
 * PERT é uma técnica de estimativa probabilística que usa três pontos:
 * - Otimista (O): melhor caso, tudo dá certo
 * - Mais Provável (M): caso normal, alguns atrasos esperados
 * - Pessimista (P): pior caso, tudo dá errado
 *
 * Fórmula: TE = (O + 4M + P) / 6
 * Esta fórmula pondera a estimativa mais provável (4x) porque é mais confiável.
 */
@Injectable()
export class PertService {
  /**
   * Calcula o Tempo Esperado (TE) usando a fórmula PERT
   */
  calculateExpectedTime(estimate: PertEstimateDto): number {
    const { optimistic, mostLikely, pessimistic } = estimate;
    return (optimistic + 4 * mostLikely + pessimistic) / 6;
  }

  /**
   * Calcula a variância da estimativa
   *
   * Variância = ((P - O) / 6)²
   *
   * A variância indica o nível de incerteza na estimativa.
   * Quanto maior a variância, maior a incerteza.
   */
  calculateVariance(estimate: PertEstimateDto): number {
    const range = estimate.pessimistic - estimate.optimistic;
    return Math.pow(range / 6, 2);
  }

  /**
   * Calcula o desvio padrão (raiz quadrada da variância)
   * O desvio padrão representa a "margem de erro" típica da estimativa.
   */
  calculateStandardDeviation(estimate: PertEstimateDto): number {
    const variance = this.calculateVariance(estimate);
    return Math.sqrt(variance);
  }

  /**
   * Valida se as estimativas fazem sentido (O ≤ M ≤ P)
   */
  validateEstimate(estimate: PertEstimateDto): boolean {
    const { optimistic, mostLikely, pessimistic } = estimate;
    return optimistic <= mostLikely && mostLikely <= pessimistic;
  }

  /**
   * Calcula todas as métricas PERT de uma vez
   */
  calculatePertMetrics(estimate: PertEstimateDto): PertEstimateResponseDto {
    if (!this.validateEstimate(estimate)) {
      throw new Error('Estimativas inválidas: deve ser Otimista ≤ Provável ≤ Pessimista');
    }

    const expectedTime = this.calculateExpectedTime(estimate);
    const variance = this.calculateVariance(estimate);
    const standardDeviation = this.calculateStandardDeviation(estimate);

    return {
      expectedTime: Math.round(expectedTime * 100) / 100, // 2 casas decimais
      variance: Math.round(variance * 100) / 100,
      standardDeviation: Math.round(standardDeviation * 100) / 100,
      formula: '(O + 4M + P) / 6',
      estimate,
    };
  }

  /**
   * Converte minutos para formato legível (horas e minutos)
   */
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

  /**
   * Gera recomendações baseadas na variância
   * Alta variância = alta incerteza = necessidade de quebrar a tarefa
   */
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
