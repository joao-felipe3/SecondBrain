# `tasks/services/traceability/` — Guia de Referência

## Visão Geral

A pasta `traceability/` reúne os serviços e utilitários responsáveis por **rastreabilidade, análise crítica e mapeamento de dependências** entre tarefas. Cobre quatro domínios distintos:

| Domínio | Sigla | O que faz |
|---------|-------|-----------|
| Requirements Traceability Matrix | **RTM** | Mapeia requisitos/jornada ao trabalho real (tarefas) |
| Critical Path Method | **CPM** | Calcula caminho crítico, folgas, ES/EF/LS/LF e diagnósticos |
| Dependency Inference | **DI** | Infere dependências entre tarefas via heurísticas e IA (Gemini) |
| Hierarchy | **H** | Navega e calcula linhagem, descendentes e contribuição de XP por subárvore |

---

## Estrutura de Arquivos

```

traceability/
├── index.ts                          # Barrel export dos serviços
│
│   ── RTM (Requirements Traceability Matrix) ──
├── rtm.service.ts                    # RTMService (facade) — delega para os 3 serviços abaixo
├── rtm-crud.service.ts               # RTMCrudService — CRUD de requisitos e mapeamentos
├── rtm-ai.service.ts                 # RTMAiService (facade) — delega para Journey + Mapping
├── rtm-journey.service.ts            # RTMJourneyService — geração de jornada via Gemini
├── rtm-mapping.service.ts            # RTMMappingService — auto-mapeamento e geração de tarefas
├── rtm-ai.utils.ts                   # Funções puras: prompt builders + normalização de respostas
├── rtm-validation.service.ts         # RTMValidationService — validateRTM + getRTMMatrix
├── rtm.utils.ts                      # Helpers puros: normalizeKind, normalizeType, levelForKind, etc.
│
│   ── CPM (Critical Path Method) ──
├── cpm.service.ts                    # CPMService — CRUD de dependências + interface CPM
├── cpm-analysis.utils.ts             # Motor CPM: calculateCriticalPath, métricas, alertas
├── cpm-passes.utils.ts               # Passagens de grafo: Forward Pass, Backward Pass, edge extraction
│
│   ── Dependency Inference ──
├── dependency-inference.service.ts   # DependencyInferenceService — inferência heurística e via Gemini
├── dependency-inference.utils.ts     # Funções puras: keepAcyclic, filterInvalidAndSelfEdges, etc.
│
│   ── Hierarchy ──
└── hierarchy.service.ts              # TasksHierarchyService — linhagem, descendentes, contribuição XP
```

---

## RTM — Requirements Traceability Matrix

### `RTMService` — `rtm.service.ts` (Facade)

Ponto de entrada único para o domínio RTM. **Não contém lógica de negócio** — apenas delega para os três serviços especializados. Mantém a API pública estável para o `RTMController` e o `TasksModule`.

```
RTMController
    └── RTMService (facade)
            ├── RTMCrudService       → CRUD banco
            ├── RTMAiService         → Gemini
            └── RTMValidationService → validateRTM + matriz
```

**Hierarquia da Jornada:**
```
objective  (O)
  └── habit     (H)
        └── stage    (E)
              └── action   (A)  ← vinculada a tarefas
                    └── [tasks]
```

---

### `RTMCrudService` — `rtm-crud.service.ts`

Responsabilidade única: **operações de banco** sobre `RequirementDocument`.

**Seções e Métodos:**

#### 1. Requisitos — Leitura

| Método | Descrição |
|--------|-----------|
| `getRequirements(projectId)` | Retorna todos os itens da jornada ordenados por `hierarchyLevel`. |

#### 2. Requisitos — Persistência

| Método | Descrição |
|--------|-----------|
| `saveRequirements(projectId, items[])` | Insere itens em ordem topológica (por nível), resolvendo `parentRef → parentItemId`. Deduplicação por `kind::description`. |

#### 3. Requisitos — Exclusão

| Método | Descrição |
|--------|-----------|
| `deleteRequirement(requirementId)` | Remove um item pelo ID. |
| `deleteAllRequirements(projectId)` | Remove toda a jornada do projeto. |

#### 4. Mapeamento Tarefa ↔ Ação

| Método | Descrição |
|--------|-----------|
| `mapRequirementToTask(projectId, requirementId, taskId)` | Vincula uma tarefa a uma ação (`$addToSet traceableActionItems`). |
| `unmapRequirementFromTask(requirementId, taskId)` | Remove vínculo; se não houver mais tarefas, status volta para `open`. |

---

### `RTMAiService` — `rtm-ai.service.ts` (Facade)

Responsabilidade: **facade de IA** — sem lógica de negócio, delega para `RTMJourneyService` e `RTMMappingService`.

```
RTMAiService (facade)
    ├── RTMJourneyService  → generateRequirements
    └── RTMMappingService  → autoMapRequirementsToTasks
                         → generateTasksForUnmappedRequirements
```

---

### `RTMJourneyService` — `rtm-journey.service.ts`

Responsabilidade única: **gerar a estrutura de jornada** a partir de um Smart Objective.

| Método | Descrição |
|--------|-----------|
| `generateRequirements(smartObjective)` | Envia um Smart Objective (O/S/M/A/R/T) ao Gemini e recebe um JSON array com a estrutura da jornada (10–24 itens). Usa `buildGenerateRequirementsPrompt` + `normalizeGeneratedItems` de `rtm-ai.utils.ts`. |

---

### `RTMMappingService` — `rtm-mapping.service.ts`

Responsabilidade única: **garantir cobertura completa** entre tarefas e ações da jornada.

#### Métodos Públicos

| Método | Descrição |
|--------|-----------|
| `autoMapRequirementsToTasks(projectId, tasks[])` | Envia tarefas e ações ao Gemini em batches de 10 para auto-vínculo. Cria ações automaticamente para tarefas órfãs. Chama `RTMValidationService.validateRTM` no final. |
| `generateTasksForUnmappedRequirements(projectId)` | Para cada ação sem tarefas, pede ao Gemini que gere 1–2 tarefas práticas e as persiste via `TasksService.create`. |

#### Helpers Privados

| Método | Descrição |
|--------|-----------|
| `checkEarlyExitConditions(allItems, actionItems)` | Verifica se há itens e ações disponíveis. Retorna early exit ou `null`. |
| `filterUnmappedTasks(tasks, actionItems)` | Remove tarefas já vinculadas a alguma ação. |
| `runBatchMapping(tasksToMap, actionItems)` | Itera batches de 10 tarefas, chama Gemini e processa resposta. Usa `processMappingResponse` e `applyFallbackMapping`. |
| `handleOrphanTasks(orphanTasks, allItems, projectId, mappings)` | Agrupa tarefas órfãs e cria novas ações para elas. |
| `applyMappings(mappings)` | Persiste todos os vínculos acumulados via `$addToSet`. |
| `generateAndLinkTasks(actionItems, projectId)` | Loop principal de geração de tarefas por ação. |
| `persistGeneratedTasks(tasksToCreate, projectId, req)` | Cria cada tarefa via `TasksService.create` e retorna os IDs. |

**Fluxo de `autoMapRequirementsToTasks`:**
```
checkEarlyExitConditions
  filterUnmappedTasks
    runBatchMapping (batches de 10)
      buildAutoMapBatchPrompt → Gemini → processMappingResponse
      (on error) applyFallbackMapping
    handleOrphanTasks → cria novas ações para tarefas ORPHAN
    applyMappings → $addToSet no banco
      RTMValidationService.validateRTM(projectId)
```

---

### `rtm-ai.utils.ts`

Funções puras (sem DI), testáveis de forma isolada.

#### Prompt Builders

| Função | Descrição |
|--------|-----------|
| `buildGenerateRequirementsPrompt(smartObjective)` | Retorna o prompt completo para geração de jornada. |
| `buildAutoMapBatchPrompt(tasksDesc, actionsDesc)` | Retorna o prompt para mapeamento de um batch. |
| `buildGenerateTasksPrompt(actionDescription)` | Retorna o prompt para geração de 1–2 tarefas por ação. |

#### Response Normalizers

| Função | Descrição |
|--------|-----------|
| `normalizeGeneratedItems(parsed[])` | Normaliza e deduplica itens brutos do Gemini para `JourneyDraft[]`. |
| `formatTasksForPrompt(batch)` | Formata lista de tarefas para inserir no prompt de auto-mapeamento. |
| `processMappingResponse(mappingArray, batch, mappings, orphanTasks)` | Distribui cada entrada da resposta entre `mappings` (reqId → taskIds) ou `orphanTasks`. |
| `applyFallbackMapping(batch, fallbackActionId, mappings)` | Fallback quando a resposta da IA falha: vincula todas as tarefas do batch à primeira ação. |

---

### `RTMValidationService` — `rtm-validation.service.ts`

Responsabilidade única: **validação de cobertura** e **geração da matriz RTM**.

#### 1. Validação RTM

| Método | Descrição |
|--------|-----------|
| `validateRTM(projectId)` | Verifica cobertura: cada objetivo tem hábito, hábito tem etapa, etapa tem ação, ação tem tarefa. Retorna `{ isValid, coverage%, unmappedRequirements[], risks[] }`. |

#### 2. Matriz RTM

| Método | Descrição |
|--------|-----------|
| `getRTMMatrix(projectId, tasks[])` | Gera estrutura `{ requirements[], tasks[], matrix: Map<reqId, Set<taskId>>, validation }` para exibição da matriz de rastreabilidade. |

---

---

### `rtm.utils.ts`

Funções puras de suporte ao `RTMService`:

| Função | Descrição |
|--------|-----------|
| `normalizeKind(input)` | Normaliza string para `JourneyKind` (`objective`, `habit`, `stage`, `action`). Fallback: `action`. |
| `normalizeType(input, kind)` | Normaliza `RequirementType` coerente com o kind. |
| `levelForKind(kind)` | Retorna o nível hierárquico numérico (objective=1, habit=2, stage=3, action=4). |
| `getLinkedActions(requirement)` | Retorna o array de taskIds vinculados (`traceableActionItems`). |
| `parseJsonArray(response)` | Faz parse seguro de resposta JSON do Gemini (strip markdown, tenta `JSON.parse`). |

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

**Retorno de `calculateCriticalPath` — `CPMAnalysis`:**
```typescript
{
  criticalPath: string[],           // IDs ordenados do caminho crítico
  projectDuration: number,          // horas
  tasksByImpact: TaskNode[],        // ordenadas por slack ASC, inDegree DESC, duration DESC
  alerts: string[],
  packageCriticality?: PackageCriticality[],
  diagnostics?: {
    taskCount, criticalCount, criticalPercent,
    criticalChainTaskCount, criticalChainDuration,
    nearCriticalCount, totalWork, impliedParallelism,
    hasCycle, unprocessedForward, unprocessedBackward,
    edgeCount, startNodeCount, endNodeCount, avgDependenciesPerTask,
    slackBuckets: { negative, critical, nearCritical, lowSlack, comfortable },
    topUnlockers: [{ taskId, taskName, outDegree }],
    topBottlenecks: [{ taskId, taskName, inDegree }],
    validation: { missingDependencyRefs, missingDependencySamples[], reliability }
  }
}
```

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

#### Forward Pass (Early Start / Early Finish)

Calcula `earlyStart` e `earlyFinish` de cada tarefa — o mais cedo que pode começar/terminar respeitando todas as dependências.

| Função | Descrição |
|--------|-----------|
| `buildForwardPassMaps(tasks, edgeMap, taskMap)` | Inicializa `indegree`, `dependents` e `maxConstraintStart` em um único loop. |
| `updateForwardSuccessor(predecessor, dep, ...)` | Atualiza `maxConstraintStart` do sucessor e decrementa `indegree`. Lógica por tipo de relacionamento. |
| `forwardPass(tasks, edgeMap)` | Executa BFS a partir de nós com `indegree=0`. Retorna `{ hasCycle, unprocessed }`. |

#### Backward Pass (Late Start / Late Finish)

Calcula `lateStart` e `lateFinish` — o mais tarde que pode começar/terminar sem atrasar o projeto.

| Função | Descrição |
|--------|-----------|
| `buildBackwardPassMaps(tasks, projectDuration, edgeMap, taskMap)` | Inicializa `outdegree` e `predecessorBounds` (limites LS/LF) em um único loop. |
| `updateBackwardPredecessor(successor, dep, ...)` | Atualiza bounds do predecessor via `computeCandidateBounds`. Decrementa `outdegree`. |
| `backwardPass(tasks, projectDuration, edgeMap)` | Executa BFS reverso a partir de nós com `outdegree=0`. Retorna `{ hasCycle, unprocessed }`. |

**Lógica por tipo de relacionamento (`computeCandidateBounds`):**

| `DependencyType` | Forward: `candidateStart` do sucessor | Backward: `candidateLateStart` do predecessor |
|-----------------|--------------------------------------|----------------------------------------------|
| `FINISH_TO_START` | `predecessor.earlyFinish` | `successor.lateStart` |
| `START_TO_START` | `predecessor.earlyStart` | `successor.lateStart` |
| `FINISH_TO_FINISH` | `predecessor.earlyFinish - successor.duration` | `successor.lateFinish - predecessor.duration` |

> **Ciclos**: Quando detectados (nós não processados), um `logger.warn` é emitido. Nenhuma exceção é lançada — o cálculo prossegue com os nós processáveis.

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

**Pipeline de `inferWithAi`:**
```
Monta prompt com instruções + tasks JSON
  geminiService.generateContent(prompt, { responseMimeType: 'application/json' })
    extractJsonObject → schema.parse(Zod)
      normalizeDependencies(raw)
        filterInvalidAndSelfEdges(deps, validIds)
          deps.slice(0, hardMaxEdges)
            keepAcyclic([...validIds], deps)
              → InferredDependency[]

Em caso de erro → retry com prompt reduzido (metade das edges, só tuplas)
```

**Validação Zod (`schema`):**
```typescript
// Aceita duas formas no array dependencies:
{ taskId: string, dependsOnTaskId: string, relationship?: string, reason?: string, confidence?: number }
// ou (compacto):
[taskId: string, dependsOnTaskId: string, relationship?: string]
```

**Variáveis de Ambiente:**

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `CPM_DEP_INFER_MAX_EDGES` | `60` | Limite de arestas por chamada intra-leaf |
| `CPM_DEP_INFER_MAX_TOKENS` | `2400` | Max tokens de saída para inferência intra-leaf |
| `CPM_DEP_INFER_INTERLEAF_MAX_EDGES` | `auto` | Limite para inferência inter-leaf |
| `CPM_DEP_INFER_INTERLEAF_MAX_TOKENS` | `1600` | Max tokens para inferência inter-leaf |
| `CPM_DEP_INFER_MODEL` | — | Override de modelo Gemini |
| `WBS_GEMINI_MODEL` | — | Override de modelo (fallback compartilhado com WBS) |
| `CPM_DEP_INFER_VERBOSE` | `0` | Log detalhado de contagens e duração (`1` ou `true`) |

---

### `dependency-inference.utils.ts`

Funções puras de suporte à inferência:

| Função | Descrição |
|--------|-----------|
| `inferHeuristicPhases(tasks[])` | Implementação real da inferência por fases heurísticas. |
| `normalizeDependencies(raw[])` | Normaliza tanto objetos quanto tuplas para `InferredDependency[]`. |
| `filterInvalidAndSelfEdges(deps, validIds)` | Remove self-loops e edges com IDs não pertencentes ao conjunto. |
| `keepAcyclic(taskIds, deps)` | Remove edges que criariam ciclos (DFS greedy). Garante que o resultado seja um DAG. |
| `truncateText(text, maxLen)` | Trunca descrição para o prompt (economiza tokens). |

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

**Fluxo de `calculateValueContribution`:**
```
Sobe até a raiz via parentTaskId
  getDescendants(rootId)       ← todos os nós do projeto
    totalCompletedXP = Σ(experience) onde isConcluded=true

  getDescendants(id)           ← só os nós da subárvore alvo
    subtreeCompletedXP = Σ(experience) onde isConcluded=true

  contributionPercent = subtreeCompletedXP / totalCompletedXP * 100
```

---

## Dependências Externas

```
traceability/
├── GeminiService          (ai/) — generateContent (RTMAiService + DependencyInferenceService)
├── TasksService           (tasks/) — via forwardRef (RTMAiService: criar tarefas para ações órfãs)
└── ProjectsService        (projects/) — via forwardRef (não usado diretamente aqui, mas no CPMService)
```

**Injeções internas ao domínio RTM:**
```
RTMAiService
  └── RTMValidationService  ← chama validateRTM após auto-mapeamento e geração de tarefas
```

---

## Pontos de Atenção

- **`RTMService` é uma fachada pura**: Não contém lógica de negócio. O `RTMController` injeta apenas `RTMService`, mas o `TasksModule` registra também `RTMCrudService`, `RTMAiService` e `RTMValidationService` para que o DI funcione.
- **`RTMAiService` usa `forwardRef(() => TasksService)`**: Para evitar dependência circular. A injeção funciona em runtime mas pode causar `undefined` se acessada prematuramente no construtor.
- **`RTMAiService` depende de `RTMValidationService`**: Chama `validateRTM` ao final de `autoMapRequirementsToTasks` e `generateTasksForUnmappedRequirements`. O `RTMValidationService` deve estar registrado antes no NestJS DI.
- **Duração em horas no CPM**: `calculateCriticalPath` converte `duration / 60` antes de qualquer cálculo. Todos os campos de saída (`earlyStart`, `projectDuration`, `slack`, etc.) estão em **horas**.
- **Ciclos no grafo CPM**: São detectados mas não lançam exceção. O retorno inclui `hasCycle: true` e `unprocessed > 0` em `diagnostics`. Use `alerts[]` para comunicar ao usuário.
- **Formato compacto no prompt de inferência**: O Gemini é instruído a usar tuplas `[taskId, dependsOnTaskId, relationship]` em vez de objetos para economizar tokens. O parser Zod suporta ambos os formatos.
- **`keepAcyclic` é greedy**: Remove edges em ordem de chegada para quebrar ciclos. Não garante o conjunto máximo acíclico ótimo — priorizamos velocidade.
- **`buildCriticalPathSequence` usa backtracking**: Começa pelo nó com maior `earlyFinish` e volta por predecessores. Em caso de empate, prioriza `criticalBonus` (slack < 0.1) > `alignmentBonus` (alinhamento temporal) > `timelineRef` > `id` (desempate lexicográfico).

