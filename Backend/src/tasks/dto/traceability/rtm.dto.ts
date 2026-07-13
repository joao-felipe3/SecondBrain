import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { JourneyKind } from '../../schemas/requirement.schema';

export class MapRequirementToTaskDto {
  @ApiProperty({
    description: 'ID do projeto',
    example: 'project-123',
  })
  @IsString()
  @IsNotEmpty()
  projectId: string;

  @ApiProperty({
    description: 'ID do item da jornada (requisito)',
    example: 'requirement-456',
  })
  @IsString()
  @IsNotEmpty()
  requirementId: string;

  @ApiProperty({
    description: 'ID da tarefa',
    example: 'task-789',
  })
  @IsString()
  @IsNotEmpty()
  taskId: string;
}

export class SaveRequirementDto {
  @ApiProperty({
    description: 'Descrição do requisito ou item de jornada',
    example: 'Implementar fluxo de login',
  })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiPropertyOptional({
    description: 'Tipo do requisito',
    example: 'feature',
  })
  @IsString()
  @IsOptional()
  type?: string;

  @ApiPropertyOptional({
    description: 'Origem do requisito (ex: manual, importado)',
    example: 'manual',
  })
  @IsString()
  @IsOptional()
  source?: string;

  @ApiPropertyOptional({
    description: 'Categoria do item de jornada (ex: habit, action)',
    example: 'action',
  })
  @IsString()
  @IsOptional()
  kind?: string;

  @ApiPropertyOptional({
    description: 'Referência identificadora do requisito (ex: ACT1)',
    example: 'ACT1',
  })
  @IsString()
  @IsOptional()
  ref?: string;

  @ApiPropertyOptional({
    description: 'Referência do requisito pai',
    example: 'ETAP1',
  })
  @IsString()
  @IsOptional()
  parentRef?: string;
}

export class PreparedRequirementDataDto {
  ref: string;
  parentRef?: string;
  description: string;
  kind: JourneyKind;
  type: string;
  hierarchyLevel: number;
  source: string;
}

export class ProcessSingleRequirementDto {
  projectId: string;
  item: PreparedRequirementDataDto;
  refToId: Map<string, string>;
  insertedDedupKeys: Set<string>;
}

export class RTMValidationDto {
  @ApiProperty({
    description: 'Se o mapeamento é válido (sem anomalias/órfãos graves)',
    example: true,
  })
  isValid: boolean;

  @ApiProperty({
    description: 'IDs dos requisitos/ações que não possuem nenhuma tarefa mapeada',
    example: ['req-456'],
  })
  unmappedRequirements: string[];

  @ApiProperty({
    description: 'Alertas/sinais de riscos detectados na matriz de rastreabilidade',
    example: ['Requisito X sem nenhuma tarefa correspondente'],
  })
  risks: string[];

  @ApiProperty({
    description: 'Porcentagem de cobertura das ações da jornada (0-100)',
    example: 85.5,
  })
  coverage: number;
}

export class AutoMapRequirementsResponseDto {
  @ApiProperty({
    description: 'Indica se a operação foi realizada com sucesso',
    example: true,
  })
  success: boolean;

  @ApiProperty({
    description: 'Quantidade de tarefas que foram vinculadas a ações existentes',
    example: 5,
  })
  mappedCount: number;

  @ApiProperty({
    description: 'Quantidade de novas ações criadas automaticamente para tarefas sem correspondência',
    example: 1,
  })
  createdRequirementsCount: number;

  @ApiProperty({
    description: 'Porcentagem de cobertura atual',
    example: 100,
  })
  coverage: number;

  @ApiProperty({
    description: 'Validação atualizada da matriz de rastreabilidade',
    type: RTMValidationDto,
  })
  validation: RTMValidationDto;

  @ApiProperty({
    description: 'Mensagem explicativa sobre o resultado do mapeamento',
    example: 'Auto-vínculo concluído: 5 tarefa(s) vinculada(s) + 1 ação(ões) criada(s).',
  })
  message: string;

  @ApiProperty({
    description: 'Data e hora da resposta',
    example: '2026-07-12T19:59:00.000Z',
  })
  timestamp?: string;
}

export class GenerateTasksResponseDto {
  @ApiProperty({
    description: 'Indica se a operação foi realizada com sucesso',
    example: true,
  })
  success: boolean;

  @ApiProperty({
    description: 'Quantidade de tarefas criadas automaticamente para preencher as lacunas',
    example: 3,
  })
  createdTasksCount: number;

  @ApiProperty({
    description: 'Porcentagem de cobertura após a geração',
    example: 95.0,
  })
  coverage: number;

  @ApiProperty({
    description: 'Validação atualizada da matriz de rastreabilidade',
    type: RTMValidationDto,
  })
  validation: RTMValidationDto;

  @ApiProperty({
    description: 'Mensagem explicativa sobre o resultado da geração',
    example: '3 tarefa(s) gerada(s) para ações órfãs.',
  })
  message: string;

  @ApiProperty({
    description: 'Data e hora da resposta',
    example: '2026-07-12T19:59:00.000Z',
  })
  timestamp?: string;
}

