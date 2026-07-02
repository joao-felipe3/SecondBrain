# `tasks/services/monitoring/` — Guia de Referência

## Visão Geral

A pasta `monitoring/` concentra os serviços responsáveis pela **observabilidade em tempo real das tarefas e hábitos**: detecção de desvios de tempo, criação e listagem de alertas, e dashboard de streaks e aderência de hábitos recorrentes.

Cada serviço tem responsabilidade única. `AlertsService` e `DeviationDetectionService` são consumidos pelo `TasksCompletionService` (workflow/) no fluxo de conclusão de tarefas.

---

## Estrutura de Arquivos

```
monitoring/
├── index.ts                        # Barrel export dos serviços
├── alerts.service.ts               # AlertsService — criação e listagem de alertas
├── deviation-detection.service.ts  # DeviationDetectionService — desvio de tempo PERT
└── habits.service.ts               # TasksHabitsService — streaks e dashboard de hábitos
```

---

## Serviços

### `AlertsService` — `alerts.service.ts`

Gerencia o ciclo de vida de **alertas do sistema** relacionados a tarefas e projetos. Persiste no schema `TaskAlert`.

**Interface exportada:**

```typescript
interface CreateAlertInput {
  userId?:      string | Types.ObjectId;
  taskId?:      string | Types.ObjectId;
  projectId?:   string | Types.ObjectId;
  type:         'warning' | 'error' | 'info';
  message:      string;
  recommendation?: string;
}
```

**Métodos públicos:**

| Método | Descrição |
|--------|-----------|
| `createAlert(input)` | Persiste um alerta novo com `isRead: false`. Aceita `userId`, `taskId` e `projectId` opcionais. |
| `listAlerts(options?)` | Lista alertas com filtros opcionais de `userId`, `projectId` e `unreadOnly`. Ordena por `createdAt desc`. Limite padrão: 50. Usa hint de índice `{ userId, isRead, createdAt }`. |
| `markRead(id, userId?)` | Marca um alerta como `isRead: true`. Se `userId` for passado, usa como filtro adicional de segurança. |

---

### `DeviationDetectionService` — `deviation-detection.service.ts`

Detecta **desvios de tempo de execução** comparando o tempo real consumido (via pomodoros) com a estimativa PERT esperada. Threshold de desvio: **≥ 25%** acima do estimado.

**Interface exportada:**

```typescript
interface DeviationResult {
  isDeviated:       boolean;
  percentOver:      number;    // percentual de desvio (pode ser negativo → sem desvio)
  actualMinutes:    number;    // pomodorosDid * 30
  expectedMinutes:  number;    // pertExpectedMinutes
  message?:         string;
  recommendation?:  string;
}
```

**Métodos públicos:**

| Método | Descrição |
|--------|-----------|
| `checkTimeDeviation(taskId)` | Carrega a tarefa e compara `actualMinutes` vs `pertExpectedMinutes`. Retorna `DeviationResult` com `isDeviated = true` quando `percentOver ≥ 25`. |
| `generateDeviationAlert(taskId)` | Chama `checkTimeDeviation` e retorna o `DeviationResult` apenas se há desvio real; `null` caso contrário. |

**Fórmula de desvio:**
```
actualMinutes = pomodorosDid * 30
percentOver   = ((actualMinutes - expectedMinutes) / expectedMinutes) * 100
isDeviated    = percentOver >= 25
```

**Casos especiais:**
- Se `pertExpectedMinutes` for `0` ou ausente: retorna `isDeviated: false` com `message: 'Missing PERT expected time'`.
- A unidade de "minuto real" é `30 min/pomodoro` (não 25min), representando tempo estimado com margem.

---

### `TasksHabitsService` — `habits.service.ts`

Computa **métricas de aderência e streaks** de hábitos recorrentes e entrega o dashboard consolidado de hábitos ativos.

**Métodos públicos:**

| Método | Descrição |
|--------|-----------|
| `getStreakData(parentRecurringId)` | Retorna streak atual, streak mais longo, percentual de aderência e última data de conclusão para uma série recorrente. |
| `getHabitsDashboard(filter?)` | Agrega dados de todos os hábitos (por `microTaskType: 'habit'` ou com `recurringRule`), calculando streaks individuais e métricas globais do dashboard. |

**Fluxo de `getStreakData`:**
```
taskModel.find({ $or: [{ _id: parentRecurringId }, { parentRecurringId }] })
  .sort({ deadline: 1, createdAt: 1 })
    maintained = tasks onde recurringState ∈ ['completed', 'skipped']
      aderencePercent = (maintained / total) * 100

    currentStreak: conta do final para o início, quebra no primeiro estado ≠ completed/skipped
    longestStreak:  janela deslizante máxima de estados completed/skipped consecutivos
    lastCompletedDate: última ocorrência com state === 'completed'
```

**Fluxo de `getHabitsDashboard`:**
```
taskModel.find({ $or: [{ microTaskType: 'habit' }, { recurringRule: $exists }] })
  for each habit:
    getStreakData(rootId)       ← rootId = parentRecurringId ?? _id
      build summary { id, name, status, ...streak, deadline }
  compute aggregates:
    activeHabits               ← status !== 'done'
    averageAderencePercent     ← média aritmética
    streaksOver7Days           ← currentStreak >= 7
    dueTodayHabits             ← deadline === today (status !== 'done')
```

**Estrutura de retorno de `getHabitsDashboard` (`GetHabitsDashboardResponseDto`):**

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `projectId` | `string?` | Filtro de projeto aplicado |
| `totalHabits` | `number` | Total de hábitos encontrados |
| `activeHabits` | `number` | Hábitos com status diferente de `done` |
| `averageAderencePercent` | `number` | Média de aderência de todos os hábitos |
| `streaksOver7Days` | `number` | Hábitos com streak atual ≥ 7 dias |
| `dueTodayCount` | `number` | Hábitos com prazo hoje |
| `dueTodayHabits` | `Array<{ id, name, deadline }>` | Detalhes dos hábitos com prazo hoje |
| `habits` | `Array<HabitSummary>` | Lista individual com streak e aderência |

---

## Dependências Externas

```
monitoring/
├── Task (schema)      — leitura de tarefas para desvios e hábitos
└── TaskAlert (schema) — persistência de alertas
```

---

## Padrões de Injeção

```
TasksCompletionService (workflow/)
  ├── DeviationDetectionService  ← generateDeviationAlert após conclusão
  └── AlertsService              ← createAlert com resultado do desvio

TasksHabitsService
  └── Task (model)               ← busca de séries recorrentes e hábitos ativos
```

---

## Pontos de Atenção

- **N+1 em `getHabitsDashboard`**: para cada hábito encontrado, uma query separada `getStreakData` é disparada. Em projetos com muitos hábitos, considere batcher ou pipeline de agregação.
- **`skipped` conta como streak mantido**: tanto `completed` quanto `skipped` são considerados estados válidos para manter continuidade de streak e aderência. Apenas `pending` (ou estado ausente) quebra a sequência.
- **Unidade de tempo do desvio**: `DeviationDetectionService` usa `pomodorosDid * 30 min` como tempo real, enquanto `TasksMetricsService` usa `pomodorosDid * 25 min` para cálculo de progresso EVM. As bases são intencionalmente diferentes (30 min representa folga real estimada).
- **`listAlerts` usa hint de índice explícito**: o hint `{ userId: 1, isRead: 1, createdAt: -1 }` deve estar criado no MongoDB para performance em coleções grandes de alertas.
- **`getStreakData` valida ObjectId**: lança `BadRequestException` se o `parentRecurringId` não for um ObjectId válido — protege consultas inválidas ao banco.
