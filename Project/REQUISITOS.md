# 📋 Acompanhamento de Requisitos - Second Brain

> **Última atualização:** 20/02/2026  
> **Status do Projeto:** MVP + Planejamento das Fases (Eficiência → 7)

---

## 📊 Resumo do Progresso

| Fase | Total | Prototipado | Frontend | Backend | QA | Progresso |
|------|-------|-------------|----------|---------|-----|-----------|
| MVP | 14 | 14/14 ✅ | 14/14 ✅ | 14/14 ✅ | 14/14 ✅ | 🟢 100% |
| Eficiência | 28 | 9/28 | 9/28 | 9/28 | 9/28 | ⬜ 32% |
| Micro-Tarefas | 18 | 0/18 | 0/18 | 0/18 | 0/18 | ⬜ 0% |
| Fase 2 | 18 | 0/18 | 0/18 | 0/18 | 0/18 | ⬜ 0% |
| Fase 3 | 25 | 0/25 | 0/25 | 0/25 | 0/25 | ⬜ 0% |
| Fase 4 | 18 | 0/18 | 0/18 | 0/18 | 0/18 | ⬜ 0% |
| Fase 5 | 16 | 0/16 | 0/16 | 0/16 | 0/16 | ⬜ 0% |
| Fase 6 | 22 | 0/22 | 0/22 | 0/22 | 0/22 | ⬜ 0% |
| Fase 7 | 8 | 0/8 | 0/8 | 0/8 | 0/8 | ⬜ 0% |


---

## 🚀 MVP - Funcionalidades Essenciais

### Gestão de Tarefas

| # | Requisito | Tipo | Protótipo | Frontend | Backend | QA |
|---|-----------|------|:---------:|:--------:|:-------:|:--:|
| 1 | Criar tarefas com nome, descrição, prazo, prioridade e dificuldade | Funcional | ✅ | ✅ | ✅ | ✅ |
| 2 | Visualizar tarefas | Funcional | ✅ | ✅ | ✅ | ✅ |
| 3 | Atualizar tarefas | Funcional | ✅ | ✅ | ✅ | ✅ |
| 4 | Excluir tarefas | Funcional | ✅ | ✅ | ✅ | ✅ |
| 5 | Marcar tarefas como concluídas | Funcional | ✅ | ✅ | ✅ | ✅ |

### Gestão de Projetos

| # | Requisito | Tipo | Protótipo | Frontend | Backend | QA |
|---|-----------|------|:---------:|:--------:|:-------:|:--:|
| 6 | Criar projetos com nome e descrição | Funcional | ✅ | ✅ | ✅ | ✅ |
| 7 | Associar tarefas a projetos | Funcional | ✅ | ✅ | ✅ | ✅ |
| 8 | Visualizar detalhes de um projeto e suas tarefas | Funcional | ✅ | ✅ | ✅ | ✅ |
| 9 | Editar projetos | Funcional | ✅ | ✅ | ✅ | ✅ |
| 10 | Excluir projetos com opção de manter ou excluir tarefas | Funcional | ✅ | ✅ | ✅ | ✅ |

### Integração com IA

| # | Requisito | Tipo | Protótipo | Frontend | Backend | QA |
|---|-----------|------|:---------:|:--------:|:-------:|:--:|
| 11 | Gerar automaticamente tarefas para um projeto com auxílio de IA | Funcional | ✅ | ✅ | ✅ | ✅ |
| 12 | Visualizar sugestões de tarefas geradas pela IA antes de confirmar | Funcional | ✅ | ✅ | ✅ | ✅ |
| 13 | Editar sugestões de tarefas geradas pela IA | Funcional | ✅ | ✅ | ✅ | ✅ |
| 14 | Confirmar ou descartar sugestões de tarefas geradas pela IA | Funcional | ✅ | ✅ | ✅ | ✅ |

### Requisitos Não Funcionais

| # | Requisito | Tipo | Protótipo | Frontend | Backend | QA |
|---|-----------|------|:---------:|:--------:|:-------:|:--:|
| 15 | Interface responsiva | Não Funcional | ✅ | ✅ | ✅ | ✅ |

---

## ⚡ Eficiência - Integração de LLM na Definição e Gestão de Projetos

### Definição e Clarificação de Projetos (Catchball via Chat)

| # | Requisito | Tipo | Protótipo | Frontend | Backend | QA |
|---|-----------|------|:---------:|:--------:|:-------:|:--:|
| 1 | Chat interativo de Catchball para refinar objetivos do projeto | Funcional | ✅ | ✅ | ✅ | ✅ |
| 2 | LLM deve fazer perguntas estratégicas para validar clareza do projeto | Funcional | ✅ | ✅ | ✅ | ✅ |
| 3 | Geração automática de Objetivos SMART baseado no conversa | Funcional | ✅ | ✅ | ✅ | ✅ |
| 4 | Exibição estruturada de SMART (Específico, Mensurável, Atingível, Realista, Temporal) | Funcional | ✅ | ✅ | ✅ | ✅ |

### Estrutura Analítica do Projeto (WBS/EAP)

| # | Requisito | Tipo | Protótipo | Frontend | Backend | QA |
|---|-----------|------|:---------:|:--------:|:-------:|:--:|
| 5 | Geração automática de WBS (Estrutura Analítica do Projeto) via LLM | Funcional | ✅ | ✅ | ✅ | ✅ |
| 6 | Visualização hierárquica da WBS (tree view com expansão/colapso) | Funcional | ✅ | ✅ | ✅ | ✅ |
| 7 | Aplicação da Regra dos 8/80 - validar que pacotes tenham entre 8-80 horas | Funcional | ✅ | ✅ | ✅ | ✅ |
| 8 | Sugestão de decomposição quando pacote viola a regra 8/80 | Funcional | ✅ | ✅ | ✅ | ✅ |
| 9 | Conversão automática de WBS em tarefas (criar tarefas a partir da WBS) | Funcional | ✅ | ✅ | ✅ | ✅ |

### Estimativa e Planejamento de Prazos (PERT/CPM)

| # | Requisito | Tipo | Protótipo | Frontend | Backend | QA |
|---|-----------|------|:---------:|:--------:|:-------:|:--:|
| 10 | Captura de três estimativas (Otimista, Provável, Pessimista) para cada tarefa | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 11 | Cálculo automático de TE (Tempo Esperado) usando fórmula PERT: TE = (O + 4M + P) / 6 | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 12 | Identificação automática de dependências lógicas entre tarefas via LLM | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 13 | Cálculo do Caminho Crítico (CPM) - sequência de tarefas sem folga | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 14 | Alertar usuário sobre tarefas no Caminho Crítico (urgência máxima) | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |

### Gestão de Incerteza (Critical Chain e Buffers)

| # | Requisito | Tipo | Protótipo | Frontend | Backend | QA |
|---|-----------|------|:---------:|:--------:|:-------:|:--:|
| 15 | Implementar estratégia de Critical Chain - consolidar buffers no fim do projeto | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 16 | Calcular automaticamente Buffer do Projeto baseado em variância das estimativas | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 17 | Dashboard de consumo de buffer do projeto (quanto foi gasto vs. disponível) | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |

### Rastreabilidade de Requisitos (RTM)

| # | Requisito | Tipo | Protótipo | Frontend | Backend | QA |
|---|-----------|------|:---------:|:--------:|:-------:|:--:|
| 18 | Geração automática de Matriz de Rastreabilidade de Requisitos (RTM) via LLM | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 19 | Visualização de RTM ligando requisitos de negócio → entrega específica | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |

### Planejamento em Ondas Sucessivas e Gestão de Riscos

| # | Requisito | Tipo | Protótipo | Frontend | Backend | QA |
|---|-----------|------|:---------:|:--------:|:-------:|:--:|
| 20 | Implementar Rolling Wave Planning - planejar próximas semanas em detalhe, futuro distante em marcos | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 21 | LLM escaneia descrição e sugere riscos potenciais baseado em histórico/lógica comum | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 22 | Plano de mitigação de riscos: evitar, mitigar, transferir ou aceitar para aprovação | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |

### Análise de Valor Agregado (EVM) e Dashboards

| # | Requisito | Tipo | Protótipo | Frontend | Backend | QA |
|---|-----------|------|:---------:|:--------:|:-------:|:--:|
| 23 | Cálculo automático de índices de desempenho (CPI, SPI) quando usuário inputa progresso | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 24 | Previsão de custo final: "Se continuar nesse ritmo, projeto custará X% a mais" | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 25 | Dashboard de EVM com curvas em "S" de Valor Planejado vs. Valor Agregado | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |

### Visualizações Avançadas

| # | Requisito | Tipo | Protótipo | Frontend | Backend | QA |
|---|-----------|------|:---------:|:--------:|:-------:|:--:|
| 26 | Gráfico de Gantt interativo - mostrar timeline, duração das tarefas e dependências | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 27 | Diagrama de Rede (PERT/CPM) - visualizar lógica de conexão entre tarefas | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 28 | X-Matrix (Hoshin Kanri) - conectar objetivos de longo prazo com metas anuais e tarefas táticas | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |

---

## ⚙️ Micro-Tarefas - Gerenciamento de Tarefas de Curta Duração (≤3h)

> **Objetivo:** Integrar LLM para garantir excelência operacional, rastreabilidade e eficiência em tarefas de curta duração, evitando erros humanos e "gold plating", aplicando técnicas de qualidade, PERT adaptado, RTM simplificada e feedback contínuo.

### Gold Standard Checklists

| # | Requisito | Tipo | Protótipo | Frontend | Backend | QA |
|---|-----------|------|:---------:|:--------:|:-------:|:--:|
| 1 | Geração automática de checklist padrão ouro via LLM ao criar micro-tarefa | Funcional | ✅ | ⬜ | ✅ | ⬜ |
| 2 | Checklist deve conter passos críticos, critérios de sucesso e validações baseados em histórico/padrões | Funcional | ✅ | ⬜ | ✅ | ⬜ |
| 3 | Visualizar e editar checklist antes de iniciar tarefa | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 4 | Marcar itens do checklist como concluído durante execução da tarefa | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 5 | Validação obrigatória de checklist antes de marcar tarefa como concluída | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |

### Estimativa PERT em Micro-Escala

| # | Requisito | Tipo | Protótipo | Frontend | Backend | QA |
|---|-----------|------|:---------:|:--------:|:-------:|:--:|
| 6 | Captura de três estimativas em minutos: Otimista, Provável e Pessimista para micro-tarefas | Funcional | ✅ | ⬜ | ✅ | ⬜ |
| 7 | Cálculo automático de TE (Tempo Esperado) em minutos usando fórmula PERT: TE = (O + 4M + P) / 6 | Funcional | ✅ | ⬜ | ✅ | ⬜ |
| 8 | Exibir deadline realista baseado em TE calculado | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 9 | Sugestão automática pelo LLM de estimativas realistas para tipos comuns de tarefas | Funcional | ⬜ | ⬜ | ✅ | ⬜ |

### Rastreabilidade e Linhagem Visual (RTM Simplificada)

| # | Requisito | Tipo | Protótipo | Frontend | Backend | QA |
|---|-----------|------|:---------:|:--------:|:-------:|:--:|
| 10 | Vincular visualmente cada micro-tarefa ao seu "Requisito Pai" ou "Objetivo Estratégico" | Funcional | ⬜ | ⬜ | ✅ | ⬜ |
| 11 | Visualização de linhagem: ao clicar na tarefa, mostrar a cadeia de rastreabilidade até o objetivo | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 12 | Rastreabilidade bidirecional: alertar sobre impactos "rio abaixo" ao deletar ou adiar tarefa | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 13 | Indicador visual de valor agregado: mostrar quanto cada micro-tarefa contribui para o objetivo maior | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |

### Kanban Pessoal com Catchball Visual

| # | Requisito | Tipo | Protótipo | Frontend | Backend | QA |
|---|-----------|------|:---------:|:--------:|:-------:|:--:|
| 14 | Interface Kanban para fluxo diário de micro-tarefas (ToDo, Fazendo, Revisão, Concluído) | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 15 | Arrastar e soltar tarefas entre colunas do Kanban | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 16 | Ao mover tarefa para "Concluído", LLM actua como "receptor da bola" com feedback automático | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 17 | Feedback automático: LLM valida checklist, pergunta sobre impedimentos e sugere melhorias (PDCA) | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |

### Alertas de Micro-Desvios (EVM Preditivo)

| # | Requisito | Tipo | Protótipo | Frontend | Backend | QA |
|---|-----------|------|:---------:|:--------:|:-------:|:--:|
| 18 | Detectar anomalias: alerta quando tempo gasto exceder TE (Tempo Esperado) em 25% | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |

---

## 🔄 Fase 2 - Produtividade Avançada

> **Objetivo:** Reduzir fricção e aumentar consistência no dia a dia, transformando backlog → plano executável. A fase foca em **planejamento visual**, **captura rápida**, **busca/organização**, **priorização assistida** e **foco**, mantendo a criação e execução de tarefas rápidas e previsíveis.

### Planejamento Visual (Calendário/Agenda)

| # | Requisito | Tipo | Protótipo | Frontend | Backend | QA |
|---|-----------|------|:---------:|:--------:|:-------:|:--:|
| 1 | Visualizar tarefas com prazo em formato de calendário (mês/semana/dia) | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 2 | Reagendar prazo diretamente no calendário (drag & drop ou edição rápida) | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 3 | Visualizar “Hoje” e “Próximos 7 dias” como lista/agenda para execução rápida | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |

### Captura Rápida e Templates (Velocidade)

| # | Requisito | Tipo | Protótipo | Frontend | Backend | QA |
|---|-----------|------|:---------:|:--------:|:-------:|:--:|
| 4 | Criar tarefa em 1 linha (Quick Add) com preenchimento automático de campos padrão | Não Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 5 | Interpretar texto do Quick Add (ex.: data “amanhã”, prioridade “alta”) e sugerir valores | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 6 | Templates de tarefas/projetos (campos e subtarefas padrão) para repetir rotinas | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |

### Busca, Filtros e Organização

| # | Requisito | Tipo | Protótipo | Frontend | Backend | QA |
|---|-----------|------|:---------:|:--------:|:-------:|:--:|
| 7 | Busca full-text em tarefas e projetos (nome e descrição) | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 8 | Filtros e ordenação por prazo, prioridade, status, dificuldade e projeto | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 9 | “Visões salvas” (filtros favoritos) para rotinas (ex.: “Hoje”, “Esta semana”, “Backlog”) | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |

### Priorização e Planejamento Assistidos (Inteligência)

| # | Requisito | Tipo | Protótipo | Frontend | Backend | QA |
|---|-----------|------|:---------:|:--------:|:-------:|:--:|
| 10 | Gerar sugestão de “Top tarefas do dia” considerando prazos, urgência e esforço | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 11 | Identificar tarefas em risco (prazo próximo/atrasadas) e sugerir replanejamento | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 12 | Aplicar limite de WIP (trabalho em progresso) com alerta quando exceder o foco do dia | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |

### Foco e Execução

| # | Requisito | Tipo | Protótipo | Frontend | Backend | QA |
|---|-----------|------|:---------:|:--------:|:-------:|:--:|
| 13 | Pomodoro embutido com seleção de tarefa ativa e registro simples de sessões | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 14 | “Modo foco” (reduzir distrações na UI) durante sessão de execução | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |

### Notificações e Rotinas

| # | Requisito | Tipo | Protótipo | Frontend | Backend | QA |
|---|-----------|------|:---------:|:--------:|:-------:|:--:|
| 15 | Notificações para tarefas próximas do prazo (configurável) | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 16 | Detectar inatividade prolongada e sugerir retomada do foco (configurável) | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 17 | Rotina de revisão semanal: checklist de revisão (limpar backlog, reagendar, encerrar pendências) | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |

### Requisitos Não Funcionais

| # | Requisito | Tipo | Protótipo | Frontend | Backend | QA |
|---|-----------|------|:---------:|:--------:|:-------:|:--:|
| 18 | Compatibilidade com dispositivos móveis e desktop (layout e interações principais) | Não Funcional | ⬜ | ⬜ | ⬜ | ⬜ |

---

## 🎮 Fase 3 - Gamificação e Monitoramento

> **Objetivo:** Reforçar hábitos com um loop de feedback (sinais → interpretação → resposta), de forma **opt-in** e com **privacidade por padrão**. A fase combina **monitoramento (manual/automático)**, **classificação assistida por IA**, **recompensas** e **mecânicas suaves** para evitar frustração.

### Consentimento, Privacidade e Controle

| # | Requisito | Tipo | Protótipo | Frontend | Backend | QA |
|---|-----------|------|:---------:|:--------:|:-------:|:--:|
| 1 | Monitoramento de produtividade deve ser opt-in com consentimento explícito | Não Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 2 | Configurar intervalo de captura e permitir pausar/retomar monitoramento a qualquer momento | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 3 | Allowlist/Denylist de apps/sites para (não) monitorar e/ou (não) enviar para IA | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |

### Coleta de Sinais (Manual e Automática)

| # | Requisito | Tipo | Protótipo | Frontend | Backend | QA |
|---|-----------|------|:---------:|:--------:|:-------:|:--:|
| 4 | Script captura o título da janela ativa do SO periodicamente | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 5 | Modo check-in manual (sem captura automática): usuário marca “produtivo/neutro/distração” | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |

### Interpretação por IA (Classificação)

| # | Requisito | Tipo | Protótipo | Frontend | Backend | QA |
|---|-----------|------|:---------:|:--------:|:-------:|:--:|
| 6 | Consultar IA para determinar se o contexto atual é produtivo ou não (com texto sanitizado) | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 7 | Exibir classificação com confiança e justificativa curta (“por que foi distração?”) | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 8 | Permitir o usuário corrigir a classificação (feedback) para melhorar regras/modelo | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |

### Feedback em Tempo Real (Personagem/Estado)

| # | Requisito | Tipo | Protótipo | Frontend | Backend | QA |
|---|-----------|------|:---------:|:--------:|:-------:|:--:|
| 9 | Exibir um personagem que muda de estado conforme a produtividade | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 10 | Mostrar feedback leve (ex.: dica de retomada) ao detectar distração por um período contínuo | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |

### Regras de Penalidade (Sem Frustração)

| # | Requisito | Tipo | Protótipo | Frontend | Backend | QA |
|---|-----------|------|:---------:|:--------:|:-------:|:--:|
| 11 | Perda de recursos (HP) só após “período de graça” e com opção de desativar penalidades | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 12 | Garantir que recompensas/penalidades não frustrem o usuário (modo “Gentil” sem punições) | Não Funcional | ⬜ | ⬜ | ⬜ | ⬜ |

### Sistema de Recompensas

| # | Requisito | Tipo | Protótipo | Frontend | Backend | QA |
|---|-----------|------|:---------:|:--------:|:-------:|:--:|
| 13 | CRUD de Recompensas | Gamificação | ⬜ | ⬜ | ⬜ | ⬜ |
| 14 | Loja para trocar moedas por recompensas | Gamificação | ⬜ | ⬜ | ⬜ | ⬜ |
| 15 | Sistema de conquistas | Gamificação | ⬜ | ⬜ | ⬜ | ⬜ |
| 16 | Avatar que evolui com XP | Gamificação | ⬜ | ⬜ | ⬜ | ⬜ |
| 17 | Missões diárias/semanais e streaks (sem obrigatoriedade) | Gamificação | ⬜ | ⬜ | ⬜ | ⬜ |
| 18 | Sortear recompensas aleatórias especiais após conclusão surpresa | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |

### Usuário e UX

| # | Requisito | Tipo | Protótipo | Frontend | Backend | QA |
|---|-----------|------|:---------:|:--------:|:-------:|:--:|
| 19 | Login de Usuário (opcional, para sincronização multi-dispositivo e backup) | Não Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 20 | Sugerir execução de tarefas difíceis por 5 min para superar bloqueios (gatilho: baixa produtividade/distração) | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |

### Gestão da Frustração (Mecânica Roguelike para Falhas)

| # | Requisito | Tipo | Protótipo | Frontend | Backend | QA |
|---|-----------|------|:---------:|:--------:|:-------:|:--:|
| 21 | Implementar “Permadeath de Ciclo”: se um sprint/projeto falhar criticamente, encerrar a instância e iniciar um novo ciclo | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 22 | Gerar Relatório de “Legado” ao Game Over (o que foi feito, decisões, causas de falha, aprendizados) | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 23 | Preservar agência na falha: manter XP/recursos (“loot”) e bônus acumulados para o próximo ciclo (configurável/opt-in) | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |

### Loot Drops de Conhecimento (Intermediate Packets)

| # | Requisito | Tipo | Protótipo | Frontend | Backend | QA |
|---|-----------|------|:---------:|:--------:|:-------:|:--:|
| 24 | Ao concluir etapa complexa, gerar “Loot Drop” (item clicável) contendo resumo, template ou pacote intermediário reutilizável | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 25 | Inventário/Biblioteca de Loot: listar, buscar e “equipar” itens para acelerar tarefas futuras (inclui tags e reutilização) | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |

---

## 🧩 Fase 4 - Arquitetura Cognitiva e Psicologia Comportamental

> **Objetivo:** Estruturar o app para respeitar limites cognitivos e reforçar motivação sustentável (competência, autonomia), engajamento saudável (Zeigarnik/Hook) e foco (Flow) — reduzindo fadiga mental e aumentando consistência.

### Gerenciamento de Atenção e Capacidade Mental (Teoria da Carga Cognitiva)

| # | Requisito | Tipo | Protótipo | Frontend | Backend | QA |
|---|-----------|------|:---------:|:--------:|:-------:|:--:|
| 1 | Limitar a quantidade de itens simultâneos na tela (padrão: 7±2) e priorizar exibição do “próximo passo” | Não Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 2 | Aplicar *Chunking* automaticamente em projetos grandes: agrupar tarefas em sub-etapas e usar disclosure progressivo | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 3 | “Modo execução” minimalista (livre de distrações) para uma tarefa ativa, com foco no essencial | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 4 | Reduzir “atenção dividida”: evitar que o usuário precise alternar entre áreas distantes para entender/agir em uma tarefa | Não Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 5 | Remover redundâncias e fricções: textos objetivos, campos consistentes e ações principais sempre no mesmo local | Não Funcional | ⬜ | ⬜ | ⬜ | ⬜ |

### Motivação Sustentável (Teoria da Autodeterminação - Competência/Autonomia)

| # | Requisito | Tipo | Protótipo | Frontend | Backend | QA |
|---|-----------|------|:---------:|:--------:|:-------:|:--:|
| 6 | Feedback imediato e positivo ao concluir tarefas (micro-celebração visual/sonora opcional) | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 7 | Mostrar progresso de forma significativa (ex.: consistência semanal, tarefas finalizadas, projetos avançando) | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 8 | Autonomia: permitir personalização do fluxo (habilitar/desabilitar módulos, escolher visualizações padrão) | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 9 | Evitar controle externo: recomendações/alertas devem ser ajustáveis e sempre passíveis de ignorar/adiar | Não Funcional | ⬜ | ⬜ | ⬜ | ⬜ |

### Engajamento e Retenção Saudáveis (Hook Model, Zeigarnik, Investimento)

| # | Requisito | Tipo | Protótipo | Frontend | Backend | QA |
|---|-----------|------|:---------:|:--------:|:-------:|:--:|
| 10 | “Missões Ativas”: tarefas em andamento devem permanecer visíveis até resolução, com status claro | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 11 | Aplicar o Efeito Zeigarnik de forma útil: destacar pendências iniciadas/interrompidas e sugerir fechamento | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 12 | Recompensa variável ao concluir tarefas (magnitude/celebração/pontos) com opção de desativar | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 13 | “Valor armazenado”: diário/histórico visual do que foi feito (linha do tempo, vitórias e aprendizados) | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 14 | O app deve ficar mais útil com o uso: preferências e padrões aprendidos (com transparência e controle do usuário) | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |

### Foco e Produtividade (Teoria do Flow)

| # | Requisito | Tipo | Protótipo | Frontend | Backend | QA |
|---|-----------|------|:---------:|:--------:|:-------:|:--:|
| 15 | Detectar tarefas “ansiosas” (muito difíceis/grandes) e sugerir decomposição em passos menores com metas claras | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 16 | Detectar tarefas “entediantes” (muito triviais) e sugerir agrupamento/batch ou micro-recompensas | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 17 | Metas claras e feedback rápido: cada tarefa pode ter critérios de sucesso visíveis durante a execução | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 18 | Sessões de foco guiadas: escolher 1 tarefa por vez, confirmar intenção e registrar conclusão/impedimentos | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |

---

## 🧠 Fase 5 - Deep Work e Narrativa

### Ferramentas de Foco

| # | Requisito | Tipo | Protótipo | Frontend | Backend | QA |
|---|-----------|------|:---------:|:--------:|:-------:|:--:|
| 1 | Ferramenta de "foco visual" pré-sessão (30-60s) | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 2 | Campo para anotar pensamentos intrusivos durante sessão | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 3 | "Placar de Deep Work" com alerta ao atingir 4h/dia | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 4 | Bloquear redes sociais durante intervalos | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 5 | Instruções para expandir campo visual nas pausas | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |

### Monitoramento Biométrico

| # | Requisito | Tipo | Protótipo | Frontend | Backend | QA |
|---|-----------|------|:---------:|:--------:|:-------:|:--:|
| 6 | Webcam (Pupilometria/Olhar) + Smartwatch (VFC/Sono) | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 7 | Algoritmo de Carga Cognitiva (Custo de Troca + Tempo) | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |

### Narrativa Medieval (Agentes Narrativos)

| # | Requisito | Tipo | Protótipo | Frontend | Backend | QA |
|---|-----------|------|:---------:|:--------:|:-------:|:--:|
| 8 | Reescrever título da tarefa para contexto medieval via IA | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 9 | Barra de progresso em 4 atos: Chamado, Provações, Transformação, Resultado | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 10 | Tarefas críticas como "Chefes de Fase" que bloqueiam progresso | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 11 | Tela da guilda com elementos visuais dinâmicos | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 12 | "Diário de aventuras" visual das missões completadas | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 13 | Streak de dias consecutivos com recompensas exponenciais | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 14 | Escolha narrativa ao concluir projeto grande | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 15 | NPC "Bardo" que escreve crônica semanal baseada nas tarefas | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 16 | Progresso visual (Landmark) ao invés de barra de porcentagem | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |

---

## 🧠 Fase 6 - IA Autônoma, Memória Semântica e Guardião do OS

> **Objetivo:** Evoluir o SecondBrain de “app com IA” para um **sistema agentivo** com memória (RAG) e automação segura, capaz de planejar, lembrar contexto, adaptar-se ao usuário e intervir contra distrações — com controle, privacidade e *feature flags*.

### O “Cérebro”: Agentes Autônomos de Planejamento (Agentic Workflows)

| # | Requisito | Tipo | Protótipo | Frontend | Backend | QA |
|---|-----------|------|:---------:|:--------:|:-------:|:--:|
| 1 | Implementar agente de planejamento com padrão ReAct (Reason + Act) chamando funções do backend | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 2 | Rotina de planejamento noturno assíncrona (cron `@nestjs/schedule` → job em fila → worker) | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 3 | Usar fila/worker (BullMQ/Redis ou RabbitMQ) com retries, backoff e *dead-letter* para falhas | Não Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 4 | Function calling em modo estrito JSON (schema validado) com rejeição automática de respostas inválidas | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 5 | Guardrails: limitar plano a no máximo 3 tarefas foco por dia e exigir justificativa/energia estimada | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 6 | Execução idempotente: worker deve poder reprocessar jobs sem duplicar inserts/updates | Não Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 7 | Auditoria e transparência: registrar “o que o agente fez” (decisões, alterações e diffs) e permitir desfazer | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |

### A “Alma”: Memória Semântica e RAG (Hybrid Search)

| # | Requisito | Tipo | Protótipo | Frontend | Backend | QA |
|---|-----------|------|:---------:|:--------:|:-------:|:--:|
| 8 | Gerar embeddings ao salvar anotações e ao concluir tarefas (via fila para não bloquear requisições) | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 9 | Armazenar embeddings e metadados no MongoDB Atlas Vector Search (documento transacional + vetor) | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 10 | Implementar busca híbrida (vetorial k-NN + keyword/BM25 + filtros por metadata) | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 11 | Pipeline RAG: recuperar contexto relevante e injetar no prompt do LLM antes de responder | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 12 | Política de “perda no meio”: limitar e ranquear trechos, priorizando recentes e de alta relevância | Não Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 13 | Versionamento de embeddings: reindexar quando modelo/scheme mudar e permitir *backfill* controlado | Não Funcional | ⬜ | ⬜ | ⬜ | ⬜ |

### RLHF Pessoal: “Game Master” Adaptativo (Personalização por Recompensa)

| # | Requisito | Tipo | Protótipo | Frontend | Backend | QA |
|---|-----------|------|:---------:|:--------:|:-------:|:--:|
| 14 | Coletar sinais de experiência (Estado, Ação, Recompensa, Próximo Estado) a partir de ações do usuário | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 15 | Microserviço Python (FastAPI) para treinar/servir política (ex.: PPO/RLlib) consumindo eventos do NestJS | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 16 | Função de recompensa configurável (ex.: concluir no dia, adiar, ignorar notificação) com *feature flags* | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 17 | Segurança operacional: modo “somente sugestão”, rollback de modelo e métricas de regressão/engajamento | Não Funcional | ⬜ | ⬜ | ⬜ | ⬜ |

### “Implementation Intentions” Agent: Guardião do OS (Cliente Desktop)

| # | Requisito | Tipo | Protótipo | Frontend | Backend | QA |
|---|-----------|------|:---------:|:--------:|:-------:|:--:|
| 18 | Extrair regras “Se-Então” via chat (trigger + ação) e salvar em schema estruturado no backend | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 19 | Cliente desktop (Tauri) sincroniza regras ativas e roda daemon leve em background | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 20 | Active Window Polling (ex.: 1s): detectar processo/título e aplicar regex para match de distração | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 21 | Intervenção configurável: trazer app ao foco/tela cheia e renderizar a intenção (“Ler 1 página…”) com opção de bypass | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 22 | Modo seguro: permitir pausar/whitelist e registrar logs locais sem enviar dados sensíveis por padrão | Não Funcional | ⬜ | ⬜ | ⬜ | ⬜ |

---

## 🏰 Fase 7 - Polimento e Segurança

### Usabilidade

| # | Requisito | Tipo | Protótipo | Frontend | Backend | QA |
|---|-----------|------|:---------:|:--------:|:-------:|:--:|
| 1 | Tema dark/light | Usabilidade | ⬜ | ⬜ | ⬜ | ⬜ |
| 2 | Interface com mapa ou cidade interativa | Usabilidade | ⬜ | ⬜ | ⬜ | ⬜ |
| 3 | Gráficos e estatísticas de progresso | Usabilidade | ⬜ | ⬜ | ⬜ | ⬜ |
| 4 | Feedback visual/auditivo imediato após ações importantes | Não Funcional | ⬜ | ⬜ | ⬜ | ⬜ |

### Qualidade de Código

| # | Requisito | Tipo | Protótipo | Frontend | Backend | QA |
|---|-----------|------|:---------:|:--------:|:-------:|:--:|
| 5 | Código-fonte organizado e documentado | Não Funcional | ⬜ | ⬜ | ⬜ | ⬜ |

### Segurança

| # | Requisito | Tipo | Protótipo | Frontend | Backend | QA |
|---|-----------|------|:---------:|:--------:|:-------:|:--:|
| 6 | Backup e recuperação de dados | Não Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 7 | Proteção contra acessos não autorizados | Não Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 8 | Segurança contra XSS, SQL Injection, etc. | Não Funcional | ⬜ | ⬜ | ⬜ | ⬜ |


---

## 📝 Legenda

| Símbolo | Significado |
|---------|-------------|
| ✅ | Concluído |
| ⬜ | Pendente |
| 🔄 | Em andamento |
| ❌ | Bloqueado/Problema |
| ⏳ | Aguardando dependência |

---

## 📅 Histórico de Atualizações

| Data | Descrição |
|------|-----------|
| 28/01/2026 | Documento criado com status atual do MVP |
| - | - |

---

## 🔗 Links Úteis

- [Documentação da API (Swagger)](http://localhost:3000/api)
- [Repositório do Projeto](link-do-repositorio)
- [Board de Tarefas](link-do-board)
