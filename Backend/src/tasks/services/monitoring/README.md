# Tasks Monitoring Services

## Visão Geral

Este módulo é responsável por monitorar a saúde operacional das tarefas, gerando alertas de desvio de prazo, gargalos no caminho crítico e notificações proativas para o usuário.

## Serviços Principais

### `AlertsService` (`alerts.service.ts`)

- **Objetivo**: Gerenciar o ciclo de vida dos alertas operacionais de tarefas.
- **Funcionalidades**:
  - Listagem filtrada por usuário, projeto e status de leitura (`unreadOnly`).
  - Marcação de alertas como lidos (`markRead`).
  - Dica de índice Mongoose (`hint({ userId: 1, isRead: 1, createdAt: -1 })`) para alta performance de consulta.

## Métricas e Notificações

- Alertas acionados quando o desvio estimado PERT excede os limites de segurança da onda planejada.
- Notificações integradas com o sistema de alertas em tempo real.
