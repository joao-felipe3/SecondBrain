# Tasks Intelligence Services

## Visão Geral

O módulo de Inteligência de Tarefas agrupa serviços que utilizam o modelo de IA **Google Gemini** para potencializar o planejamento operacional, decomposição funcional e enriquecimento automático de micro-tarefas.

## Serviços Principais

### `AiSuggestionsService` (`ai-suggestions.service.ts`)

- **Objetivo**: Gerar sugestões contextualizadas de micro-tarefas com base nos objetivos do projeto e histórico recente.
- **Suporte a Streaming**: Integração via SSE (Server-Sent Events) no endpoint `GET /tasks/ai-suggestions-stream`.

### `ChecklistService` (`checklist.service.ts`)

- **Objetivo**: Autogerar checklists operacionais acionáveis para micro-tarefas com base no tipo (`habit`, `complex`, `quick`, `subtask`) e padrão de execuções anteriores.

### `FeedbackService` (`feedback.service.ts`)

- **Objetivo**: Coletar feedback de aceitação/rejeição do usuário sobre sugestões de IA para ajuste contínuo de relevância.

## Segurança e Guardrails

- Sanitização rigorosa de entradas JSON via `json-sanitizer.util.ts`.
- Filtros de NoSQL Injection em todas as queries com casting explícito de IDs (`String()` e `new Types.ObjectId()`).
