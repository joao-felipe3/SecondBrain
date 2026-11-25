# 🛡️ Checklist de Refatoração Frontend — SecondBrain (Nuxt 3)

> **Tech Stack:** Nuxt 3 (Vue 3 + Composition API), TypeScript, CSS Scoped / Tailwind, Sprite Sheets, Web Audio API / Howler.js, Pinia, ECharts.  
> **Padrão de UI:** Viewport 16:9 (Desktop) / 9:16 (Mobile < 960px) — Arquitetura Diegética em 3 Camadas (_Depth Stacking_).  
> **Assets de Referência Visual:** 8 mockups em `public/images/guild/` (`*-web.webp`, `*-mobile.webp`).  
> **Documento Consolidado:** Incorpora o escopo de `FRONTEND_GUILD_REFACTORING_PLAN.md`.  
> **Última Atualização:** 19/11/2026
> **Status:** Abordagem A Concluída | Engenharia de Software & Componentes Diegéticos Prontos | Spritesheets em Stand-By Artístico

---

## 📊 Resumo de Progresso do Frontend

| Fase / Seção                                                               | Requisitos |  Concluído  |    Status    |
| -------------------------------------------------------------------------- | :--------: | :---------: | :----------: |
| 🏛️ 1. Infraestrutura & Atomic Design Diegético (`components/ui/diegetic/`) |     12     |    12/12    |   🟢 100%    |
| 🎨 2. Tokens CSS, HSL & Responsividade Dinâmica (<960px)                   |     8      |     8/8     |   🟢 100%    |
| 🏰 3. Saguão Central da Guilda (`/`)                                       |     40     |    40/40    |   🟢 100%    |
| ⚔️ 4. Mural de Contratos / Kanban (`/tasks`)                               |     10     |    10/10    |   🟢 100%    |
| 📜 5. Sala de Arquivos & Grimórios (`/projects`)                           |     11     |    8/11     |   🟡 72.7%   |
| 🗺️ 6. Sala do Astrolábio & Cartografia (`/calendar`)                       |     10     |    6/10     |   🟡 60.0%   |
| 📋 7. Modais & Overlays Globais Diegéticos                                 |     10     |    7/10     |   🟡 70.0%   |
| ⚙️ 8. Pinia Stores & Data Mapping RPG                                      |     6      |     5/6     |   🟡 83.3%   |
| ⚡ 9. Otimização & Asset Pipeline                                          |     6      |     4/6     |   🟡 66.7%   |
| **TOTAL**                                                                  |  **113**   | **100/113** | **🟡 88.5%** |

---

## 🏛️ 1. Infraestrutura & Atomic Design Diegético (`components/ui/diegetic/`) 🟢 CONCLUÍDO (12/12)

- [x] Configurar container de palco com aspect-ratio 16:9 travado e centralizado na tela (`pages/index.vue` `.safe-zone`).
- [x] Implementar sistema de ancoragem de UI (`HUD Layer`) com `pointer-events: none` (`.guild-hud-layer`).
- [x] Criar composable de áudio `useGuildAudio()` (gerenciamento de SFX, volume, mutar e variação de tom/pitch com Web Audio API).
- [x] Construir `UiParchmentCard.vue` utilizando HSL CSS puro e gradientes orgânicos em substituição a SVGs estáticos.
- [x] Criar a pasta `components/ui/diegetic/` para isolamento dos componentes físicos do jogo e arquivo de exportação unificado `index.ts`.
- [x] Construir `UiWaxSeal.vue` com suporte a variações de cores: Vermelho Sangue (`#8B0000` / Alta), Azul Místico (`#0077BE` / Média), Verde Musgo (`#2E8B57` / Concluída) e Âmbar (`#D4AF37` / Hábito).
- [x] Construir `UiIronDagger.vue` e `UiIronNail.vue` utilizando `drop-shadow` CSS para fixar tarefas urgentes e atrasadas.
- [x] Construir `UiWoodenFrame.vue` com grid flexível e textura rústica para containers do Kanban e tabelas.
- [x] Construir `UiRunicTile.vue` para placas de cabeçalho das 3 colunas Kanban e dos 7 dias da semana no Calendário.
- [x] Construir `UiHourglass.vue` para visualização animada de Pomodoro e tarefas ativas em tempo real.
- [x] Construir `UiRibbonMedal.vue` para medalha de fita e cera em tarefas concluídas.
- [x] Construir `UiGrimoireBook.vue` com suporte a cor de capa, lombada e insígnia baseadas nos metadados do projeto.

---

## 🎨 2. Tokens CSS, HSL & Responsividade Dinâmica (<960px) 🟢 CONCLUÍDO (8/8)

- [x] Centralizar detecção de breakpoint no composable `useResponsive.ts` usando `@vueuse/core` (`useBreakpoints`).
- [x] Definir o breakpoint `960px` como divisor oficial entre visões Web (`*-web.webp`) e Mobile (`*-mobile.webp`).
- [x] Criar `assets/css/tokens.css` com paleta HSL da guilda (madeiras carvalho, pergaminhos, selos, pedra e fontes).
- [x] Carregar as fontes do Google Fonts (`Cinzel`, `MedievalSharp`, `Inter`) no `nuxt.config.ts`.
- [x] Criar `assets/css/diegetic-containers.css` com estilos reutilizáveis para pergaminhos, molduras e livros sem SVGs engessados.
- [x] Criar o componente `FieldJournalMobile.vue` para encapsular o Kanban em diário vertical com abas de topo no mobile.
- [x] Criar o componente `GrimoireGridMobile.vue` para organizar a estante de projetos em grade vertical scrollável 3x5.
- [x] Criar o componente `CalendarDrawerMobile.vue` para exibir tarefas do dia em bottom-sheet de pergaminho deslizável com suporte a gestos touch (`@vueuse/gesture`).

---

## 🏰 3. Tela: Saguão Central da Guilda (`/`) 🟢 CONCLUÍDO (40/40)

### 3.1. Cenário Base & Camadas Estáticas

- [x] Carregar imagem base limpa otimizada (`entrada-bg-clean.webp`).
- [x] Posicionar a imagem do overlay da cadeira (`/vfx/chair.png`) em `z-index: 5` sobre o vão da biblioteca.

### 3.2. Camada de VFX & Iluminação Viva (`z-index: 2`)

- [x] **Tochas das Pilastras e Paredes:** Implementar Spritesheet das labaredas em loop (`GuildVfxLayer.vue`).
- [x] **Dessincronização de Brilhos:** Aplicar `radial-gradient` + `mix-blend-mode: color-dodge` com `animation-delay` em cada tocha.
- [x] **Lareira ao Fundo:** Animação de pulso do fogo + emissão de fagulhas em loop (`GuildParticlesCanvas.vue` + `@keyframes sparkRise`).
- [x] **Banners nas Colunas:** Aplicar balanço suave de vento (`@keyframes bannerSway`) com `transform-origin: top center`.
- [x] **Velas & Candelabros Secundários:** Spritesheet de chama variante para velinhas das mesas/balcão.
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
  - [x] Animação de flâmula pendurada balançando ao focar a escadaria.

### 3.4. Micro-Interações & Sprites de NPCs (Easter Eggs & Props)

- [x] **NPCs (Anão & Elfa):**
  - [x] Posicionar sprites `.png` dos NPCs na cena (`GuildNpcLayer.vue`, âncoras em `assets/data/npc-sprites.json`).
  - [x] Aplicar animação CSS de respiração idle (`@keyframes npcIdle` / `npcBreathe`).
  - [x] Clique nos NPCs ativa balão de fala com frases dinâmicas de progresso do usuário.

- [x] **Vida na Cena — vinhetas pintadas na própria ilustração (pipeline `Frontend/scripts/hall-life/`, ver README):**
  - [x] Corrigir coordenadas: `GuildSceneSpace.vue` + `useSceneSpace.ts` reproduzem o cover/scale do `.master-bg` (grade de calibração em `/?sceneDebug=1`).
  - [x] Pipeline: placa da composição acumulada → edição in-scene no Gemini → extração por diferença (ECC + ΔE + máscara-união) → portão de qualidade → Photoshop opcional (`Hall-Life.psd`, ida e volta sem perda) → WebP.
  - [x] Runtime: `GuildNpcLayer.vue` + `useHallLife.ts` (crossfade 220 ms, tempos sorteados por frame, brilho no ritmo das tochas/lareira, pausa em aba oculta, `prefers-reduced-motion`).
  - [x] Elenco desktop (10 vinhetas, todas aprovadas no portão de qualidade): Gloin no caixote, bardo na escada, recepcionista, orc & halfling no mural, mezanino, planejadores na mesa, brinde na lareira, gato no braseiro, arquivista na biblioteca, viajante chegando.
  - [x] Versão mobile: câmera arrastável sobre a mesma cena expandida (`useHallPan.ts` + `mobileStageLayout` em `useSceneSpace.ts`); o palco 16:9 do desktop é reaproveitado inteiro (vinhetas, marionetes, VFX, portais e folha de missões), com lustres do teto animados e fundo em WebP (`Entrada-expandida.webp`, 1,8 MB). `Entrada-mobile.png` aposentado.
  - [x] Gestos por vinheta (repouso → gesto sorteado → repouso; bardo em loop).
  - [x] Caminhante: viajante entra pela esquerda, para no balcão e volta (`walker.py`, ciclo de 4 passos).
  - [x] Marionetes em loop (`GuildPuppetCanvas.vue` WebGL2, gerado por `loop_rig.py`): Gloin, bardo, recepcionista, mural (orc & halfling), planejadores, mezanino e mesa da lareira — ossos com balanço/aceno, gestos sorteados, patches de rosto/braço gerados por IA em sequência com dissolve.
  - [x] Mesa da lareira: cavaleiro reiluminado com a luz da cena; todos bebem (elfa, anão, gnomo, cavaleiro), mandíbulas falando em rajadas, anão rindo, cavaleiro contando história.
  - [x] Camada da frente para marionetes (`foreground` no manifesto): a mesa da lareira anima na frente das labaredas; o gato vai junto para a mesma camada.
  - [x] Brilho da lareira em camada própria (`GuildVfxLayer part="hearth-glow"`) acima das vinhetas da frente, para a área da mesa pulsar junto com o chão em volta.
- [x] **Missões do Dia na folha do balcão:** pergaminho com selo, tinteiro e pena pintado na cena (vinheta `counter-ledger`); `GuildCounterLedger.vue` escreve as 3 missões a tinta projetadas nos cantos da folha (`useQuadTransform.ts`, homografia `matrix3d`), marcáveis com SFX de folhear; clique abre o Grimório. Mobile/retrato mantém o cartão `GuildDeskBookWidget.vue` (`useDailyMissions.ts` compartilhado).
- [x] **Camada de hotspots com `pointer-events: none`:** só as áreas clicáveis capturam o mouse (antes engolia o hover das vinhetas).
- [x] **SFX de folhear audível:** `playPaperFlipSound` refeito (0,42 s, chiado + assentar) e agendado só após o `AudioContext` retomar.
- ~~**Pilha de Moedas no Balcão**~~ e ~~**Adaga Fincada no Balcão**~~: removidas (destoavam da cena).
- [x] **Caneca de Hidromel:** Clique ativa animação de espuma subindo + SFX de brinde/gole.

---

## ⚔️ 4. Mural de Contratos / Kanban (`/tasks`) 🟢 CONCLUÍDO (10/10)

- [x] Refatorar `pages/Task/index.vue` e criar rota de compatibilidade `pages/tasks/index.vue`. _(18/11/2026: as duas rotas viraram wrappers com `layout: false`; a tela mora em `components/features/tasks/page/TasksMural.vue`.)_
- [x] Moldura de madeira maciça sobre parede de pedra rústica, dividida em 3 colunas rúnicas. _(18/11/2026: substituído pela cena pintada `public/imagens/Mural-expandido.webp` — quadro limpo + expansão generativa do Firefly, gradação de cor para a paleta quente do saguão e painéis alargados 1.45x; o quadro ocupa ~90% da largura e as 3 colunas ficam encaixadas nos painéis pintados via `composables/ui/useTasksScene.ts`, com folhas em escala ≥ 1. No mobile/compacto vira diário com abas.)_
- [x] **Coluna "Contratos Abertos" (To Do):** tarefas `todo` com o pergaminho do `Paper.vue` (não o `UiParchmentCard.vue`: trocar o componente quebraria o zoom com abas). _(22/11/2026: o selo de cera de cada coluna foi removido a pedido do usuário; a estampa do projeto continua no cartão.)_
- [x] **Coluna "Em Andamento" (In Progress):** ampulheta `UiHourglass.vue` quando há pomodoros planejados (progresso = feitos/planejados; não existe estado de "Pomodoro rodando" no front, então "ativa" = ainda faltam pomodoros). _(22/11/2026: selo azul removido, como os demais selos de cera.)_
- [x] **Coluna "Missões Cumpridas" (Done):** medalha `UiRibbonMedal.vue` e carimbo "CUMPRIDO". _(22/11/2026: selo verde removido.)_
- [x] **Accents de Adagas & Pregos:** tarefas atrasadas (`late === true` ou prazo vencido, e não concluídas) eram presas por `UiIronDagger.vue`. _(22/11/2026: adaga removida a pedido do usuário; o atraso segue visível pelo texto "LATE!" na folha.)_
- [x] **Drag and Drop 3D Tilt:** Manter VueDraggable/HTML5 com inclinação sutil 3D (`transform: rotate(-3deg) scale(1.05)`) e SFX de textura de pergaminho/rascunho ao arrastar. _(18/11/2026: o SFX não existia de fato; agora toca `playParchmentDragSound` no início do arrasto, e o painel de destino ganha realce.)_
- [x] **Abas Superiores Mobile:** abas de madeira no `FieldJournalMobile.vue` ("📜 Contratos", "⚔️ Em Combate", "🏆 Vitórias") ligadas a `uiGuild.mobileTaskTab`; aceitam soltar folhas (mover com mouse no modo compacto).
- [x] SFX Dedicados: pena de ganso (ao salvar), martelo de cera (ao concluir) e folha rasgando (ao excluir), sintetizados em `useGuildAudio` (respeitam o mudo).
- [x] Botão de "Retornar ao Saguão" integrado à UI ancorada com transição de volta ao saguão (`.diegetic-btn-back`).
- **Zoom da folha (23/11/2026):** ao abrir, véu escuro com vinheta atrás da folha e palco amplia e se desloca até o cartão clicado (`TasksMural.vue`, `onZoomStart`). Limitado para não mostrar a borda do palco.
- **Chamas animadas (23/11/2026):** tochas e velas pintadas na arte recebem o mesmo sprite de fogo do saguão (`page/MuralFlames.vue`, posições em `MURAL_FLAMES`).
- **Folha ampliada proporcional à tela (23/11/2026):** altura até 92% da tela e no máximo 980 px (`zoomedPaperSize` em `useZoomAnimation.ts`); a animação de abertura usa a mesma conta.
- **Abas de edição (23/11/2026):** conteúdo das folhas em 1.2x no desktop e ocupando a altura da folha; formulário de edição com descrição que cresce e campos alinhados ao papel.
- **Botão "Novo Contrato" (23/11/2026):** tábua de madeira com cores amostradas do quadro e aro de latão, substituindo o SVG de metal (`layout/Main.vue`).
- **Preview dos cartões (23/11/2026):** textos maiores na cena e uma linha de descrição; "Checklist" sem quebra de linha.
- **Imagem do arrasto (23/11/2026):** o clone do cartão usado como imagem do arrasto sai só no `dragend`, não logo após o `dragstart` (hipótese para o problema de drop no Edge, ainda não confirmada).

---

## 📜 5. Sala de Arquivos & Grimórios (`/projects`) 🟡 EM PROGRESSO (8/11)

- [x] Refatorar `pages/projects/index.vue` eliminando os componentes SVG pesados legados `BookShelf.vue` (24KB) e `WoodenTable.vue` (46KB).
- [x] Criar container fluido `GrimoireShelf.vue` baseado em CSS Grid responsivo com textura de carvalho e entalhes rúnicos dourados (`projects-web.webp`).
- [x] Renderizar cada projeto de `projectStore.projects` como um livro de couro `UiGrimoireBook.vue` onde a cor da capa reflete `project.color`.
- [ ] Livros com fecho de correntes e cadeados para projetos estratégicos de longo prazo ou bloqueados.
- [ ] [STAND-BY: ARTÍSTICO] Spritesheet de Livro Abrindo: Animação de páginas folheando ao selecionar projeto.
- [x] **VFX de Aura Rúnica & Poeira:** Brilho rúnico pulsante no hover da lombada e poeira flutuante nos feixes de luz das estantes.
- [x] Refatorar modal `BookModal.vue` estilizado como **Tomo Medieval Aberto em Página Dupla**:
  - Página Esquerda: Visão geral, metadados, objetivo SMART e árvore WBS.
  - Página Direita: Diagrama PERT/CPM, gráficos ECharts (Gantt) e X-Matrix.
- [ ] Renderizar frascos de poções e ampulhetas na prateleira como indicadores visuais de saúde do projeto (EVM).
- [x] Implementar visualização vertical de estante 3x5 scrollável para mobile (`GrimoireGridMobile.vue`).
- [x] Validar a abertura direta de projetos via query params na URL (`/projects?projectId=...`).
- [x] Livro em tela cheia ao selecionar um projeto (`GrimoireBookViewer.vue`): cada página é uma etapa do planejamento (reaproveita as páginas do `BookModal`), fitas por etapa, setas e ←/→, Esc devolve o foco, estado vazio sem planejamento, e "Editar projeto" abre o `BookModal` na mesma etapa.

---

## 🗺️ 6. Sala do Astrolábio & Cartografia (`/calendar`) 🟡 EM PROGRESSO (6/10)

- [x] Criar a nova página Nuxt `pages/calendar/index.vue` e registrar na navegação panorâmica da guilda.
- [x] Criar o componente `components/features/calendar/AstrolabeBoard.vue` para renderizar o quadro de pergaminho 7x5 mounted em madeira (`calendar-web.webp`).
- [x] Implementar cabeçalhos rúnicos para os 7 dias da semana usando `UiRunicTile.vue`.
- [x] Renderizar os 35 quadros de pergaminho do mês atual conectando os prazos do `taskStore`.
- [ ] [STAND-BY: ARTÍSTICO] Spritesheet do Astrolábio / Bússola: Bússola rúnica animada girando no canto da mesa de cartografia.
- [ ] Animação de Desenrolar Mapa: Transição inicial ao entrar na tela de Cartografia.
- [ ] Marcadores de data em miniatura de acampamento e flâmulas com física de balanço.
- [ ] VFX de Linhas de Rota Rúnicas: Traçados brilhantes conectando marcos do PERT e entregas críticas.
- [x] Criar o painel lateral em pergaminho para listar obrigações do dia selecionado.
- [x] Implementar versão adaptativa mobile (`CalendarDrawerMobile.vue`) com bottom-sheet deslizável e gestos touch.

---

## 📋 7. Modais & Overlays Globais Diegéticos 🟡 EM PROGRESSO (7/10)

- [x] Modal de Tarefas Diárias base (Livro do Balcão) funcional (`GuildReceptionDesk.vue`).
- [x] HUD Superior base (Nível, XP, Streak, Mute) em `GuildTopBanner.vue`.
- [x] Widget do livro do balcão para visualização rápida (`GuildDeskBookWidget.vue`).
- [ ] [STAND-BY: ARTÍSTICO] Spritesheet da Capa do Grimório: Animação de capa de couro e fecho metálico abrindo/fechando ao clicar no livro do balcão.
- [ ] **Partículas e Brilho Interno dos Modais:** Efeito de luz mágica saindo de dentro das páginas do Grimório aberto.
- [x] **Polimento dos Overlays Globais:** Transição de `.light-transition-overlay` com vinheta/vignette diegética e partículas de poeira.
- [ ] **Sistema de Notificações Diegéticas:** Notificações globais que aparecem como pergaminhos caindo ou cartas seladas no HUD.
- [x] **Responsividade Fina dos Modais:** Adaptação pixel-perfect do Grimório e HUD para telas mobile ultra-narrow.
- [x] **Barra Flutuante Mobile:** Refinar `GuildMobileJournal.vue` para alternar telas via bottom journal rústico.
- [x] **Controle de Mute/Unmute:** Persistir preferência de áudio no `localStorage` com indicação rúnica no banner.

---

## ⚙️ 8. Pinia Stores & Data Mapping RPG 🟡 EM PROGRESSO (5/6)

- [x] `stores/uiGuild.ts` para gerenciar estado diegético (`activeRoom`, `mobileTaskTab`, `selectedCalendarDate`, `isGrimoireOpen`, `cameraPosition`).
- [x] `stores/task.ts` com getters de tarefas por status e data.
- [x] `stores/project.ts` com metadados visuais (`leatherColor`, `emblemIcon`, `runicCategory`).
- [x] Mapear livro de registro em `GuildReceptionDesk.vue` com métricas acumuladas (XP, missões ativas, taxa de hábitos do dia).
- [ ] Conectar indicadores visuais EVM/PERT às poções e ampulhetas na sala de arquivos.
- [x] Suporte a navegação por Deep Links diegéticos (`/projects?projectId=...` e `/tasks?taskId=...` / `/Task?taskId=...`).

---

## 🛠️ 9. Matriz de Mapeamento de Arquivos e Modificações

| Ação       | Caminho do Arquivo                                        | Descrição da Alteração                                                       |
| :--------- | :-------------------------------------------------------- | :--------------------------------------------------------------------------- |
| `[NEW]`    | `public/images/guild/*.webp`                              | 8 imagens otimizadas da guilda (`entrada-web`, `tasks-mobile`, etc.)         |
| `[NEW]`    | `assets/css/tokens.css`                                   | Variáveis HSL diegéticas (cores de madeiras, pergaminhos, selos, fontes)     |
| `[NEW]`    | `assets/css/diegetic-containers.css`                      | Estilos reutilizáveis para pergaminhos, molduras e livros sem SVGs estáticos |
| `[NEW]`    | `stores/uiGuild.ts`                                       | Store Pinia para controlar sala ativa, abas mobile e estado de animações     |
| `[NEW]`    | `composables/ui/useResponsive.ts`                         | Composable para controle centralizado de breakpoints (960px)                 |
| `[NEW]`    | `components/ui/diegetic/UiParchmentCard.vue`              | Componente de pergaminho flexível com cantos orgânicos HSL                   |
| `[NEW]`    | `components/ui/diegetic/UiWaxSeal.vue`                    | Componente de selo de cera 3D por prioridade e status                        |
| `[NEW]`    | `components/ui/diegetic/UiIronDagger.vue`                 | Componente de adaga fixadora de tarefas atrasadas                            |
| `[NEW]`    | `components/ui/diegetic/UiIronNail.vue`                   | Pregos e percevejos rústicos decorativos                                     |
| `[NEW]`    | `components/ui/diegetic/UiWoodenFrame.vue`                | Moldura container maciça flexível para o Kanban                              |
| `[NEW]`    | `components/ui/diegetic/UiRunicTile.vue`                  | Placa rúnica para títulos de colunas e dias da semana                        |
| `[NEW]`    | `components/ui/diegetic/UiHourglass.vue`                  | Ampulheta com areia animada para Pomodoro                                    |
| `[NEW]`    | `components/ui/diegetic/UiRibbonMedal.vue`                | Medalha de fita para tarefas concluídas                                      |
| `[NEW]`    | `components/ui/diegetic/UiGrimoireBook.vue`               | Livro de couro personalizável por projeto                                    |
| `[NEW]`    | `components/features/tasks/kanban/FieldJournalMobile.vue` | Diário de campo mobile com abas rústicas (Contratos, Combate, Vitórias)      |
| `[NEW]`    | `components/features/projects/GrimoireGridMobile.vue`     | Grade vertical 3x5 de grimórios de projetos para dispositivos móveis         |
| `[NEW]`    | `components/features/calendar/CalendarDrawerMobile.vue`   | Bottom-sheet deslizável diegética de tarefas do dia no calendário            |
| `[NEW]`    | `components/features/projects/GrimoireShelf.vue`          | Estante de madeira maciça responsiva para projetos com entalhes rúnicos      |
| `[NEW]`    | `pages/tasks/index.vue`                                   | Rota canônica `/tasks` para navegação universal sem case-sensitivity         |
| `[NEW]`    | `components/layout/GuildEnvironment.vue`                  | Layout panorâmico raiz com iluminação e parallax                             |
| `[NEW]`    | `pages/calendar/index.vue`                                | Nova rota para a tela de observatório e calendário                           |
| `[MODIFY]` | `nuxt.config.ts`                                          | Importação das fontes do Google (Cinzel, MedievalSharp) e CSS globals        |
| `[MODIFY]` | `layouts/default.vue`                                     | Envelope das páginas no `<GuildEnvironment>` panorâmico                      |
| `[MODIFY]` | `pages/index.vue`                                         | Dashboard do Saguão Central em 3 camadas                                     |
| `[MODIFY]` | `pages/Task/index.vue`                                    | Header diegético com retorno, container stone wall e deep link ?taskId       |
| `[MODIFY]` | `pages/projects/index.vue`                                | Substituição dos SVGs estáticos pesados pela estante de carvalho             |
| `[MODIFY]` | `components/features/projects/BookModal.vue`              | Refatoração para tomo aberto em página dupla com ECharts                     |

---

## ⚡ 10. Otimização & Asset Pipeline 🟡 EM PROGRESSO (4/6)

- [x] Converter todas as imagens estáticas de fundo para o formato `.webp`.
- [x] Comprimir Sprite Sheets em PNG 8-bit sem perda de transparência.
- [x] Aplicar `will-change: transform, filter, background-position` em elementos com animação contínua.
- [x] Realizar pré-carregamento (_preload_) das imagens e sons das telas principais no carregamento do app.
- [ ] **Atlas de Spritesheets (Sprite Packer):** Agrupar múltiplos sprites em atlas unificados para reduzir requisições HTTP.
- [ ] **Profiling de Performance GPU/CPU:** Testes no Chrome DevTools Performance Monitor garantindo 60 FPS estáveis em telas mobile.
