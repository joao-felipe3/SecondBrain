import { IsNumber, IsPositive } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PertEstimateDto {
  @ApiProperty({
    description: 'Estimativa otimista (melhor caso) em minutos',
    example: 480,
    minimum: 1,
  })
  @IsNumber()
  @IsPositive()
  optimistic!: number;

  @ApiProperty({
    description: 'Estimativa mais provável (caso normal) em minutos',
    example: 720,
    minimum: 1,
  })
  @IsNumber()
  @IsPositive()
  mostLikely!: number;

  @ApiProperty({
    description: 'Estimativa pessimista (pior caso) em minutos',
    example: 1200,
    minimum: 1,
  })
  @IsNumber()
  @IsPositive()
  pessimistic!: number;
}

export class PertEstimateResponseDto {
  @ApiProperty({
    description: 'Tempo esperado calculado via fórmula PERT: (O + 4M + P) / 6',
    example: 760,
  })
  expectedTime!: number;

  @ApiProperty({
    description: 'Variância calculada: ((P - O) / 6)²',
    example: 14400,
  })
  variance!: number;

  @ApiProperty({
    description: 'Desvio padrão: √variância',
    example: 120,
  })
  standardDeviation!: number;

  @ApiProperty({
    description: 'Fórmula utilizada para o cálculo',
    example: '(O + 4M + P) / 6',
  })
  formula!: string;

  @ApiProperty({
    description: 'Valores originais da estimativa',
  })
  estimate!: PertEstimateDto;
}
