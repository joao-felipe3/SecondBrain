# `tasks/services/dependencies/` — Guia de Referência

## Visão Geral

A pasta `dependencies/` reúne os serviços e utilitários responsáveis por **análise crítica de rede, hierarquia e inferência de dependências** entre tarefas. Cobre três domínios funcionais:

| Domínio | Sigla | O que faz |
|---------|-------|-----------|
| Critical Path Method | **CPM** | Calcula caminho crítico, folgas, ES/EF/LS/LF e diagnósticos |
| Dependency Inference | **DI** | Infere dependências entre tarefas via heurísticas e IA (Gemini) |
| Hierarchy | **H** | Navega e calcula linhagem, descendentes e contribuição de XP por subárvore |

---

## Estrutura de Arquivos

```
dependencies/
├── index.ts                          # Barrel export dos serviços
│
├── cpm.service.ts                    # CPMService — CRUD de dependências + interface CPM
├── dependency-inference.service.ts   # DependencyInferenceService — inferência heurística e via Gemini
├── hierarchy.service.ts              # TasksHierarchyService — linhagem, descendentes, contribuição XP
│
└── utils/
    ├── index.ts                      # Barrel export dos utilitários
    ├── cpm-analysis.utils.ts         # Motor CPM: calculateCriticalPath, métricas, alertas
    ├── cpm-passes.utils.ts           # Passagens de grafo: Forward Pass, Backward Pass, edge extraction
    └── dependency-inference.utils.ts # Funções puras: keepAcyclic, filterInvalidAndSelfEdges, etc.
```

---

## CPM — Critical Path Method

### `CPMService` — `cpm.service.ts`

Interface NestJS para operações de **dependências no banco** e cálculo do caminho crítico.

**Seções e Métodos:**

#### 1. CRUD de Dependências

| Método | Descrição |
|--------|-----------|
| `addDependency(taskId, dependsOnTaskId, projectId, reason?, relationship?, isAutoIdentified?)` | Cria uma nova dependência com relacionamento normalizado. |
| `upsertDependencies(deps[])` | Upsert em bulk de múltiplas dependências (idempotente por `taskId + dependsOnTaskId + projectId`). |
| `removeDependency(taskId, dependsOnTaskId)` | Remove uma dependência específica. |
| `getDependencies(projectId)` | Lista todas as dependências do projeto. |
| `removeDependenciesByIds(ids[])` | Remove dependências por lista de IDs. |
| `normalizeRelationship(input?)` | Normaliza string de relacionamento para `DependencyType`. |

#### 2. CPM & Critical Path

| Método | Descrição |
|--------|-----------|
| `calculateCriticalPath(tasks[])` | Delega para `calculateCriticalPath` de `cpm-analysis.utils.ts`. |
| `getTaskMetrics(task)` | Retorna `TaskMetrics` para uma tarefa já calculada. |

---

### `cpm-analysis.utils.ts` — Motor de Análise

Funções exportadas que implementam o pipeline completo do CPM.

> **Nota:** As durações são convertidas de **minutos para horas** em `calculateCriticalPath` antes de qualquer cálculo. Todos os valores de `earlyStart`, `earlyFinish`, `lateStart`, `lateFinish`, `slack` e `projectDuration` no retorno estão em **horas**.

#### Helpers Privados (não exportados)

| Função | O que extrai de `calculateCriticalPath` |
|--------|----------------------------------------|
| `validateDependencies(tasks, edgeMap, taskIds)` | Conta referências de dependências ausentes (taskId referencia task fora do conjunto). |
| `computeGraphDegrees(tasks, edgeMap, taskIds)` | Constrói `indegree` e `outdegree` e contagem de arestas válidas. |
| `buildSlackBuckets(tasks)` | Classifica tarefas em 5 faixas de folga: `negative`, `critical`, `nearCritical`, `lowSlack`, `comfortable`. |

#### Funções Públicas

| Função | Descrição |
|--------|-----------|
| `calculateCriticalPath(tasks[])` | Pipeline completo: converte min→h, constrói edge map, executa forward/backward pass, classifica slack, gera diagnósticos completos. Retorna `CPMAnalysis`. |
| `getTaskMetrics(task)` | Extrai `TaskMetrics` de um `TaskNode` já calculado. |
| `computePackageCriticality(tasks, criticalPath)` | Agrupa tarefas por pacote WBS e calcula score de criticidade: `criticalRatio * 0.3 + slackRisk * 0.2 + durationRatio * 0.5`. |
| `buildCriticalPathSequence(tasks, projectDuration, edgeMap)` | Reconstrói a sequência do caminho crítico por backtracking do nó final, priorizando predecessores com slack ≈ 0 e alinhamento temporal. |
| `generateAlerts(tasks, criticalTasks, diagnostics)` | Gera lista de alertas textuais: ciclos detectados, dependências ausentes, cronograma sem folga. |

---

### `cpm-passes.utils.ts` — Passagens de Grafo

Implementa as passagens topológicas do CPM usando **Kahn's Algorithm** (BFS sobre grafo de dependências).

#### Normalização e Extração de Arestas

| Função | Descrição |
|--------|-----------|
| `normalizeRelationship(input?)` | Normaliza string para `DependencyType` via `Object.values()` case-insensitive. Default: `FINISH_TO_START`. |
| `extractExplicitEdges(dependencyEdges, seen)` | Extrai arestas do campo `dependencyEdges` (edges estruturadas com `predecessorId` + `relationship`). |
| `extractFallbackEdges(dependencies, seen)` | Extrai arestas do campo legacy `dependencies` (array de IDs simples), sempre com `FINISH_TO_START`. |
| `getDependencyEdges(task)` | Combina edges explícitas + fallback, deduplicando por predecessorId. |
| `buildEdgeMap(tasks[])` | Constrói `Map<taskId, TaskDependencyEdge[]>` para todo o conjunto de tarefas. |

---

## Dependency Inference — Inferência de Dependências

### `DependencyInferenceService` — `dependency-inference.service.ts`

Infere dependências entre tarefas usando dois modos complementares.

**Seções e Métodos:**

#### 1. Inferência Heurística

| Método | Descrição |
|--------|-----------|
| `inferHeuristicPhases(tasks[])` | Agrupa tarefas por fases (baseadas em `microTaskType` e naming patterns) e cria dependências sequenciais entre grupos. Determinístico, sem chamada à IA. |

#### 2. Inferência via IA (Gemini)

| Método | Descrição |
|--------|-----------|
| `inferWithAi({ tasks, maxEdges?, leafName?, wbsPath?, requestId? })` | Envia tarefas ao Gemini e recebe dependências no formato de tuplas `[taskId, dependsOnTaskId, relationship?]`. Aplica validação Zod, filtragem de edges inválidas e remoção de ciclos. Suporta retry com prompt reduzido. |
| `inferInterLeafWithAi({ leaves, maxEdges?, projectId?, requestId? })` | Infere dependências **entre** leafs WBS (macro-ordenação), usando gates de início/fim de cada leaf. Garante que as arestas cruzem folhas diferentes. |

---

## Hierarchy — Hierarquia de Tarefas

### `TasksHierarchyService` — `hierarchy.service.ts`

Gerencia **navegação e métricas** da árvore de tarefas parentais.

**Seções e Métodos:**

#### 1. Linhagem e Hierarquia

| Método | Descrição |
|--------|-----------|
| `getTaskLineage(id, maxDepth?)` | Retorna `{ ancestors[], children[], warnings[] }`. Sobe a árvore via `parentTaskId` até a raiz ou `maxDepth`. |
| `getDescendants(id, maxDepth?)` | BFS iterativo sobre `parentTaskId` para listar todos os descendentes. Default `maxDepth=1000`. |

#### 2. Contribuição de Valor

| Método | Descrição |
|--------|-----------|
| `calculateValueContribution(id)` | Calcula `contributionPercent`: XP concluído na subárvore da tarefa / XP total concluído na raiz da árvore. |
