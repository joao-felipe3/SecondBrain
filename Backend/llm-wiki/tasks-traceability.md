# `tasks/services/traceability/` — Guia de Referência

## Visão Geral

A pasta `traceability/` reúne os serviços e utilitários responsáveis por **rastreabilidade e mapeamento de requisitos/jornada ao trabalho real (tarefas)**, implementando a Requirements Traceability Matrix (RTM).

---

## Estrutura de Arquivos

```
traceability/
├── index.ts                          # Barrel export dos serviços
│
├── rtm.service.ts                    # RTMService (facade) — delega para os 3 serviços abaixo
├── rtm-crud.service.ts               # RTMCrudService — CRUD de requisitos e mapeamentos
├── rtm-ai.service.ts                 # RTMAiService (facade) — delega para Journey + Mapping
├── rtm-journey.service.ts            # RTMJourneyService — geração de jornada via Gemini
├── rtm-mapping.service.ts            # RTMMappingService — auto-mapeamento e geração de tarefas
├── rtm-validation.service.ts         # RTMValidationService — validateRTM + getRTMMatrix
│
└── utils/
    ├── index.ts                      # Barrel export dos utilitários
    ├── rtm-ai.utils.ts               # Funções puras: prompt builders + normalização de respostas
    └── rtm.utils.ts                  # Helpers puros: normalizeKind, normalizeType, levelForKind, etc.
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

## Dependências Externas

```
traceability/
├── GeminiService          (ai/) — generateContent (RTMAiService)
└── TasksService           (tasks/) — via forwardRef (RTMAiService: criar tarefas para ações órfãs)
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
