# Módulo: Rastreabilidade e Matriz RTM

## Descrição

Responsável pelo vínculo bidirecional entre requisitos da jornada do projeto e as tarefas operacionais no Kanban (Requirements Traceability Matrix - RTM).

## Principais Serviços

- **`RTMCrudService`**: Associação, desacoplamento e sincronização entre itens da jornada e tarefas.
- **`RequirementMapper`**: Transformação entre entidades Mongoose e DTOs de rastreabilidade.

## Integridade e Validação

- Garante que cada micro-tarefa criada via WBS possua rastreabilidade com o objetivo SMART pai.
