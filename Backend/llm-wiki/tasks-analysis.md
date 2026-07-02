# `tasks/services/analysis/` — Guia de Referência

## Visão Geral

A pasta `analysis/` concentra os serviços responsáveis pelas **métricas quantitativas das tarefas**: estimativas PERT, cálculo de variância, score de risco RTM, métricas EVM e monitoramento de buffer de projeto (corrente crítica).

Cada serviço tem uma responsabilidade única e bem definida. A comunicação entre eles é feita por injeção de dependência padrão do NestJS.

> **Nota:** `index.ts` também re-exporta `CpmService`, `DependencyInferenceService` e `HierarchyService` de `../traceability/` por compatibilidade retroativa — esses serviços não residem nesta pasta.

---

## Estrutura de Arquivos

```
analysis/
├── index.ts             # Barrel export dos serviços (+ re-exports de traceability/)
├── metrics.service.ts   # TasksMetricsService — PERT, RTM risk, EVM aplicados a DTOs
├── pert.service.ts      # PertService + TasksPertService — cálculo e persistência de PERT
└── buffer.service.ts    # BufferService — buffer de corrente crítica por projeto
```

---

## Serviços

### `TasksMetricsService` — `metrics.service.ts`

Serviço **sem estado** que aplica cálculos de métricas diretamente em DTOs de criação/atualização de tarefas. É consumido pelo `TasksWriteService` (workflow/) em toda operação de escrita.

**Métodos públicos:**

| Método | Descrição |
|--------|-----------|
| `applyPertEstimates(dto, fallbackTask?)` | Calcula e injeta os campos PERT (`optimistic`, `mostLikely`, `pessimistic`, `expected`, `variance`) no DTO. Usa `fallbackTask` como base quando os campos não estão no DTO. |
| `applyRtmRisk(dto, fallbackTask?)` | Avalia se a tarefa possui vínculo de rastreabilidade (requirement, journeyItem ou WBS). Define `rtmRisk: true` com mensagem quando não há vínculo. |
| `applyEvmMetrics(dto, fallbackTask?)` | Calcula progresso, valor planejado, valor agregado e SPI da tarefa. Gera `evmAlert` quando `SPI < 0.9`. |
| `calculateDeadline(createdAt, expectedMinutes)` | Deriva um prazo estimado adicionando 10% de folga à duração PERT esperada. |

**Fluxo de `applyPertEstimates`:**
```
resolveBaseMinutes(dto, fallbackTask)   ← pertMostLikely ?? pomodorosPlanned*25 ?? fallback
  calculatePertBounds(dto, base)        ← garante: optimistic ≤ mostLikely ≤ pessimistic
    calculateExpectedAndVariance()      ← fórmula (O + 4M + P) / 6 e variância σ²
      injeta campos no dto
```

**Fluxo de `applyEvmMetrics`:**
```
resolveExpectedMinutes(dto, fallback)
  calculateProgress(dto, fallback, expected)  ← pomodorosDid / pomodorosPlanned
    calculateElapsedRatio(dto, fallback)      ← (now - createdAt) / (deadline - createdAt)
      plannedValue = expected * elapsedRatio
        earnedValue = expected * progress
          SPI = earnedValue / plannedValue
```

---

### `PertService` — `pert.service.ts` (classe auxiliar)

Funções matemáticas puras de PERT, sem acesso a banco de dados.

**Métodos públicos:**

| Método | Descrição |
|--------|-----------|
| `calculateExpectedTime(estimate)` | Fórmula `(O + 4M + P) / 6`. |
| `calculateVariance(estimate)` | `((P - O) / 6)²`. |
| `calculateStandardDeviation(estimate)` | Raiz quadrada da variância. |
| `calculatePertMetrics(estimate)` | Valida e retorna `{ expectedTime, variance, standardDeviation, formula, estimate }`. Lança erro se `O > M` ou `M > P`. |
| `validateEstimate(estimate)` | Verifica `optimistic ≤ mostLikely ≤ pessimistic`. |
| `formatMinutes(minutes)` | Formata minutos como `"Xh Ymin"`. |
| `getRecommendation(variance, expected)` | Retorna recomendação textual baseada no coeficiente de variação. |

---

### `TasksPertService` — `pert.service.ts` (serviço injetável)

Orquestra a persistência de estimativas PERT no banco de dados, delegando cálculos ao `PertService`.

**Métodos públicos:**

| Método | Descrição |
|--------|-----------|
| `updatePert(taskId, updatePertDto)` | Valida entradas, calcula métricas PERT, deriva novo `deadline` e persiste na tarefa. |
| `savePertEstimate(taskId, pertEstimateDto)` | Salva os campos PERT na tarefa sem recalcular deadline. Retorna `PertEstimateResponseDto`. |

**Fluxo de `updatePert`:**
```
validateInputs(taskId, dto)          ← ObjectId válido + tipos + ordem O ≤ M ≤ P
  pertService.calculatePertMetrics() ← expected + variance + stdDev
    metricsService.calculateDeadline ← createdAt + expected * 1.1
      taskModel.findByIdAndUpdate()  ← persiste todos os campos PERT + deadline
```

---

### `BufferService` — `buffer.service.ts`

Gerencia o **buffer de projeto** baseado na teoria da Corrente Crítica (CCPM). Persiste e monitora o consumo do buffer por projeto usando o schema `ProjectBuffer`.

**Interfaces exportadas:**

| Interface | Campos |
|-----------|--------|
| `TaskMetrics` | `taskId`, `estimatedHours`, `variance?`, `isCritical?` |
| `BufferStatus` | `total`, `consumed`, `remaining`, `percentageUsed`, `isAlert` |
| `BufferAlert` | `severity ('warning'\|'critical')`, `message`, `recommendation`, `percentageUsed` |

**Métodos públicos:**

| Método | Descrição |
|--------|-----------|
| `calculateProjectBuffer(projectId, tasks, criticalPath)` | Calcula o buffer via desvio-padrão do caminho crítico e faz upsert no banco. Retorna `ProjectBuffer` ou `null`. |
| `consumeBuffer(projectId, hoursUsed)` | Incrementa `consumed` e retorna o `BufferStatus` atualizado. Emite warning se atingir o threshold. |
| `resetBufferConsumption(projectId)` | Zera o campo `consumed` do buffer do projeto. |
| `getBufferStatus(projectId)` | Lê e retorna o estado atual de consumo do buffer. |
| `checkBufferHealth(projectId)` | Retorna lista de `BufferAlert[]` com severidade `warning` (≥50%) ou `critical` (≥75%). |
| `getBufferHistory(projectId)` | Retorna snapshot histórico simplificado (apenas ponto atual). |

**Fórmula do buffer:**
```
criticalPathDuration = Σ estimatedHours (tarefas críticas)
totalVariance        = Σ variance (tarefas críticas)
standardDeviation    = √totalVariance
projectBuffer        = max(criticalPathDuration * 0.5, standardDeviation * 1.645)
```

**Thresholds de alerta:**
- `≥ 50% e < 75%` → `warning`
- `≥ 75%` → `critical`
- `≥ 100%` → `critical` (buffer esgotado)

---

## Dependências Externas

```
analysis/
├── ProjectBuffer (schema) — persistência do buffer por projeto
├── Task (schema)          — leitura de tarefas para PERT e EVM (TasksPertService)
└── GeminiService          — não utilizado diretamente aqui
```

---

## Padrões de Injeção

```
TasksWriteService (workflow/)
  └── TasksMetricsService    ← applyPertEstimates + applyRtmRisk + applyEvmMetrics

TasksPertService
  ├── PertService            ← cálculos matemáticos puros
  └── TasksMetricsService    ← calculateDeadline

BufferService
  └── ProjectBufferModel     ← upsert e consulta do buffer
```

---

## Pontos de Atenção

- **`TasksMetricsService` é stateless**: não injeta nenhum provider. Pode ser testado unitariamente sem mocks de banco.
- **Campos PERT em minutos**: todos os campos (`pertOptimisticMinutes`, `pertExpectedMinutes`, etc.) são em **minutos**. A conversão para horas ocorre apenas no `BufferService` e no `CpmService` (`traceability/`).
- **Fallback de estimativa**: `applyPertEstimates` aceita um `fallbackTask` para casos de atualização parcial — se o DTO não traz os campos PERT, usa os valores já salvos na tarefa como base.
- **Buffer threshold configurável**: o campo `threshold` do schema `ProjectBuffer` (padrão: `75`) pode ser sobrescrito futuro. Hoje é sempre iniciado como `75` no `calculateProjectBuffer`.
- **`getBufferHistory` é stub**: retorna apenas um ponto (o estado atual). Histórico temporal detalhado requer extensão do schema.
