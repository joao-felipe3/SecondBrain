# Tasks Analysis Services

## Visão Geral

Este módulo contém serviços especializados na análise quantitativa e estocástica de tarefas dentro do SecondBrain. Ele integra técnicas consagradas de engenharia e gestão de projetos, como **PERT (Program Evaluation and Review Technique)**, **CPM (Critical Path Method)** e **EVM (Earned Value Management)**.

## Serviços Principais

### `PertService` (`pert.service.ts`)

- **Objetivo**: Calcular estimativas probabilísticas de duração de tarefas usando a distribuição Beta (otimista, mais provável, pessimista).
- **Métricas**:
  - Duração Esperada: \(E = \frac{O + 4M + P}{6}\)
  - Variância: \(V = \left(\frac{P - O}{6}\right)^2\)
  - Desvio Padrão: \(\sigma = \sqrt{V}\)

### `MetricsService` (`metrics.service.ts`)

- **Objetivo**: Calcular indicadores operacionais agregados de progresso e desempenho de execução.
- **Responsabilidades**: Agregação de estimativas de tempo, contagem de pomodoros concluídos e alinhamento com prazos.

## Integrações

- Consumido pelo `TasksController` para atualização de estimativas via `POST /tasks/:id/pert-estimate`.
- Consumido pelo `ProjectsModule` para renderização de diagramas Gantt e análise de caminho crítico (CPM).
