# Módulo: Workflow de Tarefas

## Descrição

Gerencia a criação, atualização, transição de estados no Kanban, pomodoros e tarefas recorrentes.

## Principais Serviços

- **`TasksWriteService`**: CRUD e atualização com cálculo derivado de campos e estatísticas.
- **`TasksCompletionService`**: Conclusão operacional de tarefas e transição de colunas no Kanban.
- **`TasksRecurringService`**: Gerenciamento de tarefas recorrentes com cálculo de próximos ciclos.
- **`TasksInputService`**: Resolução e sanitização de dados de entrada de tarefas.

## Endpoints REST

- `POST /tasks`: Criação de tarefa
- `PATCH /tasks/:id/conclude`: Marcação como concluída
- `PATCH /tasks/:id/increment-pomodoro`: Incremento de pomodoros executados
