# Tasks Components - Architecture & Structure

## Overview
Este diretório contém a implementação da página de Tasks, incluindo Kanban Board, visualização detalhada (ZoomedContent), Hábitos, PERT, alertas e validação pré-conclusão.

## Directory Structure

```
tasks/
├── README.md (este arquivo)
├── board/
│   └── ZoomedContent.vue    # Overlay modal com abas para edição/visualização detalhada
├── kanban/
│   └── KanbanBoard.vue      # Visualização Kanban com 3 colunas (todo, doing, done)
├── tabs/
│   ├── EditarTab.vue        # Aba de edição de detalhes básicos
│   ├── ChecklistTab.vue     # Aba de visualização/marcação de checklist
│   ├── PertTab.vue          # Aba de estimativas PERT (O, M, P, E, σ)
│   ├── ValueTab.vue         # Aba de indicador de valor de contribuição
│   ├── LineageTab.vue       # Aba de linhagem (ancestrais + filhos)
│   ├── HistoryTab.vue       # Aba de histórico de edições
│   ├── FeedbackTab.vue      # Aba de feedback de conclusão
│   ├── HabitTimelineTab.vue # Aba de timeline visual para hábitos
│   └── HabitStatsTab.vue    # Aba de estatísticas de hábitos
├── ui/
│   ├── ValidationErrorBanner.vue    # Banner de erros pré-conclusão
│   ├── DeviationWarningAlert.vue    # Alerta de desvio de tempo + ajuste de PERT
│   ├── CompletionFeedbackModal.vue  # Modal que abre ao concluir tarefa
│   └── ... (outros componentes de UI)
├── layout/
│   ├── Sidebar.vue          # Sidebar de filtros e alertas
│   └── ... (componentes de layout)
└── controllers/
    └── ... (controladores lógicos se houver)
```

## Key Components

### ZoomedContent.vue
**Propósito:** Modal overlay com abas empilhadas (pergaminhos) que abre ao clicar em um card.

**Features:**
- 7 abas para tasks regulares (Editar, Checklist, PERT, Valor, Lineage, Histórico, Feedback)
- 5 abas para hábitos (Editar, Timeline, Estatísticas, Histórico, Feedback)
- Navegação com teclado (Arrow Left/Right para mudar abas)
- Transições suaves com animação diegética (cubic-bezier)
- Responsivo para mobile (≤480px oculta peek labels)

**Props:**
- `task`: Objeto de tarefa a editar
- `tasks`: Array de tarefas relacionadas
- `projects`: Array de projetos para seleção
- `createOrEdit`: Label do botão principal ("Criar" ou "Salvar")

**Emits:**
- `delete`: Deletar tarefa
- `close`: Fechar overlay
- `edit`: Salvar/editar tarefa
- `navigate-task`: Navegar para outra tarefa
- `navigate-context`: Navegar para contexto (projeto, WBS, etc)

### KanbanBoard.vue
**Propósito:** Visualização Kanban com 3 colunas (ToDo, Fazendo, Concluído) e drag-and-drop.

**Features:**
- Drag-and-drop entre colunas
- Auto-travamento do board quando um card está em zoom (impede move acidental)
- Ocultação automática de tasks concluídas > 24 horas
- Suporte a hábitos e tasks regulares
- Responsivo (desktop: 3 colunas; tablet: 2 colunas; mobile: 1 coluna com scroll)

**Props:**
- `tasks`: Array de tarefas a renderizar
- `projects`: Array de projetos

**Handlers:**
- `@dragstart`: Inicia drag de um card
- `@drop`: Solta card em nova coluna, chama API para atualizar status
- `@click`: Abre ZoomedContent para editar task

### ValidationErrorBanner.vue
**Propósito:** Banner que exibe erros de validação pré-conclusão.

**Features:**
- Exibe lista de erros (checklist incompleto, PERT faltando, etc)
- Clicáveis: cada erro pode navegar para o campo com problema
- Auto-carregamento ao montar componente

**Props:**
- `taskId`: ID da tarefa para validar

**API:**
- `GET /tasks/:id/validation-errors`

### DeviationWarningAlert.vue
**Propósito:** Alerta quando tempo gasto > TE estimado em 25%.

**Features:**
- Exibe comparação lado-a-lado (estimado vs. gasto)
- Mensagem contextualizada via LLM (causa provável do desvio)
- Botão "Ajustar estimativa" abre modal para reajustar PERT
- Cálculo automático de novo TE ao ajustar valores

**Props:**
- `taskId`: ID da tarefa para verificar desvio

**API:**
- `POST /tasks/:id/check-deviation`
- `PATCH /tasks/:id/pert` (ao salvar ajuste)

### CompletionFeedbackModal.vue
**Propósito:** Modal que abre automaticamente ao mover tarefa para "done".

**Features:**
- Celebration message animada
- Resumo de validação (% checklist, tempo vs TE)
- Campo de pergunta aberta ("Houve impedimentos?")
- Sugestões de próximos passos do LLM
- Botões: "Fechar", "Confirmar conclusão + feedback"

**Props:**
- `isOpen`: Visibilidade do modal
- `task`: Tarefa sendo concluída


## Styling & Theming

### CSS Variables
- `--kanban-tint`: Cor de fundo por status (primária, warning, info, success)
- `--sheet-x`, `--sheet-y`, `--sheet-r`: Transformações dos pergaminhos
- `--sheet-hover-x`, `--sheet-hover-y`: Estados ao hover

### Responsive Breakpoints
- **Desktop (> 768px):** 3 colunas Kanban, todas as features visíveis
- **Tablet (480px - 768px):** 2 colunas Kanban, ZoomedContent adaptado
- **Mobile (< 480px):** 1 coluna com scroll, peek labels ocultos

## Integration Points

### Backend Endpoints (Sprint 6)
- `POST /tasks/:id/check-deviation` → DeviationWarningAlert
- `GET /tasks/:id/validation-errors` → ValidationErrorBanner
- `GET /alerts` → useAlertsStore
- `PATCH /alerts/:id/read` → AlertsPanel

### Frontend Stores
- `useTaskStore()`: `setTaskStatus`, `moveTaskToStatus`, `getValidationErrors`
- `useAlertsStore()`: `loadAlerts`, `markRead`, `unreadCount`

## Performance Optimizations

1. **Backend:**
   - Index hint em `listAlerts` (userId + isRead + createdAt)
   - Lazy-loading de alerts com `limit: 50`

2. **Frontend:**
   - Computed properties memoizadas em Kanban (tasksByStatus, visibleTasks)
   - Silent fail em DeviationWarningAlert (não bloqueia UI)
   - Transições CSS aceleradas por GPU


## Testing Guidelines

### Unit Tests
```bash
npm run test -- DeviationWarningAlert.spec.ts
npm run test -- ValidationErrorBanner.spec.ts
npm run test -- tasks.service.sprint6.spec.ts
```

### E2E Tests
```bash
npm run test:e2e -- sprint6-validation.e2e-spec.ts
npm run test:e2e -- sprint6-deviation.e2e-spec.ts
```

## Future Enhancements (Phase 3+)

1. **Real-time Alerts** via WebSocket
2. **Alert Preferences** (mute, frequency, delivery method)
3. **Context-aware Recommendations** via LLM fine-tuning
4. **Mobile Push Notifications** para alertas críticos
5. **Analytics Dashboard** de desvios + padrões

---

**Last Updated:** May 11, 2026  
**Author:** GitHub Copilot  
**Sprint:** Sprint 6 - Alertas + Validação + Polimento
