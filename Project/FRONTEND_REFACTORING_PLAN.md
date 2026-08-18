# 🛡️ Checklist de Refatoração Frontend — SecondBrain (Nuxt 3)

> **Tech Stack:** Nuxt 3 (Vue 3 + Composition API), TypeScript, CSS Scoped / Tailwind, Sprite Sheets, Web Audio API / Howler.js, Pinia, ECharts.  
> **Padrão de UI:** Viewport 16:9 (Desktop) / 9:16 (Mobile < 960px) — Arquitetura Diegética em 3 Camadas (_Depth Stacking_).  
> **Assets de Referência Visual:** 8 mockups em `public/images/guild/` (`*-web.webp`, `*-mobile.webp`).  
> **Documento Consolidado:** Incorpora o escopo de `FRONTEND_GUILD_REFACTORING_PLAN.md`.  
> **Última Atualização:** 10/08/2026  
> **Status:** Saguão Central em Evolução | Modais & Overlays em Polimento | Spritesheets & Componentes Diegéticos em Progresso

---

## 📊 Resumo de Progresso do Frontend

| Fase / Seção                                                               | Requisitos | Concluído |    Status    |
| -------------------------------------------------------------------------- | :--------: | :-------: | :----------: |
| 🏛️ 1. Infraestrutura & Atomic Design Diegético (`components/ui/diegetic/`) |     12     |   5/12    |   🟡 41.7%   |
| 🎨 2. Tokens CSS, HSL & Responsividade Dinâmica (<960px)                   |     8      |    4/8    |   🟡 50.0%   |
| 🏰 3. Saguão Central da Guilda (`/`)                                       |     21     |   14/21   |   🟡 66.7%   |
| ⚔️ 4. Mural de Contratos / Kanban (`/tasks`)                               |     12     |   0/12    |    ⬜ 0%     |
| 📜 5. Sala de Arquivos & Grimórios (`/projects`)                           |     10     |   0/10    |    ⬜ 0%     |
| 🗺️ 6. Sala do Astrolábio & Cartografia (`/calendar`)                       |     10     |   0/10    |    ⬜ 0%     |
| 📋 7. Modais & Overlays Globais Diegéticos                                 |     10     |   3/10    |   🟡 30.0%   |
| ⚙️ 8. Pinia Stores & Data Mapping RPG                                      |     6      |    3/6    |   🟡 50.0%   |
| ⚡ 9. Otimização & Asset Pipeline                                          |     6      |    4/6    |   🟡 66.7%   |
| **TOTAL**                                                                  |   **95**   | **33/95** | **🟡 34.7%** |

---

## 🏛️ 1. Infraestrutura & Atomic Design Diegético (`components/ui/diegetic/`) 🟡 EM PROGRESSO (5/12)

- [x] Configurar container de palco com aspect-ratio 16:9 travado e centralizado na tela (`pages/index.vue` `.safe-zone`).
- [x] Implementar sistema de ancoragem de UI (`HUD Layer`) com `pointer-events: none` (`.guild-hud-layer`).
- [x] Criar composable de áudio `useGuildAudio()` (gerenciamento de SFX, volume, mutar e variação de tom/pitch com Web Audio API).
- [x] Construir `UiParchmentCard.vue` utilizando HSL CSS puro e gradientes orgânicos em substituição a SVGs estáticos.
- [ ] Criar a pasta `components/ui/diegetic/` para isolamento dos componentes físicos do jogo e arquivo de exportação unificado `index.ts`.
- [ ] Construir `UiWaxSeal.vue` com suporte a variações de cores: Vermelho Sangue (`#8B0000` / Alta), Azul Místico (`#0077BE` / Média), Verde Musgo (`#2E8B57` / Concluída) e Âmbar (`#D4AF37` / Hábito).
- [ ] Construir `UiIronDagger.vue` e `UiIronNail.vue` utilizando `drop-shadow` CSS para fixar tarefas urgentes e atrasadas.
- [ ] Construir `UiWoodenFrame.vue` com grid flexível e textura rústica para containers do Kanban e tabelas.
- [ ] Construir `UiRunicTile.vue` para placas de cabeçalho das 3 colunas Kanban e dos 7 dias da semana no Calendário.
- [ ] Construir `UiHourglass.vue` para visualização animada de Pomodoro e tarefas ativas em tempo real.
- [ ] Construir `UiRibbonMedal.vue` para medalha de fita e cera em tarefas concluídas.
- [ ] Construir `UiGrimoireBook.vue` com suporte a cor de capa, lombada e insígnia baseadas nos metadados do projeto.

---

## 🎨 2. Tokens CSS, HSL & Responsividade Dinâmica (<960px) 🟡 EM PROGRESSO (4/8)

- [x] Centralizar detecção de breakpoint no composable `useResponsive.ts` usando `@vueuse/core` (`useBreakpoints`).
- [x] Definir o breakpoint `960px` como divisor oficial entre visões Web (`*-web.webp`) e Mobile (`*-mobile.webp`).
- [x] Criar `assets/css/tokens.css` com paleta HSL da guilda (madeiras carvalho, pergaminhos, selos, pedra e fontes).
- [x] Carregar as fontes do Google Fonts (`Cinzel`, `MedievalSharp`, `Inter`) no `nuxt.config.ts`.
- [ ] Criar `assets/css/diegetic-containers.css` com estilos reutilizáveis para pergaminhos, molduras e livros sem SVGs engessados.
- [ ] Criar o componente `FieldJournalMobile.vue` para encapsular o Kanban em diário vertical com abas de topo no mobile.
- [ ] Criar o componente `GrimoireGridMobile.vue` para organizar a estante de projetos em grade vertical scrollável 3x5.
- [ ] Criar o componente `CalendarDrawerMobile.vue` para exibir tarefas do dia em bottom-sheet de pergaminho deslizável com suporte a gestos touch (`@vueuse/gesture`).

---

## 🏰 3. Tela: Saguão Central da Guilda (`/`) 🟡 EM PROGRESSO (15/21)

### 3.1. Cenário Base & Camadas Estáticas

- [x] Carregar imagem base limpa otimizada (`entrada-bg-clean.webp`).
- [x] Posicionar a imagem do overlay da cadeira (`/vfx/chair.png`) em `z-index: 5` sobre o vão da biblioteca.

### 3.2. Camada de VFX & Iluminação Viva (`z-index: 2`)

- [x] **Tochas das Pilastras e Paredes:** Implementar Spritesheet das labaredas em loop (`GuildVfxLayer.vue`).
- [x] **Dessincronização de Brilhos:** Aplicar `radial-gradient` + `mix-blend-mode: color-dodge` com `animation-delay` em cada tocha.
- [x] **Lareira ao Fundo:** Animação de pulso do fogo + emissão de fagulhas em loop (`GuildParticlesCanvas.vue` + `@keyframes sparkRise`).
- [x] **Banners nas Colunas:** Aplicar balanço suave de vento (`@keyframes bannerSway`) com `transform-origin: top center`.
- [ ] **Velas & Candelabros Secundários:** Spritesheet de chama variante para velinhas das mesas/balcão.
- [x] **Partículas Interativas de Poeira Dourada:** Poeira/fagulhas reagindo com repulsão sutil ao movimento do cursor.

### 3.3. Portais & Interatividade de Navegação

- [x] **Arco da Esquerda (Mural de Missões -> `/tasks`):**
  - [x] Mapear o vão com SVG Path / Hitbox dedicada (`GuildArchPortal.vue`).
  - [x] Aplicar iluminação interna suave no `:hover` (`mix-blend-mode: color-dodge`).
  - [x] Exibir tag flutuante (`⚔️ Mural de Missões`) com animação de subida suave.
  - [x] Disparar animação de Camera Zoom (`scale(2.8)`, origin: `11% 50%`) + SFX de passos na pedra ao clicar.
  - [x] Spritesheet de névoa rúnica/portal mágico ativando no hover do Arco de Missões.

- [x] **Porta da Direita (Biblioteca & Arquivos -> `/projects`):**
  - [x] Implementar Sprite Sheet de 9 frames da porta abrindo (`GuildLibraryPortal.vue`).
  - [x] Configurar transição de sprite no `:hover` com `SPRITE_FRAMES` (passando por trás do `chair.png`).
  - [x] Integrar áudio de ranger de porta no hover e fecho ao sair (`playDoorOpenSound` / `playDoorCloseSound`).
  - [x] Disparar animação de Camera Zoom (`scale(2.8)`, origin: `88% 50%`) + transição de rota ao clicar.
  - [x] Efeito de vazamento de luz dourada entre as frestas da porta da biblioteca ao entreabrir.

- [x] **Escadaria Central (Cartografia / Calendário -> `/calendar`):**
  - [x] Mapear hitbox no topo do mezanino (`GuildDiegeticHotspots.vue`).
  - [x] Efeito de iluminação no hover e tooltip flutuante (`📜 Calendário & Eventos`).
  - [x] Camera Zoom centralizado e navegação.
  - [ ] Animação de flâmula pendurada balançando ao focar a escadaria.

### 3.4. Micro-Interações & Sprites de NPCs (Easter Eggs & Props)

- [x] **NPCs (Anão & Elfa):**
  - [ ] Posicionar sprite `.png` dos NPCs em `GuildNpcSpeechBubble.vue`.
  - [ ] Aplicar animação CSS de respiração idle (`@keyframes npcIdle`).
  - [x] Clique nos NPCs ativa balão de fala com frases dinâmicas de progresso do usuário.
  - [ ] Spritesheet animado do Anão Ferreiro batendo o martelo na bigorna em loop.
  - [ ] Spritesheet animado da Elfa Arcanista folheando pergaminhos em loop.
- [ ] **Pilha de Moedas no Balcão:** Clique toca SFX de ouro (`playCoinsSound`) + animação floating `+1 Gold`.
- [ ] **Adaga Fincada no Balcão:** Clique ativa tremedeira metálica (`playDaggerSound` + `@keyframes daggerVibrate`).
- [ ] **Caneca de Hidromel:** Clique ativa animação de espuma subindo + SFX de brinde/gole.

---

## ⚔️ 4. Mural de Contratos / Kanban (`/tasks`) ⏳ EM PLANEJAMENTO (0/12)

- [ ] Refatorar `pages/Task/index.vue` e `components/features/tasks/kanban/KanbanBoard.vue`.
- [ ] Moldura de madeira maciça sobre parede de pedra rústica (`tasks-web.webp`), dividida em 3 colunas rúnicas (`display: grid; grid-template-columns: repeat(3, 1fr)`).
- [ ] **Coluna "Contratos Abertos" (To Do):** Tarefas com `status === 'todo'` em pergaminhos `UiParchmentCard.vue` seladas com cera vermelha `UiWaxSeal.vue`.
- [ ] **Coluna "Em Andamento" (In Progress):** Tarefas com `status === 'doing'` seladas com cera azul, com ampulheta mágica `UiHourglass.vue` caso haja Pomodoro ativo.
- [ ] **Coluna "Missões Cumpridas" (Done):** Tarefas com `status === 'done'` seladas com cera verde, medalhas `UiRibbonMedal.vue` e carimbo estilizado "CUMPRIDO".
- [ ] **Accents de Adagas & Pregos:** Tarefas com `late === true` (atrasadas) fixadas com `UiIronDagger.vue` em vez de pregos comuns.
- [ ] **Spritesheet do Selo de Cera:** Animação de carimbar/pressionar o selo vermelho ao mover para concluído.
- [ ] **Spritesheet de Papel Desenrolando:** Transição fluida ao expandir modal de detalhes da tarefa.
- [ ] **Drag and Drop 3D Tilt:** Manter VueDraggable/HTML5 com inclinação sutil 3D (`transform: rotate(-3deg) scale(1.05)`) e SFX de textura de pergaminho/rascunho ao arrastar.
- [ ] **Abas Superiores Mobile:** Abas rústicas de madeira no `FieldJournalMobile.vue` para alternar entre "📜 Contratos", "⚔️ Em Combate" e "🏆 Vitórias".
- [ ] **SFX Dedicados:** Som de escrita com pena de ganso (ao editar), martelo de cera (ao concluir) e folha rasgando (ao excluir).
- [ ] Botão de "Retornar ao Saguão" integrado à UI ancorada com transição de volta ao saguão.

---

## 📜 5. Sala de Arquivos & Grimórios (`/projects`) ⏳ EM PLANEJAMENTO (0/10)

- [ ] Refatorar `pages/projects/index.vue` eliminando os componentes SVG pesados legados `BookShelf.vue` (24KB) e `WoodenTable.vue` (46KB).
- [ ] Criar container fluido `GrimoireShelf.vue` baseado em CSS Grid responsivo com textura de carvalho e entalhes rúnicos dourados (`projects-web.webp`).
- [ ] Renderizar cada projeto de `projectStore.projects` como um livro de couro `UiGrimoireBook.vue` onde a cor da capa reflete `project.color`.
- [ ] Livros com fecho de correntes e cadeados para projetos estratégicos de longo prazo ou bloqueados.
- [ ] **Spritesheet de Livro Abrindo:** Animação de páginas folheando ao selecionar projeto.
- [ ] **VFX de Aura Rúnica & Poeira:** Brilho rúnico pulsante no hover da lombada e poeira flutuante nos feixes de luz das estantes.
- [ ] Refatorar modal `BookModal.vue` estilizado como **Tomo Medieval Aberto em Página Dupla**:
  - Página Esquerda: Visão geral, metadados, objetivo SMART e árvore WBS.
  - Página Direita: Diagrama PERT/CPM, gráficos ECharts (Gantt) e X-Matrix.
- [ ] Renderizar frascos de poções e ampulhetas na prateleira como indicadores visuais de saúde do projeto (EVM).
- [ ] Implementar visualização vertical de estante 3x5 scrollável para mobile (`GrimoireGridMobile.vue`).
- [ ] Validar a abertura direta de projetos via query params na URL (`/projects?projectId=...`).

---

## 🗺️ 6. Sala do Astrolábio & Cartografia (`/calendar`) ⏳ EM PLANEJAMENTO (0/10)

- [ ] Criar a nova página Nuxt `pages/calendar.vue` e registrar na navegação panorâmica da guilda.
- [ ] Criar o componente `components/features/calendar/AstrolabeBoard.vue` para renderizar o quadro de pergaminho 7x5 mounted em madeira (`calendar-web.webp`).
- [ ] Implementar cabeçalhos rúnicos para os 7 dias da semana usando `UiRunicTile.vue`.
- [ ] Renderizar os 35 quadros de pergaminho do mês atual conectando os prazos do `taskStore`.
- [ ] **Spritesheet do Astrolábio / Bússola:** Bússola rúnica animada girando no canto da mesa de cartografia.
- [ ] **Animação de Desenrolar Mapa:** Transição inicial ao entrar na tela de Cartografia.
- [ ] Marcadores de data em miniatura de acampamento e flâmulas com física de balanço.
- [ ] **VFX de Linhas de Rota Rúnicas:** Traçados brilhantes conectando marcos do PERT e entregas críticas.
- [ ] Criar o painel lateral em pergaminho para listar obrigações do dia selecionado.
- [ ] Implementar versão adaptativa mobile (`CalendarDrawerMobile.vue`) com bottom-sheet deslizável e gestos touch.

---

## 📋 7. Modais & Overlays Globais Diegéticos 🟡 EM PROGRESSO (3/10)

- [x] Modal de Tarefas Diárias base (Livro do Balcão) funcional (`GuildReceptionDesk.vue`).
- [x] HUD Superior base (Nível, XP, Streak, Mute) em `GuildTopBanner.vue`.
- [x] Widget do livro do balcão para visualização rápida (`GuildDeskBookWidget.vue`).
- [ ] **Spritesheet da Capa do Grimório:** Animação de capa de couro e fecho metálico abrindo/fechando ao clicar no livro do balcão.
- [ ] **Partículas e Brilho Interno dos Modais:** Efeito de luz mágica saindo de dentro das páginas do Grimório aberto.
- [ ] **Polimento dos Overlays Globais:** Transição de `.light-transition-overlay` com vinheta/vignette diegética e partículas de poeira.
- [ ] **Sistema de Notificações Diegéticas:** Notificações globais que aparecem como pergaminhos caindo ou cartas seladas no HUD.
- [ ] **Responsividade Fina dos Modais:** Adaptação pixel-perfect do Grimório e HUD para telas mobile ultra-narrow.
- [ ] **Barra Flutuante Mobile:** Refinar `GuildMobileJournal.vue` para alternar telas via bottom journal rústico.
- [ ] **Controle de Mute/Unmute:** Persistir preferência de áudio no `localStorage` com indicação rúnica no banner.

---

## ⚙️ 8. Pinia Stores & Data Mapping RPG 🟡 EM PROGRESSO (3/6)

- [x] `stores/uiGuild.ts` para gerenciar estado diegético (`activeRoom`, `mobileTaskTab`, `selectedCalendarDate`, `isGrimoireOpen`, `cameraPosition`).
- [x] `stores/task.ts` com getters de tarefas por status e data.
- [x] `stores/project.ts` com metadados visuais (`leatherColor`, `emblemIcon`, `runicCategory`).
- [ ] Mapear livro de registro em `GuildReceptionDesk.vue` com métricas acumuladas (XP, missões ativas, taxa de hábitos do dia).
- [ ] Conectar indicadores visuais EVM/PERT às poções e ampulhetas na sala de arquivos.
- [ ] Suporte a navegação por Deep Links diegéticos (`/projects?projectId=...` e `/Task?taskId=...`).

---

## 🛠️ 9. Matriz de Mapeamento de Arquivos e Modificações

| Ação       | Caminho do Arquivo                           | Descrição da Alteração                                                       |
| :--------- | :------------------------------------------- | :--------------------------------------------------------------------------- |
| `[NEW]`    | `public/images/guild/*.webp`                 | 8 imagens otimizadas da guilda (`entrada-web`, `tasks-mobile`, etc.)         |
| `[NEW]`    | `assets/css/tokens.css`                      | Variáveis HSL diegéticas (cores de madeiras, pergaminhos, selos, fontes)     |
| `[NEW]`    | `assets/css/diegetic-containers.css`         | Estilos reutilizáveis para pergaminhos, molduras e livros sem SVGs estáticos |
| `[NEW]`    | `stores/uiGuild.ts`                          | Store Pinia para controlar sala ativa, abas mobile e estado de animações     |
| `[NEW]`    | `composables/ui/useResponsive.ts`            | Composable para controle centralizado de breakpoints (960px)                 |
| `[NEW]`    | `components/ui/diegetic/UiParchmentCard.vue` | Componente de pergaminho flexível com cantos orgânicos HSL                   |
| `[NEW]`    | `components/ui/diegetic/UiWaxSeal.vue`       | Componente de selo de cera 3D por prioridade e status                        |
| `[NEW]`    | `components/ui/diegetic/UiIronDagger.vue`    | Componente de adaga fixadora de tarefas atrasadas                            |
| `[NEW]`    | `components/ui/diegetic/UiIronNail.vue`      | Pregos e percevejos rústicos decorativos                                     |
| `[NEW]`    | `components/ui/diegetic/UiWoodenFrame.vue`   | Moldura container maciça flexível para o Kanban                              |
| `[NEW]`    | `components/ui/diegetic/UiRunicTile.vue`     | Placa rúnica para títulos de colunas e dias da semana                        |
| `[NEW]`    | `components/ui/diegetic/UiHourglass.vue`     | Ampulheta com areia animada para Pomodoro                                    |
| `[NEW]`    | `components/ui/diegetic/UiRibbonMedal.vue`   | Medalha de fita para tarefas concluídas                                      |
| `[NEW]`    | `components/ui/diegetic/UiGrimoireBook.vue`  | Livro de couro personalizável por projeto                                    |
| `[NEW]`    | `components/layout/GuildEnvironment.vue`     | Layout panorâmico raiz com iluminação e parallax                             |
| `[NEW]`    | `pages/calendar.vue`                         | Nova rota para a tela de observatório e calendário                           |
| `[MODIFY]` | `nuxt.config.ts`                             | Importação das fontes do Google (Cinzel, MedievalSharp) e CSS globals        |
| `[MODIFY]` | `layouts/default.vue`                        | Envelope das páginas no `<GuildEnvironment>` panorâmico                      |
| `[MODIFY]` | `pages/index.vue`                            | Dashboard do Saguão Central em 3 camadas                                     |
| `[MODIFY]` | `pages/Task/index.vue`                       | Moldura de madeira e abas mobile do diário                                   |
| `[MODIFY]` | `pages/projects/index.vue`                   | Substituição dos SVGs estáticos pesados pela estante de carvalho             |
| `[MODIFY]` | `components/features/projects/BookModal.vue` | Refatoração para tomo aberto em página dupla com ECharts                     |

---

## ⚡ 10. Otimização & Asset Pipeline 🟡 EM PROGRESSO (4/6)

- [x] Converter todas as imagens estáticas de fundo para o formato `.webp`.
- [x] Comprimir Sprite Sheets em PNG 8-bit sem perda de transparência.
- [x] Aplicar `will-change: transform, filter, background-position` em elementos com animação contínua.
- [x] Realizar pré-carregamento (_preload_) das imagens e sons das telas principais no carregamento do app.
- [ ] **Atlas de Spritesheets (Sprite Packer):** Agrupar múltiplos sprites em atlas unificados para reduzir requisições HTTP.
- [ ] **Profiling de Performance GPU/CPU:** Testes no Chrome DevTools Performance Monitor garantindo 60 FPS estáveis em telas mobile.
