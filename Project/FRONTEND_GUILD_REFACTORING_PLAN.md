# Plano de Refatoração do Frontend: Interface Imersiva "Guilda de Aventureiros (RPG UI)"

**Data de Atualização:** 2026-07-28  
**Versão:** 3.0 (Checklist Exaustivo de Refatoração & Mapeamento de Dados para UI RPG)  
**Escopo:** Módulo Frontend Nuxt 3 (`/Frontend`)  
**Assets de Referência Visal:** 8 imagens em `Frontend/imagens-geradas/` (`Entrada-web`, `Entrada-mobile`, `tasks-web`, `tasks-mobile`, `projects-web`, `projects-mobile`, `calendar-web`, `calendar-mobile`)

---

## 1. Visão Geral e Filosofia de Design RPG Diegético

O objetivo principal desta refatoração é transformar a interface atual do **SecondBrain** em uma **Interface Diegética de RPG Medieval Fantástico ("Guilda de Aventureiros")**, alinhando o planejamento estratégico e operacional (SMART, WBS, PERT/CPM, EVM, X-Matrix) à estética imersiva apresentada nas 8 telas conceituais de `/Frontend/imagens-geradas/`.

### Princípios Arquiteturais Centrais:

1. **Diegese Fluida sem Latência (Zero Bloqueio):** Todos os elementos decorativos (tochas, velas, pregos, selos de cera, adagas) são organizados em uma estrutura de 3 camadas (_Depth Stacking_) para garantir 60 FPS nas animações e total legibilidade do conteúdo textual.
2. **Container Engine Baseado em HTML/CSS:** Substituição de SVGs rígidos com dimensões fixas (ex: `Paper.vue`, `BookShelf.vue`, `WoodenTable.vue`) por recipientes HTML/CSS flexíveis (`.diegetic-parchment`, `.diegetic-wooden-frame`, `.diegetic-grimoire`) com `box-shadow` interno, gradientes HSL e cantos orgânicos.
3. **Navegação Panorâmica por Salões (Camera Pan):** Sensação espacial de deslocamento pela Guilda:
   - **Saguão Central (`/`):** Recepção com lareira, balcão, grimório de registro e caminhos para as demais salas.
   - **Mural de Contratos (`/Task`):** Quadro rústico de madeira com missões afixadas em colunas rúnicas.
   - **Sala de Arquivos (`/projects`):** Biblioteca de carvalho com grimórios encadernados representando os projetos.
   - **Sala do Astrolábio / Observatório (`/calendar`):** Quadro de pergaminho 7x5 para planejamento temporal e prazos.
4. **Layout Adaptativo Mobile (Breakpoints < 960px):** Transição responsiva seamless dos backgrounds panorâmicos e layouts desktop para diários e estantes verticais adaptadas ao toque.

---

## FASE 1: Arquitetura e Clean Code (Visão Global)

### 1.1 Componentização Diegética (Atomic Design Diegético)

Criação de biblioteca de componentes de UI reutilizáveis em `components/ui/diegetic/` para representar objetos físicos do jogo:

| Componente Vue        | Descrição & Objeto Físico                      | Props & Eventos                                                                                 | Uso na Aplicação                                           |
| :-------------------- | :--------------------------------------------- | :---------------------------------------------------------------------------------------------- | :--------------------------------------------------------- |
| `UiParchmentCard.vue` | Papel pergaminho flexível envelhecido          | `variant` (contract/map/scroll), `elevated` (boolean), `expanded` (boolean)                     | Cards de tarefas no Kanban, modais e folhas de missões     |
| `UiWaxSeal.vue`       | Selo de cera com textura 3D e sombra em gota   | `color` ('red' \| 'blue' \| 'green' \| 'amber'), `icon` (string), `size` ('sm' \| 'md' \| 'lg') | Indicador de prioridade, status de tarefa ou projeto       |
| `UiIronDagger.vue`    | Adaga de ferro cravada no mural/mesa           | `rotation` (number), `interactive` (boolean), `click` (event)                                   | Fixador de contratos urgentes, atalho de ação rápida       |
| `UiIronNail.vue`      | Prego/percevejo rústico com reflexo metálico   | `color` ('gold' \| 'iron' \| 'bronze'), `position` ('top-left' \| etc.)                         | Cantoneiras e fixadores dos cards de pergaminho            |
| `UiWoodenFrame.vue`   | Moldura de madeira maciça com encaixes rúnicos | `columns` (number), `variant` ('board' \| 'shelf' \| 'calendar')                                | Estrutura container do Kanban, Estante e Calendário        |
| `UiRunicTile.vue`     | Placa de madeira/pedra gravada com runas       | `runicChar` (string), `label` (string), `active` (boolean)                                      | Cabeçalhos de colunas Kanban, dias da semana no Calendário |
| `UiHourglass.vue`     | Ampulheta mágica com areia animada             | `running` (boolean), `progress` (number 0-100)                                                  | Temporizador de Pomodoro e tarefas em andamento            |
| `UiRibbonMedal.vue`   | Medalha de fita e cera de vitória              | `rank` (string), `title` (string)                                                               | Indicador de tarefa concluída com sucesso                  |
| `UiGrimoireBook.vue`  | Livro de couro encadernado com fecho metálico  | `coverColor` (string), `emblem` (string), `title` (string), `spineText` (string)                | Representação visual de Projetos na Sala de Arquivos       |
| `UiIronPlate.vue`     | Placa/cantoneira metálica com rebites          | `position` ('corner-top-left' \| etc.), `variant` ('dark' \| 'bronze')                          | Reforço visual das molduras móbile e cabeçalhos            |

#### Checklist de Componentização Diegética:

- [ ] Criar a pasta `components/ui/diegetic/` para isolar os componentes físicos do mundo do jogo.
- [ ] Construir `UiParchmentCard.vue` utilizando HSL CSS puro e gradientes orgânicos, descartando dependências de SVGs estáticos.
- [ ] Construir `UiWaxSeal.vue` com suporte às variações de cores: Vermelho Sangue (`#8B0000` / Alta), Azul Místico (`#0077BE` / Média), Verde Musgo (`#2E8B57` / Concluída) e Âmbar Mágico (`#D4AF37` / Hábito).
- [ ] Construir `UiIronDagger.vue` e `UiIronNail.vue` utilizando `drop-shadow` CSS e assets vetoriais leves.
- [ ] Construir `UiWoodenFrame.vue` com sistema de grid flexível (`repeat(N, 1fr)`) e texturas de madeira rústica em CSS.
- [ ] Construir `UiRunicTile.vue` para estilizar os caracteres rúnicos das 3 colunas Kanban e dos 7 dias da semana no Calendário.
- [ ] Construir `UiHourglass.vue` para visualização e contagem de Pomodoro em tempo real.
- [ ] Construir `UiRibbonMedal.vue` para tarefas concluídas.
- [ ] Construir `UiGrimoireBook.vue` permitindo personalização de cor de capa, lombada e insígnia baseada nos metadados do projeto.
- [ ] Criar arquivo de exportação unificado em `components/ui/diegetic/index.ts`.

---

### 1.2 Responsividade Dinâmica e Breakpoints

Estratégia para alternância inteligente de layouts entre Desktop (Web) e Mobile baseando-se em breakpoints (`960px`):

```
                       ┌─────────────────────────┐
                       │  Viewport Width Check   │
                       └────────────┬────────────┘
                                    │
                  ┌─────────────────┴─────────────────┐
                  ▼                                   ▼
        [ Desktop (>= 960px) ]              [ Mobile (< 960px) ]
  • Background: *-web.png             • Background: *-mobile.png
  • Layout: Kanban 3 Colunas          • Layout: Diário com Abas Superiores
  • Estante: 3 Seções com Relação HZ  • Estante: Grade Vertical 3x5 Nichos
  • Calendário: Moldura Grande 7x5    • Calendário: Quadro Compacto + Bottom Drawer
```

#### Checklist de Responsividade Dinâmica:

- [ ] Centralizar a detecção de breakpoint no composable `composables/ui/useResponsive.ts` usando `@vueuse/core` (`useBreakpoints`).
- [ ] Definir o breakpoint `md: 960px` como o divisor oficial entre as visões Web (`*-web.png`) e Mobile (`*-mobile.png`).
- [ ] Implementar a alternância dinâmica de imagem de fundo no container global `<GuildEnvironment>` via CSS `background-image` responsivo ou `<picture>` HTML5.
- [ ] Criar o componente `FieldJournalMobile.vue` para encapsular o Kanban em formato de diário vertical com abas no mobile.
- [ ] Criar o componente `GrimoireGridMobile.vue` para organizar a estante de projetos em grade vertical scrollável 3x5.
- [ ] Criar o componente `CalendarDrawerMobile.vue` para exibir a lista de tarefas do dia selecionado em um bottom-sheet de pergaminho deslizável.
- [ ] Garantir suporte a gestos touch (`touchstart`, `touchend`, `@vueuse/gesture`) para navegação lateral por swipe entre as abas do mobile.

---

### 1.3 Tematização, Paleta HSL e Asset Management

Organização dos novos assets e criação do sistema central de tokens diegéticos baseados nas cores extraídas das imagens da guilda (Âmbar, Carvalho Escuro, Pedra Cinza, Cera Mística).

#### Estrutura de CSS & Tokens (`assets/css/tokens.css`):

```css
:root {
  /* --- PALETA DA GUILDA DE AVENTUREIROS --- */
  /* Madeiras Rústicas */
  --guild-wood-dark: hsl(
    20,
    45%,
    15%
  ); /* Carvalho Escuro das Molduras e Mesas */
  --guild-wood-mid: hsl(22, 40%, 25%); /* Vigas delimitadoras e Estantes */
  --guild-wood-light: hsl(24, 35%, 38%); /* Bordas iluminadas e entalhes */

  /* Pergaminhos e Papéis */
  --guild-parchment-base: hsl(38, 65%, 88%); /* Base do Papel de Contrato */
  --guild-parchment-dark: hsl(
    35,
    45%,
    78%
  ); /* Sombras e bordas queimadas do papel */
  --guild-parchment-ink: hsl(
    25,
    35%,
    15%
  ); /* Tinta escura de escrita legível */
  --guild-parchment-ink-muted: hsl(25, 20%, 35%);

  /* Pedras e Arcos de Arquitetura */
  --guild-stone-wall: hsl(210, 10%, 25%); /* Parede de Pedra do Castelo */
  --guild-stone-arch: hsl(210, 12%, 35%); /* Arcos dos Portais */

  /* Selos de Cera & Status */
  --guild-wax-red: hsl(0, 75%, 42%); /* Alta Prioridade / A Fazer */
  --guild-wax-blue: hsl(200, 85%, 40%); /* Em Andamento / Mágica */
  --guild-wax-green: hsl(145, 50%, 32%); /* Concluída / Sucesso */
  --guild-wax-amber: hsl(38, 85%, 45%); /* Hábitos / Ouro */

  /* Tipografia Diegética */
  --font-diegetic-title: "Cinzel", "MedievalSharp", Georgia, serif;
  --font-diegetic-body: "Inter", "Poppins", sans-serif;
  --font-diegetic-rune: "MedievalSharp", monospace;
}
```

#### Checklist de Tematização e Asset Management:

- [ ] Mover as 8 imagens de `Frontend/imagens-geradas/` para a pasta pública oficial `public/images/guild/`.
- [ ] Otimizar as imagens `.png` (gerando variações `.webp` comprimidas) mantendo alta qualidade de textura.
- [ ] Criar o arquivo `assets/css/tokens.css` com a especificação completa de variáveis HSL acima.
- [ ] Carregar as fontes do Google Fonts (`Cinzel`, `MedievalSharp`, `Inter`) via `nuxt.config.ts`.
- [ ] Criar a classe utilitária `.diegetic-glow-torch` em `assets/css/main.css` para aplicar pulsação radial de iluminação quente (`rgba(255, 160, 50, 0.25)`).
- [ ] Eliminar estilos CSS inline hardcoded nos componentes legados.

---

### 1.4 Gerenciamento de Estado (Pinia)

Adequação e expansão dos stores Pinia para suportar as necessidades da nova interface RPG:

```
┌────────────────────────────────────────────────────────────────────────┐
│                          Pinia Stores System                           │
├──────────────────────────┬──────────────────────┬──────────────────────┤
│       useTaskStore       │    useProjectStore   │    useUiGuildStore   │
├──────────────────────────┼──────────────────────┼──────────────────────┤
│ • tasks (Array<Task>)    │ • projects (Array)   │ • activeRoom (Room)  │
│ • getTasksByStatus()     │ • activeProject      │ • mobileTaskTab      │
│ • habitsDashboard        │ • projectColors      │ • cameraPanOffset    │
│ • setTaskStatus()        │ • loadTaskCounts()   │ • selectedDate       │
└──────────────────────────┴──────────────────────┴──────────────────────┘
```

#### Checklist de Gerenciamento de Estado (Pinia):

- [ ] Criar o novo store `stores/uiGuild.ts` para gerenciar o estado da interface diegética:
  - `activeRoom`: `'hall'` \| `'tasks'` \| `'projects'` \| `'calendar'`.
  - `mobileTaskTab`: `'todo'` \| `'doing'` \| `'done'`.
  - `selectedCalendarDate`: `Date` (dia ativo no Calendário).
  - `isGrimoireOpen`: `boolean` (estado do modal do livro de projeto).
  - `cameraPosition`: `{ x: number, y: number }` (deslocamento 3D do parallax).
- [ ] Atualizar `stores/task.ts`:
  - Garantir que `getTasksByStatus(status)` ordene tarefas mantendo o alinhamento com a coluna do Mural.
  - Adicionar getter `tasksByDate(date: Date)` para filtrar prazos no Calendário.
- [ ] Atualizar `stores/project.ts`:
  - Adicionar suporte a propriedades visuais estendidas por projeto (`leatherColor`, `emblemIcon`, `runicCategory`).

---

## FASE 2: Mapeamento de Dados para UI (Elemento por Elemento)

---

### Tela 1: Entrada / Saguão Central (`/`)

#### [Entrada - Web] Análise de Elementos e Comportamentos:

- **[UI Estática]:** Renderizar o fundo panorâmico do Saguão Central (`public/images/guild/Entrada-web.webp`). Ajustar container em `100vw x 100vh` sem scroll externo.
- **[Mapeamento de Dados & Hotspots - Portal Esquerdo]:** O arco de pedra à esquerda que conduz ao Mural de Contratos funciona como um hotspot clicável direcionando a rota para `/Task`.
- **[Mapeamento de Dados & Hotspots - Portal Direito]:** O arco de pedra à direita que conduz à Sala de Arquivos funciona como um hotspot clicável direcionando a rota para `/projects`.
- **[Mapeamento de Dados & Hotspots - Mesa de Recepção]:** O livro de registro sobre a mesa de madeira (`Grimório de Entrada`) renderiza os metadados agregados do usuário/guilda:
  - Total de contratos cumpridos (XP acumulado).
  - Quantidade de missões ativas em andamento.
  - Taxa de aderência a hábitos do dia.
- **[Mapeamento de Comportamento]:** Efeito de iluminação suave de tochas e lareira ao redor da recepção. Hover nos portais destaca o arco de pedra com um brilho dourado rúnico e exibe tooltip diegético ("Ir para o Mural de Contratos", "Ir para a Biblioteca de Arquivos"). Transição fluida de câmera (_Camera Pan_) ao clicar.

#### [Entrada - Mobile] Análise de Elementos e Comportamentos:

- **[UI Estática]:** Renderizar a versão vertical do Saguão Central (`public/images/guild/Entrada-mobile.webp`).
- **[Mapeamento de Dados & UI Adaptativa]:** Exibir um painel flutuante de atalhos em pergaminho na parte inferior da tela com 3 botões estilizados:
  - 📜 _Mural de Missões_ (`/Task`)
  - 📚 _Biblioteca de Projetos_ (`/projects`)
  - 🌌 _Observatório / Calendário_ (`/calendar`)
- **[Mapeamento de Comportamento]:** Suporte a toques rápidos nos botões do diário com feedback tátil/visual (animação de selo pressionado).

#### Checklist de Refatoração da Tela de Entrada:

- [ ] Substituir a página atual `pages/index.vue` (que contém apenas `<img src="/svg/sign.svg" />`) por um layout completo baseado no Saguão Central.
- [ ] Criar componente `components/features/hall/GuildReceptionDesk.vue` para renderizar o livro de registro e métricas da guilda.
- [ ] Criar hotspots interativos SVG/CSS sobre os arcos de pedra para navegação panorâmica.
- [ ] Adicionar suporte a tooltips diegéticos nos portais.
- [ ] Integrar a alternância inteligente para a imagem `Entrada-mobile.webp` em telas pequenas.

---

### Tela 2: Mural de Contratos / Tasks (`/Task`)

#### [Tasks - Web] Análise de Elementos e Comportamentos:

- **[UI Estática]:** Moldura de madeira maciça sobre parede de pedra rústica (`tasks-web.webp`), dividida em 3 colunas rúnicas verticais com a regra CSS `display: grid; grid-template-columns: repeat(3, 1fr);`.
- **[Mapeamento de Dados - Coluna 1 (Esquerda: "A FAZER")]:**
  - Renderizar tarefas onde `status === 'todo'`.
  - Cada tarefa é representada por um pergaminho `UiParchmentCard.vue` fixado na madeira por pregos de ferro `UiIronNail.vue` ou adagas `UiIronDagger.vue` (para tarefas urgentes/atrasadas).
  - Selo de cera vermelho `UiWaxSeal.vue` (`color="red"`) posicionado no canto inferior do pergaminho indicando contrato aberto.
- **[Mapeamento de Dados - Coluna 2 (Centro: "EM ANDAMENTO")]:**
  - Renderizar tarefas onde `status === 'doing'`.
  - Exibir o mapa táctico em pergaminho aberto e contratos selados com cera azul `UiWaxSeal.vue` (`color="blue"`).
  - Incluir a ampulheta mágica `UiHourglass.vue` ao lado da tarefa ativa caso haja um Pomodoro em execução.
- **[Mapeamento de Dados - Coluna 3 (Direita: "CONCLUÍDAS")]:**
  - Renderizar tarefas onde `status === 'done'`.
  - Exibir pergaminhos com selos de cera verde `UiWaxSeal.vue` (`color="green"`) e medalhas de fita `UiRibbonMedal.vue`.
  - Exibir carimbo em tina avermelhada/dourada com a estampa "CUMPRIDO" sobre a folha.
- **[Mapeamento de Comportamento]:**
  - Drag and Drop HTML5/VueDraggable mantido 100% funcional. Ao arrastar o pergaminho, aplicar inclinação sutil em 3D (`transform: rotate(-3deg) scale(1.05)`).
  - Ao soltar o pergaminho na nova coluna, chamar a ação `taskStore.setTaskStatus(id, newStatus)` com animação de "encaixe" no prego da viga.

#### [Tasks - Mobile] Análise de Elementos e Comportamentos:

- **[Tasks - Mobile UI Estática]:** Background do diário de parede vertical com estrutura metálica e cantoneiras de ferro (`tasks-mobile.webp`).
- **[Mapeamento de Dados & UI Adaptativa]:**
  - Cabeçalho com 3 abas diegéticas superiores estilizadas em madeira:
    - **Aba 1 (📜 Contratos):** Filtra tarefas `todo`.
    - **Aba 2 (⚔️ Em Combate):** Filtra tarefas `doing`.
    - **Aba 3 (🏆 Vitórias):** Filtra tarefas `done`.
  - Exibir apenas a coluna da aba selecionada ocupando 100% da largura útil.
- **[Mapeamento de Comportamento]:**
  - Troca de abas por toque direto nos ícones ou por deslize de dedo (swipe lateral).
  - Modal de detalhes da tarefa abre em folha inteira de pergaminho adaptada para mobile.

#### Checklist de Refatoração da Tela de Tasks:

- [ ] Refatorar `pages/Task/index.vue` e `components/features/tasks/kanban/KanbanBoard.vue`.
- [ ] Substituir o uso do SVG estático em `Paper.vue` (`/svg/old-paper-4.svg`) pelo novo `UiParchmentCard.vue` responsivo.
- [ ] Integrar `UiWaxSeal.vue` mapeando as cores diretamente do enum de prioridade e status da tarefa.
- [ ] Implementar os accents decorativos `UiIronDagger.vue` em tarefas com `late === true`.
- [ ] Adicionar o efeito visual de carimbo "CUMPRIDO" em tarefas do status `done`.
- [ ] Implementar as abas superiores de madeira para navegação mobile em `FieldJournalMobile.vue`.
- [ ] Testar a drag & drop em desktop garantindo atualização imediata do backend sem flicker visual.

---

### Tela 3: Sala de Arquivos / Projects (`/projects`)

#### [Projects - Web] Análise de Elementos e Comportamentos:

- **[UI Estática]:** Fundo da Biblioteca de Arquivos com estante maciça de carvalho entalhada com runas douradas nas prateleiras (`projects-web.webp`).
- **[Mapeamento de Dados - Prateleiras & Grimórios]:**
  - Cada projeto ativo na `projectStore.projects` é renderizado como um livro de couro `UiGrimoireBook.vue` disposto nas prateleiras da estante.
  - A cor da capa do livro reflete a propriedade `project.color` (ex: azul safira, verde esmeralda, vermelho rubi, roxo ametista).
  - Livros com fecho de correntes e cadeados representam projetos bloqueados ou estratégicos de longo prazo.
  - Frascos de poções brilhantes e ampulhotas na prateleira funcionam como indicadores visuais de progresso e saúde do projeto (métricas EVM).
- **[Mapeamento de Comportamento]:**
  - Ao passar o mouse (hover) sobre um livro, o volume se projeta suavemente para a frente (`transform: translateY(-8px) scale(1.03)`) e a runa da prateleira correspondente acende em dourado.
  - Ao clicar em um livro, abre-se o modal `BookModal.vue` estilizado como um **Tomo Medieval Aberto em Página Dupla**:
    - **Página Esquerda:** Visão geral, metadados, objetivo SMART e árvore WBS.
    - **Página Direita:** Diagrama PERT/CPM, gráfico de Gantt (ECharts) e X-Matrix.

#### [Projects - Mobile] Análise de Elementos e Comportamentos:

- **[Projects - Mobile UI Estática]:** Fundo da estante vertical em nichos 3x5 (`projects-mobile.webp`).
- **[Mapeamento de Dados & UI Adaptativa]:**
  - Dispor os grimórios em uma grade vertical scrollável.
  - Toque no livro abre uma gaveta/drawer deslizante de couro com as abas de navegação do projeto (SMART, WBS, PERT, EVM).
- **[Mapeamento de Comportamento]:** Scroll suave na estante com efeito parallax sutil no fundo de pedras e velas.

#### Checklist de Refatoração da Tela de Projects:

- [ ] Refatorar `pages/projects/index.vue` eliminando os componentes SVG pesados `BookShelf.vue` (24KB) e `WoodenTable.vue` (46KB).
- [ ] Criar o container fluido `GrimoireShelf.vue` baseado em CSS Grid responsivo.
- [ ] Implementar `UiGrimoireBook.vue` para renderizar os livros de couro dinâmicos com a cor e emblema de cada projeto.
- [ ] Refatorar o modal `BookModal.vue` garantindo que o tomo aberto em página dupla exiba os gráficos ECharts sem distorção.
- [ ] Implementar a visualização da estante vertical para mobile (`GrimoireGridMobile.vue`).
- [ ] Validar a abertura direta de projetos via query params na URL (`/projects?projectId=...`).

---

### Tela 4: Sala do Astrolábio / Calendar (`/calendar`)

#### [Calendar - Web] Análise de Elementos e Comportamentos:

- **[UI Estática]:** Fundo do Observatório Astrológico com janelas arqueadas mostrando o céu estrelado e moldura gigante de pergaminho 7x5 mounted em madeira maciça (`calendar-web.webp`).
- **[Mapeamento de Dados - Cabeçalho Rúnico]:**
  - Os 7 blocos de madeira gravados com runas no topo do quadro representam os dias da semana (`DOM`, `SEG`, `TER`, `QUA`, `QUI`, `SEX`, `SÁB`).
- **[Mapeamento de Dados - Matriz 7x5 de Dias]:**
  - Renderizar os 35 quadros de pergaminho do mês atual.
  - Tarefas com `deadline` ou marcos do PERT caindo no dia são renderizados como mini-selos de cera ou pequenos trechos de pergaminho dentro da célula correspondente.
- **[Mapeamento de Comportamento]:**
  - Clicar em um dia seleciona a data, destaca a célula com uma moldura dourada e abre o painel lateral da mesa do astrolábio listando detalhadamente todas as obrigações daquele dia.
  - Botões de navegação de mês estilizados na moldura de madeira (setas rúnicas entalhadas).

#### [Calendar - Mobile] Análise de Elementos e Comportamentos:

- **[Calendar - Mobile UI Estática]:** Fundo do observatório vertical com janela arqueada e lua crescente (`calendar-mobile.webp`).
- **[Mapeamento de Dados & UI Adaptativa]:**
  - Quadro de pergaminho compacto exibindo a grade do mês.
  - Ao tocar em qualquer dia com tarefas, abre-se um bottom drawer de pergaminho listando as missões e hábitos do dia.
- **[Mapeamento de Comportamento]:** Swipe para a esquerda/direita altera o mês do calendário.

#### Checklist de Refatoração da Tela de Calendar:

- [ ] Criar a nova página Nuxt `pages/calendar.vue` e registrar no sistema de navegação da guilda.
- [ ] Criar o componente `components/features/calendar/AstrolabeBoard.vue` para renderizar a moldura 7x5.
- [ ] Implementar os cabeçalhos rúnicos para os 7 dias da semana usando `UiRunicTile.vue`.
- [ ] Conectar os prazos do `taskStore` às células do calendário.
- [ ] Criar o painel lateral de detalhes do dia selecionado em pergaminho.
- [ ] Implementar a versão adaptativa mobile com suporte ao bottom-sheet drawer.

---

## 3. Matriz de Mapeamento de Arquivos e Modificações

| Ação       | Caminho do Arquivo                           | Descrição da Alteração                                                   |
| :--------- | :------------------------------------------- | :----------------------------------------------------------------------- |
| `[NEW]`    | `public/images/guild/*.webp`                 | 8 imagens otimizadas da guilda transferidas para a pasta pública         |
| `[NEW]`    | `assets/css/tokens.css`                      | Definição dos tokens diegéticos CSS (HSL cores, madeiras, selos, fontes) |
| `[NEW]`    | `assets/css/diegetic-containers.css`         | Estilos flexíveis de pergaminho, molduras de madeira e couro             |
| `[NEW]`    | `stores/uiGuild.ts`                          | Store Pinia para controlar o estado diegético da UI e responsividade     |
| `[NEW]`    | `composables/ui/useResponsive.ts`            | Composable para controle centralizado de breakpoints                     |
| `[NEW]`    | `components/ui/diegetic/UiParchmentCard.vue` | Componente flexível de pergaminho com cantos orgânicos                   |
| `[NEW]`    | `components/ui/diegetic/UiWaxSeal.vue`       | Componente de selo de cera por prioridade e status                       |
| `[NEW]`    | `components/ui/diegetic/UiIronDagger.vue`    | Componente de adaga fixadora de tarefas atrasadas                        |
| `[NEW]`    | `components/ui/diegetic/UiIronNail.vue`      | Pregos e percevejos rústicos decorativos                                 |
| `[NEW]`    | `components/ui/diegetic/UiWoodenFrame.vue`   | Moldura container maciça flexível para o Kanban                          |
| `[NEW]`    | `components/ui/diegetic/UiRunicTile.vue`     | Placa rúnica para títulos de colunas e dias                              |
| `[NEW]`    | `components/ui/diegetic/UiHourglass.vue`     | Ampulheta com areia animada para Pomodoro                                |
| `[NEW]`    | `components/ui/diegetic/UiRibbonMedal.vue`   | Medalha de fita para tarefas concluídas                                  |
| `[NEW]`    | `components/ui/diegetic/UiGrimoireBook.vue`  | Livro de couro personalizável por projeto                                |
| `[NEW]`    | `components/layout/GuildEnvironment.vue`     | Layout panorâmico raiz com iluminação e parallax                         |
| `[NEW]`    | `pages/calendar.vue`                         | Nova rota para a tela de observatório e calendário                       |
| `[MODIFY]` | `nuxt.config.ts`                             | Importação das fontes do Google e inclusão dos arquivos CSS globals      |
| `[MODIFY]` | `layouts/default.vue`                        | Envelope das páginas no `<GuildEnvironment>` panorâmico                  |
| `[MODIFY]` | `pages/index.vue`                            | Substituição da imagem estática pelo Dashboard do Saguão Central         |
| `[MODIFY]` | `pages/Task/index.vue`                       | Integração da moldura de madeira e abas mobile do diário                 |
| `[MODIFY]` | `pages/projects/index.vue`                   | Substituição dos SVGs estáticos pela estante responsiva de carvalho      |
| `[MODIFY]` | `components/features/projects/BookModal.vue` | Refatoração para exibição de tomo aberto em página dupla                 |

---

## 4. Cronograma de Execução Sequencial (Plano por Fases)

```
┌────────────────────────────────────────────────────────────────────────┐
│                          Cronograma de Execução                         │
├────────────────────────────────────────────────────────────────────────┤
│ FASE 1: Fundação & Tokenização (Sprints 1-2)                            │
│ └─ Tokens CSS + Componentes Diegéticos + Layout GuildEnvironment       │
├────────────────────────────────────────────────────────────────────────┤
│ FASE 2: Saguão Central & Mural de Contratos (Sprints 3-4)              │
│ └─ Refatoração de pages/index.vue + Kanban de Madeira / ParchmentCards  │
├────────────────────────────────────────────────────────────────────────┤
│ FASE 3: Biblioteca de Arquivos & Calendário (Sprints 5-6)              │
│ └─ Estante de Grimórios + Tomo Aberto + Sala do Astrolábio             │
├────────────────────────────────────────────────────────────────────────┤
│ FASE 4: Polimento Mobile & Garantia de Qualidade (Sprint 7)            │
│ └─ Diário de Campo Touch + Bottom Drawers + Build Audit & WCAG AA      │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Critérios de Aceite e Garantia de Qualidade (QA)

1. **Desempenho e FPS:** As animações de iluminação de tochas e deslocamento de câmera (_Camera Pan_) devem rodar a 60 FPS consistentes sem engasgos (jank).
2. **Adaptação Orgânica de Texto:** Nenhuma descrição de tarefa ou nome de projeto pode ser cortado ou forçar scroll indesejado devido a containers engessados. O pergaminho expande verticalmente conforme o conteúdo.
3. **Ergonomia e Contraste (WCAG AA):** A tinta dos pergaminhos (`--guild-parchment-ink`) sobre a base de pergaminho (`--guild-parchment-base`) deve possuir uma razão de contraste mínima de **7:1**, garantindo leitura confortável durante sessões prolongadas de trabalho.
4. **Fidelidade Visual:** A interface final deve reproduzir com extrema precisão a atmosfera medieval fantástica apresentada nos 8 mockups conceituais em `Frontend/imagens-geradas/`.
5. **Estabilidade de Build:** Compilação final via `npm run build` na pasta `/Frontend` concluída com **zero erros ou avisos de TypeScript**.
