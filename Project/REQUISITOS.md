# 📋 Acompanhamento de Requisitos - Second Brain

> **Última atualização:** 03/02/2026  
> **Status do Projeto:** MVP + Planejamento da Fase Eficiência e Micro-Tarefas

---

## 📊 Resumo do Progresso

| Fase | Total | Prototipado | Frontend | Backend | QA | Progresso |
|------|-------|-------------|----------|---------|-----|-----------|
| MVP | 14 | 14/14 ✅ | 14/14 ✅ | 14/14 ✅ | 14/14 ✅ | 🟢 100% |
| Eficiência | 28 | 0/28 | 0/28 | 0/28 | 0/28 | ⬜ 0% |
| Micro-Tarefas | 18 | 0/18 | 0/18 | 0/18 | 0/18 | ⬜ 0% |
| Fase 2 | 12 | 0/12 | 0/12 | 0/12 | 0/12 | ⬜ 0% |
| Fase 3 | 12 | 0/12 | 0/12 | 0/12 | 0/12 | ⬜ 0% |
| Fase 4 | 16 | 0/16 | 0/16 | 0/16 | 0/16 | ⬜ 0% |
| Fase 5 | 8 | 0/8 | 0/8 | 0/8 | 0/8 | ⬜ 0% |

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
| 1 | Chat interativo de Catchball para refinar objetivos do projeto | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 2 | LLM deve fazer perguntas estratégicas para validar clareza do projeto | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 3 | Geração automática de Objetivos SMART baseado no conversa | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 4 | Exibição estruturada de SMART (Específico, Mensurável, Atingível, Realista, Temporal) | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |

### Estrutura Analítica do Projeto (WBS/EAP)

| # | Requisito | Tipo | Protótipo | Frontend | Backend | QA |
|---|-----------|------|:---------:|:--------:|:-------:|:--:|
| 5 | Geração automática de WBS (Estrutura Analítica do Projeto) via LLM | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 6 | Visualização hierárquica da WBS (tree view com expansão/colapso) | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 7 | Aplicação da Regra dos 8/80 - validar que pacotes tenham entre 8-80 horas | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 8 | Sugestão de decomposição quando pacote viola a regra 8/80 | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 9 | Conversão automática de WBS em tarefas (criar tarefas a partir da WBS) | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |

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
| 1 | Geração automática de checklist padrão ouro via LLM ao criar micro-tarefa | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 2 | Checklist deve conter passos críticos, critérios de sucesso e validações baseados em histórico/padrões | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 3 | Visualizar e editar checklist antes de iniciar tarefa | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 4 | Marcar itens do checklist como concluído durante execução da tarefa | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 5 | Validação obrigatória de checklist antes de marcar tarefa como concluída | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |

### Estimativa PERT em Micro-Escala

| # | Requisito | Tipo | Protótipo | Frontend | Backend | QA |
|---|-----------|------|:---------:|:--------:|:-------:|:--:|
| 6 | Captura de três estimativas em minutos: Otimista, Provável e Pessimista para micro-tarefas | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 7 | Cálculo automático de TE (Tempo Esperado) em minutos usando fórmula PERT: TE = (O + 4M + P) / 6 | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 8 | Exibir deadline realista baseado em TE calculado | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 9 | Sugestão automática pelo LLM de estimativas realistas para tipos comuns de tarefas | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |

### Rastreabilidade e Linhagem Visual (RTM Simplificada)

| # | Requisito | Tipo | Protótipo | Frontend | Backend | QA |
|---|-----------|------|:---------:|:--------:|:-------:|:--:|
| 10 | Vincular visualmente cada micro-tarefa ao seu "Requisito Pai" ou "Objetivo Estratégico" | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
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

### Organização Visual

| # | Requisito | Tipo | Protótipo | Frontend | Backend | QA |
|---|-----------|------|:---------:|:--------:|:-------:|:--:|
| 3 | Visualizar tarefas em formato de calendário | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |

### Busca e Inteligência

| # | Requisito | Tipo | Protótipo | Frontend | Backend | QA |
|---|-----------|------|:---------:|:--------:|:-------:|:--:|
| 4 | Busca e filtros inteligentes | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 5 | Sistema de prioridade inteligente | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |

### Foco e Notificações

| # | Requisito | Tipo | Protótipo | Frontend | Backend | QA |
|---|-----------|------|:---------:|:--------:|:-------:|:--:|
| 6 | Pomodoro embutido | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 7 | Enviar notificações para tarefas próximas do prazo | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 8 | Detectar inatividade prolongada e enviar notificações | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |

### Gamificação Básica

| # | Requisito | Tipo | Protótipo | Frontend | Backend | QA |
|---|-----------|------|:---------:|:--------:|:-------:|:--:|
| 9 | Sistema de XP/moedas por tarefa concluída | Gamificação | ⬜ | ⬜ | ⬜ | ⬜ |

### Requisitos Não Funcionais

| # | Requisito | Tipo | Protótipo | Frontend | Backend | QA |
|---|-----------|------|:---------:|:--------:|:-------:|:--:|
| 10 | A criação de tarefas deve ser rápida, com campos preenchidos automaticamente | Não Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 11 | Compatibilidade com dispositivos móveis e desktop | Não Funcional | ⬜ | ⬜ | ⬜ | ⬜ |

---

## 🎮 Fase 3 - Gamificação e Monitoramento

### Monitoramento de Produtividade

| # | Requisito | Tipo | Protótipo | Frontend | Backend | QA |
|---|-----------|------|:---------:|:--------:|:-------:|:--:|
| 1 | Um script captura o título da janela ativa do SO periodicamente | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 2 | Consultar IA para determinar se a janela ativa é produtiva ou não | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 3 | Exibir um personagem que muda de estado conforme a produtividade | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 4 | O usuário deve perder recursos (HP) caso persista em distração | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |

### Sistema de Recompensas

| # | Requisito | Tipo | Protótipo | Frontend | Backend | QA |
|---|-----------|------|:---------:|:--------:|:-------:|:--:|
| 5 | CRUD de Recompensas | Gamificação | ⬜ | ⬜ | ⬜ | ⬜ |
| 6 | Loja para trocar moedas por recompensas | Gamificação | ⬜ | ⬜ | ⬜ | ⬜ |
| 7 | Sistema de conquistas | Gamificação | ⬜ | ⬜ | ⬜ | ⬜ |
| 8 | Avatar que evolui com XP | Gamificação | ⬜ | ⬜ | ⬜ | ⬜ |
| 9 | Missões diárias/semanais | Gamificação | ⬜ | ⬜ | ⬜ | ⬜ |
| 10 | Sortear recompensas aleatórias especiais após conclusão surpresa | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |

### Usuário e UX

| # | Requisito | Tipo | Protótipo | Frontend | Backend | QA |
|---|-----------|------|:---------:|:--------:|:-------:|:--:|
| 11 | Login de Usuário | Não Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 12 | Sugerir execução de tarefas difíceis por 5 min para superar bloqueios | Funcional | ⬜ | ⬜ | ⬜ | ⬜ |
| 13 | Garantir que recompensas/penalidades não frustrem o usuário | Não Funcional | ⬜ | ⬜ | ⬜ | ⬜ |

---

## 🧠 Fase 4 - Deep Work e Narrativa

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

## 🏰 Fase 5 - Polimento e Segurança

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
