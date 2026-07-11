import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, Min, Max } from 'class-validator';

export class TaskLineageQueryDto {
  @ApiProperty({
    description: 'Profundidade máxima para buscar ancestrais',
    example: 50,
    required: false,
    default: 50,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  maxDepth?: number = 50;
}

export class TaskDescendantQueryDto {
  @ApiProperty({
    description: 'Profundidade máxima para buscar descendentes',
    example: 1000,
    required: false,
    default: 1000,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5000)
  maxDepth?: number = 1000;
}

export class ValueContributionResponseDto {
  @ApiProperty({
    description: 'Porcentagem de contribuição de valor da sub-árvore',
    example: 25.5,
  })
  contributionPercent: number;

  @ApiProperty({
    description: 'XP completado na sub-árvore',
    example: 500,
  })
  subtreeCompletedXP: number;

  @ApiProperty({
    description: 'XP total completado na árvore principal',
    example: 2000,
  })
  totalCompletedXP: number;

  @ApiProperty({
    description: 'Detalhamento dos nós da sub-árvore',
  })
  breakdown: Array<{
    _id: any;
    experience: number;
    isConcluded: boolean;
  }>;
}
