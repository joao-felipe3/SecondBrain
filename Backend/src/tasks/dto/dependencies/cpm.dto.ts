import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsArray,
  IsBoolean,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { DependencyType } from '../../schemas/task-dependency.schema';
import { CPMDiagnosticsDto } from './cpm-diagnostics.dto';
import {
  TaskDependencyEdge,
  TaskNode,
  PackageCriticality,
  CPMAnalysis,
  TaskMetrics,
} from '../../interfaces/cpm.interface';

export class AddDependencyDto {
  @ApiProperty({
    description: 'ID da tarefa dependente (sucessora)',
    example: 'task-123',
  })
  @IsString()
  @IsNotEmpty()
  taskId!: string;

  @ApiProperty({
    description: 'ID da tarefa predecessora',
    example: 'task-456',
  })
  @IsString()
  @IsNotEmpty()
  dependsOnTaskId!: string;

  @ApiProperty({
    description: 'Tipo de relacionamento da dependência',
    enum: DependencyType,
    example: 'FINISH_TO_START',
    required: false,
    default: DependencyType.FINISH_TO_START,
  })
  @IsOptional()
  @IsEnum(DependencyType)
  relationship?: DependencyType = DependencyType.FINISH_TO_START;

  @ApiProperty({
    description: 'Motivo ou explicação da dependência',
    example: 'Dependência técnica devido ao fluxo de dados',
    required: false,
  })
  @IsString()
  @IsOptional()
  reason?: string;
}

export class DependencyResponseDto {
  @ApiProperty({ description: 'ID da dependência persistida', example: 'dep-789' })
  id!: string;

  @ApiProperty({ description: 'ID da tarefa dependente (sucessora)', example: 'task-123' })
  taskId!: string;

  @ApiProperty({ description: 'ID da tarefa predecessora', example: 'task-456' })
  dependsOnTaskId!: string;

  @ApiProperty({
    description: 'Tipo de relacionamento da dependência',
    enum: DependencyType,
    example: 'FINISH_TO_START',
  })
  relationship!: string;

  @ApiProperty({
    description: 'Motivo ou justificativa',
    example: 'Configuração manual',
    required: false,
  })
  reason?: string;

  @ApiProperty({ description: 'Indica se foi auto-identificada', example: false, required: false })
  isAutoIdentified?: boolean;

  @ApiProperty({ description: 'Data de criação da dependência', example: '2026-07-11T00:00:00.000Z' })
  createdAt!: Date;
}

export class AutoInferDependenciesDto {
  @ApiProperty({
    description: 'IDs específicos de tarefas a serem processadas (opcional)',
    type: [String],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  taskIds?: string[];

  @ApiProperty({
    description: 'Filtrar a inferência por ID de nó WBS pai (opcional)',
    example: 'wbs-node-1',
    required: false,
  })
  @IsOptional()
  @IsString()
  parentWbsNodeId?: string;

  @ApiProperty({
    description: 'Estratégia de inferência de dependências',
    enum: ['heuristic-phases', 'ai-per-leaf'],
    example: 'ai-per-leaf',
    required: false,
    default: 'ai-per-leaf',
  })
  @IsOptional()
  @IsEnum(['heuristic-phases', 'ai-per-leaf'])
  strategy?: 'heuristic-phases' | 'ai-per-leaf' = 'ai-per-leaf';

  @ApiProperty({
    description: 'Se verdadeiro, salva no banco de dados. Se falso, apenas retorna o preview.',
    example: true,
    required: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  apply?: boolean = false;

  @ApiProperty({
    description: 'Limite máximo de dependências (arestas) geradas por nó folha',
    example: 60,
    required: false,
    default: 60,
  })
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(250)
  maxEdgesPerLeaf?: number = 60;

  @ApiProperty({
    description: 'Se verdadeiro, conecta nós portões de diferentes folhas',
    example: true,
    required: false,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  includeInterLeafGates?: boolean = true;

  @ApiProperty({
    description: 'Estratégia para conectar portões inter-folhas',
    enum: ['none', 'heuristic', 'ai'],
    example: 'ai',
    required: false,
    default: 'ai',
  })
  @IsOptional()
  @IsEnum(['none', 'heuristic', 'ai'])
  interLeafStrategy?: 'none' | 'heuristic' | 'ai' = 'ai';

  @ApiProperty({
    description: 'Limite máximo de conexões geradas entre portões de folhas distintas',
    example: 28,
    required: false,
    default: 28,
  })
  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(120)
  maxInterLeafEdges?: number = 28;
}

export class ClearDependencyCycleDto {
  @ApiProperty({
    description:
      'Modo de quebra de ciclo (auto-only remove apenas geradas por IA, all remove qualquer uma)',
    enum: ['auto-only', 'all'],
    example: 'auto-only',
    required: false,
    default: 'auto-only',
  })
  @IsOptional()
  @IsEnum(['auto-only', 'all'])
  mode?: 'auto-only' | 'all' = 'auto-only';

  @ApiProperty({
    description: 'Limite máximo de arestas a remover para resolver os loops',
    example: 25,
    required: false,
    default: 25,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  maxRemovals?: number = 25;
}

export class TaskDependencyEdgeDto implements TaskDependencyEdge {
  @ApiProperty({ description: 'ID da tarefa predecessora', example: 'task-456' })
  predecessorId!: string;

  @ApiProperty({
    description: 'Tipo de relacionamento',
    enum: DependencyType,
    example: 'FINISH_TO_START',
  })
  relationship!: DependencyType;
}

export class TaskNodeResponseDto implements TaskNode {
  @ApiProperty({ description: 'ID da tarefa', example: 'task-123' })
  id!: string;

  @ApiProperty({ description: 'Nome ou título da tarefa', example: 'Configurar Servidor' })
  name!: string;

  @ApiProperty({
    description: 'Duração estimada em horas/minutos conforme unidade do CPM',
    example: 120,
  })
  duration!: number;

  @ApiProperty({
    description: 'Lista de IDs das tarefas de que esta depende',
    type: [String],
    example: ['task-456'],
  })
  dependencies!: string[];

  @ApiProperty({
    description: 'Lista estruturada das arestas de dependência',
    type: [TaskDependencyEdgeDto],
    required: false,
  })
  dependencyEdges?: TaskDependencyEdgeDto[];

  @ApiProperty({ description: 'ID do nó WBS pai', example: 'wbs-node-1', required: false })
  parentWbsNodeId?: string;

  @ApiProperty({ description: 'Caminho absoluto do nó no WBS', example: '1.2.1', required: false })
  wbsPath?: string;

  @ApiProperty({ description: 'Início mais cedo possível', example: 0, required: false })
  earlyStart?: number;

  @ApiProperty({ description: 'Término mais cedo possível', example: 120, required: false })
  earlyFinish?: number;

  @ApiProperty({ description: 'Início mais tarde permitido', example: 10, required: false })
  lateStart?: number;

  @ApiProperty({ description: 'Término mais tarde permitido', example: 130, required: false })
  lateFinish?: number;

  @ApiProperty({ description: 'Folga da tarefa (slack)', example: 10, required: false })
  slack?: number;

  @ApiProperty({
    description: 'Indica se a tarefa está no caminho crítico',
    example: false,
    required: false,
  })
  isCritical?: boolean;
}

export class TaskMetricsResponseDto implements TaskMetrics {
  @ApiProperty({ description: 'ID da tarefa', example: 'task-123' })
  taskId!: string;

  @ApiProperty({ description: 'Nome ou título da tarefa', example: 'Configurar Servidor' })
  taskName!: string;

  @ApiProperty({ description: 'Início mais cedo possível', example: 0 })
  earlyStart!: number;

  @ApiProperty({ description: 'Término mais cedo possível', example: 120 })
  earlyFinish!: number;

  @ApiProperty({ description: 'Início mais tarde permitido', example: 10 })
  lateStart!: number;

  @ApiProperty({ description: 'Término mais tarde permitido', example: 130 })
  lateFinish!: number;

  @ApiProperty({ description: 'Folga da tarefa (slack)', example: 10 })
  slack!: number;

  @ApiProperty({ description: 'Indica se a tarefa está no caminho crítico', example: false })
  isCritical!: boolean;
}

export class PackageCriticalityResponseDto implements PackageCriticality {
  @ApiProperty({ description: 'ID do pacote WBS ou leaf', example: 'wbs-node-1' })
  packageId!: string;

  @ApiProperty({ description: 'Caminho WBS do pacote', example: '1.2', required: false })
  packagePath?: string;

  @ApiProperty({ description: 'Total de tarefas do pacote' })
  taskCount!: number;

  @ApiProperty({ description: 'Quantidade de tarefas críticas do pacote' })
  criticalTaskCount!: number;

  @ApiProperty({ description: 'Razão de criticidade (criticalTaskCount / taskCount)' })
  criticalRatio!: number;

  @ApiProperty({ description: 'Folga mínima encontrada no pacote' })
  minSlack!: number;

  @ApiProperty({ description: 'Duração crítica agregada em horas/minutos' })
  criticalDuration!: number;

  @ApiProperty({ description: 'Quantidade de tarefas no caminho crítico dentro do pacote' })
  criticalPathTaskCount!: number;

  @ApiProperty({ description: 'Pontuação de criticidade' })
  score!: number;
}

export class CPMAnalysisResponseDto implements CPMAnalysis {
  @ApiProperty({
    description: 'Lista de IDs das tarefas no caminho crítico do projeto',
    type: [String],
    example: ['task-1', 'task-2'],
  })
  criticalPath!: string[];

  @ApiProperty({ description: 'Duração total estimada do projeto', example: 34.5 })
  projectDuration!: number;

  @ApiProperty({
    description: 'Lista de tarefas ordenadas por impacto no prazo final',
    type: [TaskNodeResponseDto],
  })
  tasksByImpact!: TaskNodeResponseDto[];

  @ApiProperty({
    description: 'Mensagens e alertas gerados na análise',
    type: [String],
    example: ['⚠️ Caminho crítico possui folga zero'],
  })
  alerts!: string[];

  @ApiProperty({
    description: 'Métricas de criticidade por pacotes/nós WBS',
    type: [PackageCriticalityResponseDto],
    required: false,
  })
  packageCriticality?: PackageCriticalityResponseDto[];

  @ApiProperty({ type: CPMDiagnosticsDto, required: false })
  diagnostics?: CPMDiagnosticsDto;
}

export class CalculateCriticalPathResponseDto {
  @ApiProperty({ description: 'ID do projeto', example: 'project-123' })
  projectId!: string;

  @ApiProperty({ type: CPMAnalysisResponseDto })
  analysis!: CPMAnalysisResponseDto;

  @ApiProperty({ description: 'Timestamp da execução', example: '2026-07-11T00:00:00.000Z' })
  timestamp!: string;
}

export class GetDependenciesResponseDto {
  @ApiProperty({ description: 'ID do projeto', example: 'project-123' })
  projectId!: string;

  @ApiProperty({ description: 'Total de dependências' })
  count!: number;

  @ApiProperty({ type: [DependencyResponseDto] })
  dependencies!: DependencyResponseDto[];
}

export class ApplySummaryDto {
  @ApiProperty({ description: 'Tentativas de inserção' })
  attempted!: number;

  @ApiProperty({ description: 'Aceitas' })
  accepted!: number;

  @ApiProperty({ description: 'Rejeitadas por criar ciclo' })
  rejectedCycle!: number;

  @ApiProperty({ description: 'Ignoradas por já existirem' })
  skippedExisting!: number;

  @ApiProperty({ description: 'Adicionadas/Atualizadas no banco' })
  upserted!: number;

  @ApiProperty({ description: 'Indica se dependências existentes já possuíam ciclo' })
  existingHasCycle!: boolean;

  @ApiProperty({ description: 'Total de conexões entre portões' })
  interLeafEdges!: number;
}

export class AutoInferDependenciesResponseDto {
  @ApiProperty({ description: 'ID do projeto', example: 'project-123' })
  projectId!: string;

  @ApiProperty({ description: 'ID único da requisição de inferência', example: 'depinf_xyz' })
  requestId!: string;

  @ApiProperty({ description: 'Estratégia utilizada', example: 'ai-per-leaf' })
  strategy!: string;

  @ApiProperty({ description: 'Indica se foi aplicado no banco' })
  apply!: boolean;

  @ApiProperty({ description: 'Conexões entre folhas habilitadas' })
  includeInterLeafGates!: boolean;

  @ApiProperty({ description: 'Estratégia entre folhas' })
  interLeafStrategy!: string;

  @ApiProperty({ description: 'Modo de interligação inter-folhas' })
  interLeafMode!: string;

  @ApiProperty({ description: 'Máximo de conexões inter-folhas' })
  maxInterLeafEdges!: number;

  @ApiProperty({ description: 'Concorrência utilizada' })
  inferConcurrency!: number;

  @ApiProperty({ description: 'Timeout configurado em milissegundos' })
  inferTimeoutMs!: number;

  @ApiProperty({ description: 'Total de grupos folha' })
  leafGroups!: number;

  @ApiProperty({ description: 'Quantidade total de dependências sugeridas' })
  dependenciesSuggested!: number;

  @ApiProperty({ description: 'Estrutura de dependências sugeridas por nó folha' })
  previewByLeaf!: any;

  @ApiProperty({ type: ApplySummaryDto, required: false })
  applySummary?: ApplySummaryDto;

  @ApiProperty({ description: 'Duração da execução em milissegundos' })
  durationMs!: number;

  @ApiProperty({ description: 'Data/Hora de execução', example: '2026-07-11T00:00:00.000Z' })
  timestamp!: string;
}

export class ValidateDependenciesDto {
  @ApiProperty({ type: [TaskNodeResponseDto] })
  tasksInHours!: TaskNodeResponseDto[];

  @ApiProperty({ description: 'Mapeamento de arestas por ID de tarefa' })
  edgeMap!: Map<string, TaskDependencyEdgeDto[]>;

  @ApiProperty({ description: 'Conjunto de IDs de tarefas do projeto' })
  taskIds!: Set<string>;
}

export class ComputeGraphDegreesDto {
  @ApiProperty({ type: [TaskNodeResponseDto] })
  tasksInHours!: TaskNodeResponseDto[];

  @ApiProperty({ description: 'Mapeamento de arestas por ID de tarefa' })
  edgeMap!: Map<string, TaskDependencyEdgeDto[]>;

  @ApiProperty({ description: 'Conjunto de IDs de tarefas do projeto' })
  taskIds!: Set<string>;
}

export class FindEndNodeDto {
  @ApiProperty({ type: [TaskNodeResponseDto] })
  tasks!: TaskNodeResponseDto[];

  @ApiProperty({ description: 'Duração total do projeto' })
  projectDuration!: number;

  @ApiProperty({ description: 'Margem de tolerância (epsilon)' })
  eps!: number;
}

export class EvaluateDependencyAlignmentDto {
  @ApiProperty({ type: TaskNodeResponseDto })
  pred!: TaskNodeResponseDto;

  @ApiProperty({ type: TaskNodeResponseDto })
  cur!: TaskNodeResponseDto;

  @ApiProperty({ type: TaskDependencyEdgeDto })
  dep!: TaskDependencyEdgeDto;

  @ApiProperty({ description: 'Margem de tolerância (epsilon)' })
  eps!: number;
}

export class FindBestPredecessorDto {
  @ApiProperty({ type: TaskNodeResponseDto })
  cur!: TaskNodeResponseDto;

  @ApiProperty({ type: [TaskDependencyEdgeDto] })
  deps!: TaskDependencyEdgeDto[];

  @ApiProperty({ description: 'Mapeamento de tarefas por ID' })
  taskById!: Map<string, TaskNodeResponseDto>;

  @ApiProperty({ description: 'Margem de tolerância (epsilon)' })
  eps!: number;
}

export class BuildCriticalPathSequenceDto {
  @ApiProperty({ type: [TaskNodeResponseDto] })
  tasks!: TaskNodeResponseDto[];

  @ApiProperty({ description: 'Duração total do projeto' })
  projectDuration!: number;

  @ApiProperty({ description: 'Mapeamento de arestas por ID de tarefa' })
  edgeMap!: Map<string, TaskDependencyEdgeDto[]>;
}

export class GenerateAlertsDiagnosticsDto {
  @ApiProperty({ description: 'Indica se foi detectado algum ciclo (loop) de dependência' })
  cycleDetected!: boolean;

  @ApiProperty({ description: 'Quantidade de nós não processados no forward pass' })
  unprocessedForward!: number;

  @ApiProperty({ description: 'Quantidade de nós não processados no backward pass' })
  unprocessedBackward!: number;

  @ApiProperty({ description: 'Quantidade de dependências com referências ausentes no projeto' })
  missingDependencyRefs!: number;
}

export class GenerateAlertsDto {
  @ApiProperty({ type: [TaskNodeResponseDto] })
  tasks!: TaskNodeResponseDto[];

  @ApiProperty({ type: [TaskNodeResponseDto] })
  criticalTasks!: TaskNodeResponseDto[];

  @ApiProperty({ type: GenerateAlertsDiagnosticsDto })
  diagnostics!: GenerateAlertsDiagnosticsDto;
}

export class CreateCPMDiagnosticsParamsDto {
  @ApiProperty({ type: [TaskNodeResponseDto] })
  tasksInHours!: TaskNodeResponseDto[];

  @ApiProperty({ type: [TaskNodeResponseDto] })
  criticalTasks!: TaskNodeResponseDto[];

  @ApiProperty({ description: 'Sequência de IDs no caminho crítico' })
  criticalPathSequence!: string[];

  @ApiProperty({ description: 'Duração total do projeto' })
  projectDuration!: number;

  @ApiProperty({ description: 'Grau de entrada (in-degree) por tarefa' })
  indegree!: Map<string, number>;

  @ApiProperty({ description: 'Grau de saída (out-degree) por tarefa' })
  outdegree!: Map<string, number>;

  @ApiProperty({ description: 'Quantidade de conexões (arestas) no grafo' })
  edgeCount!: number;

  @ApiProperty({ description: 'Quantidade de dependências por tarefa' })
  depSum!: number;

  @ApiProperty({ description: 'Status de processamento do forward pass' })
  forward!: { hasCycle: boolean; unprocessed: number };

  @ApiProperty({ description: 'Status de processamento do backward pass' })
  backward!: { hasCycle: boolean; unprocessed: number };

  @ApiProperty({ description: 'Quantidade de referências de dependência ausentes' })
  missingDependencyRefs!: number;

  @ApiProperty({ description: 'Amostras de dependências ausentes' })
  missingDependencySamples!: Array<{ taskId: string; dependsOnTaskId: string }>;
}

export class GraphDegreesDto {
  @ApiProperty({ description: 'Grau de entrada (in-degree) por tarefa' })
  indegree!: Map<string, number>;

  @ApiProperty({ description: 'Grau de saída (out-degree) por tarefa' })
  outdegree!: Map<string, number>;

  @ApiProperty({ description: 'Quantidade de conexões (arestas) no grafo' })
  edgeCount!: number;

  @ApiProperty({ description: 'Soma total de dependências' })
  depSum!: number;
}

export class ValidateDependenciesResponseDto {
  @ApiProperty({ description: 'Quantidade de dependências com referências ausentes' })
  missingDependencyRefs!: number;

  @ApiProperty({ description: 'Amostras de dependências com referências ausentes' })
  missingDependencySamples!: Array<{ taskId: string; dependsOnTaskId: string }>;
}
