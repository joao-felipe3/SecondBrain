# ADR-005: Motores de Visualização Gráfica e Diagramas de Rede (ECharts, Cytoscape & Dagre)

## Contexto

O **SecondBrain** combina metodologias avançadas de gestão de projetos (PERT/CPM, Gantt, EVM e X-Matrix/Catchball). Para que essas metodologias agreguem valor prático, a interface precisa exibir gráficos interativos, cronogramas temporais e diagramas de rede de dependências com alto desempenho e visualização fluida.

Desafios:

- O diagrama de dependências PERT exige layout automático em grafo direcionado acíclico (DAG) para destacar o **Caminho Crítico**.
- O Gráfico de Gantt necessita de agrupamento por fases da WBS, marcos de início/fim e indicação de folga (_float/slack_).
- O carregamento de gráficos não pode bloquear a UI (Main Thread) nem comprometer a responsividade da interface RPG.

## Decisão

Adotar uma abordagem híbrida com bibliotecas especializadas:

1. **ECharts (`vue-echarts`)**: Para renderização de gráficos temporais (Gantt), curvas em S (Curva S de EVM) e métricas de acompanhamento de valor.
2. **Cytoscape.js + `cytoscape-dagre`**: Para renderização interativa e layout em grafo hierárquico dos diagramas de rede PERT/CPM com destaque visual para o Caminho Crítico.
3. **Cálculo Desacoplado no Backend**: O backend calcula as posições de dependência, folgas e caminho crítico antes de enviar a estrutura de nós e arestas para a camada de visualização.

## Drivers (por que essa escolha atende aos requisitos)

- **Layout Automático de Grafos (Dagre)**: O Dagre calcula as coordenadas `(x, y)` dos nós do diagrama PERT minimizando o cruzamento de arestas (_edge crossings_).
- **Desempenho com Canvas/WebGL**: ECharts utiliza renderização por Canvas (com fallback SVG), garantindo 60 FPS ao renderizar cronogramas extensos.
- **Interatividade Nativa**: Capacidade de zoom, pan, destaque de predecessores no hover e clique nos nós do grafo para editar estimativas PERT.
- **Separação de Responsabilidades**: O backend mantém a matemática do algoritmo PERT/CPM (Early Start, Early Finish, Late Start, Late Finish, Total Float) e o frontend foca puramente no render e interação.

## Detalhes de Aplicação no SecondBrain

### 1. Diagrama PERT/CPM (Cytoscape + Dagre)

- As arestas que pertencem ao Caminho Crítico (`totalFloat === 0`) são estilizadas em **vermelho rúnico místico** (`#E53935`) com largura dobrada.
- Nós comuns são estilizados em pergaminho/madeira com os valores das estimativas (_Optimistic_, _Most Likely_, _Pessimistic_, _Expected Time_).

### 2. Cronograma de Gantt (ECharts Custom Series)

- Renderizado via `vue-echarts` com barras horizontais personalizadas para representar a duração de tarefas e fases da WBS.
- Suporta linhas de dependência entre tarefas predecessoras e sucessoras.

### 3. Matriz X-Matrix (ECharts / Heatmap & Matrix Grid)

- Matriz de alinhamento estratégico conectando metas macro, anuais e iniciativas táticas com matriz de correlação.

## Onde no código

- **Services Backend de Visualização**:
  - [Backend/src/projects/services/visualization/gantt.service.ts](../../Backend/src/projects/services/visualization/gantt.service.ts)
  - [Backend/src/projects/services/visualization/pert-diagram.service.ts](../../Backend/src/projects/services/visualization/pert-diagram.service.ts)
  - [Backend/src/projects/services/visualization/projects-x-matrix.service.ts](../../Backend/src/projects/services/visualization/projects-x-matrix.service.ts)
- **Componentes Frontend**:
  - Diagrama PERT: `Frontend/components/features/projects/visualization/PertDiagram.vue`
  - Gráfico de Gantt: `Frontend/components/features/projects/visualization/GanttChart.vue`
  - Visualização X-Matrix: `Frontend/components/features/projects/visualization/XMatrixSnapshot.vue`

## Consequências

### Positivas

- Visualização clara do Caminho Crítico e gargalos de tempo no projeto.
- Renderização limpa e de alta performance no browser sem travar a interface.
- Facilidade de exportação para PNG/SVG para relatórios.

### Negativas / Trade-offs

- Aumento no tamanho do bundle do frontend (necessidade de `transpile` no `nuxt.config.ts` para `echarts`, `vue-echarts` e `cytoscape`).
- Necessidade de recomputar os dados de layout ao redimensionar modais ou trocar a orientação da tela.

## Validação (Critérios de Aceite)

- Projetos com mais de 50 tarefas renderizam o diagrama PERT com layout Dagre em menos de 300ms.
- Nós do Caminho Crítico destacam-se visualmente das tarefas com folga de prazo.

## ADRs Relacionadas

- ADR-001: [001-why-nestjs-mongoose.md](001-why-nestjs-mongoose.md)
- ADR-002: [002-module-separation.md](002-module-separation.md)
- ADR-006: [006-diegetic-ui-architecture.md](006-diegetic-ui-architecture.md)
