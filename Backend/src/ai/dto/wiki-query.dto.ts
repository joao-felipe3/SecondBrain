import { IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class WikiQueryDto {
  @IsString()
  @IsNotEmpty()
  query: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(20)
  topK?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(3)
  maxDepth?: number;
}

export interface WikiSourceDto {
  path: string;
  score: number;
  snippet: string;
}

export interface GraphNodeDto {
  id: string;
  label: string;
  type: string;
}

export interface GraphEdgeDto {
  source: string;
  target: string;
  relationship: string;
}

export interface WikiQueryResponseDto {
  answer: string;
  sources: WikiSourceDto[];
  graphNodes: GraphNodeDto[];
  graphEdges: GraphEdgeDto[];
}
