import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class InferenceTaskDto {
  @ApiProperty({ description: 'ID da tarefa' })
  @IsString()
  id: string;

  @ApiProperty({ description: 'Nome da tarefa' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Descrição da tarefa', required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ description: 'Lista de checklist da tarefa', required: false, type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  checklist?: string[];

  @ApiProperty({ description: 'Critério de aceitação/doD', required: false })
  @IsString()
  @IsOptional()
  definitionOfDone?: string;

  @ApiProperty({ description: 'Tipo da micro-tarefa', required: false })
  @IsString()
  @IsOptional()
  microTaskType?: string;
}

export class InferenceLeafGatesDto {
  @ApiProperty({ description: 'ID do pacote WBS' })
  @IsString()
  leafId: string;

  @ApiProperty({ description: 'Caminho WBS', required: false })
  @IsString()
  @IsOptional()
  wbsPath?: string;

  @ApiProperty({ description: 'Nome da folha', required: false })
  @IsString()
  @IsOptional()
  leafName?: string;

  @ApiProperty({ description: 'ID do gate inicial' })
  @IsString()
  startGateId: string;

  @ApiProperty({ description: 'ID do gate final' })
  @IsString()
  endGateId: string;

  @ApiProperty({ description: 'Número de tarefas', required: false })
  @IsNumber()
  @IsOptional()
  taskCount?: number;
}

export class InferredDependencyDto {
  @ApiProperty({ description: 'ID da tarefa' })
  @IsString()
  taskId: string;

  @ApiProperty({ description: 'ID da tarefa dependente' })
  @IsString()
  dependsOnTaskId: string;

  @ApiProperty({ description: 'Tipo do relacionamento de dependência', required: false })
  @IsString()
  @IsOptional()
  relationship?: string;

  @ApiProperty({ description: 'Razão da dependência', required: false })
  @IsString()
  @IsOptional()
  reason?: string;

  @ApiProperty({ description: 'Nível de confiança da inferência', required: false })
  @IsNumber()
  @IsOptional()
  confidence?: number;
}

export class InferWithAiDto {
  @ApiProperty({ description: 'ID da requisição de inferência', required: false })
  @IsString()
  @IsOptional()
  requestId?: string;

  @ApiProperty({ description: 'Nome do pacote WBS (folha)', required: false })
  @IsString()
  @IsOptional()
  leafName?: string;

  @ApiProperty({ description: 'Caminho WBS', required: false })
  @IsString()
  @IsOptional()
  wbsPath?: string;

  @ApiProperty({ description: 'Lista de tarefas a inferir', type: [InferenceTaskDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InferenceTaskDto)
  tasks: InferenceTaskDto[];

  @ApiProperty({ description: 'Número máximo de arestas', required: false })
  @IsNumber()
  @IsOptional()
  maxEdges?: number;
}

export class InferInterLeafWithAiDto {
  @ApiProperty({ description: 'ID da requisição de inferência', required: false })
  @IsString()
  @IsOptional()
  requestId?: string;

  @ApiProperty({ description: 'ID do projeto', required: false })
  @IsString()
  @IsOptional()
  projectId?: string;

  @ApiProperty({ description: 'Lista de pacotes WBS e seus gates', type: [InferenceLeafGatesDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InferenceLeafGatesDto)
  leaves: InferenceLeafGatesDto[];

  @ApiProperty({ description: 'Número máximo de arestas', required: false })
  @IsNumber()
  @IsOptional()
  maxEdges?: number;
}
