# ADR-006: Arquitetura Diegética de UI em 3 Camadas no Nuxt 3 (RPG UI)

## Contexto

O **SecondBrain** adota uma abordagem de gamificação e produtividade baseada na metáfora de uma **"Guilda de Aventureiros Medieval"**. Em vez de uma interface administrativa genérica (SaaS tradicional com tabelas frias e sidebars genéricas), a experiência do usuário se desenvolve dentro de um ambiente espacial e atmosférico.

Desafios:

- Manter o alto apelo visual (efeitos de iluminação viva, tochas, partículas de lareira, animações de porta em spritesheets e SFX).
- Manter **60 FPS** em computadores e dispositivos móveis sem latência no uso diário.
- Garantir que a UI seja responsiva (Desktop 16:9 vs Mobile 9:16) sem quebrar o alinhamento diegético dos elementos do cenário.

## Decisão

Adotar a **Arquitetura Diegética em 3 Camadas (_Depth Stacking Architecture_)** dentro do Nuxt 3:

1. **Camada 1: World Space Background & Canvas (Cenário Rústico + VFX 2D)**:
   - Renderização da imagem base otimizada (`entrada-bg-clean.webp`).
   - `GuildParticlesCanvas.vue` (Lareira e poeira dourada flutuante via HTML5 Canvas 60 FPS).
   - `GuildVfxLayer.vue` (Labaredas de tochas em loop via Spritesheet CSS `steps()` e `mix-blend-mode: color-dodge`).

2. **Camada 2: Interatividade & Hotspots Diegéticos (Portais & Props)**:
   - Hitboxes invisíveis mapeadas por SVG Paths e CSS posicionados sobre o cenário.
   - Spritesheets interativos (ex: `GuildLibraryPortal.vue` abrindo a porta em 9 frames no hover).
   - Overlay estático da cadeira (`chair.png`) em `z-index: 5` para efeito de profundidade real.
   - Disparo de _Camera Zoom_ e áudios via Web Audio API síntese (`useGuildAudio.ts`).

3. **Camada 3: Screen Space HUD Ancorado (Interface Física do Usuário)**:
   - `guild-hud-layer` ancorada com `pointer-events: none` contendo os elementos de controle.
   - Banner de boas-vindas/mute (`GuildTopBanner.vue`), Grimório de Registro (`GuildReceptionDesk.vue`) e Diário de Campo Mobile (`GuildMobileJournal.vue`).

## Drivers (por que essa escolha atende aos requisitos)

- **Separação de Camadas Físicas**: Garante que overlays visuais não bloqueiem cliques nos botões da interface.
- **Responsividade Travada em Aspect-Ratio (16:9 / 9:16)**: Mantém os hotspots perfeitamente alinhados independentemente da resolução da janela.
- **Desempenho GPU-Accelerated**: Uso de propriedades como `transform`, `opacity` e `will-change` garantem aceleração por hardware sem repinturas (_repaint/reflow_) pesadas.
- **Audio Diegético NATIVO**: Síntese e reprodução de som sem dependências externas pesadas via Web Audio API (`AudioContext`).

## Detalhes de Aplicação no SecondBrain

### Safe Zone Engine (`pages/index.vue`)

```html
<div class="viewport" :class="{ 'is-mobile-view': isMobile }">
  <!-- Camada de Transição de Luz -->
  <div
    class="light-transition-overlay"
    :class="{ 'is-active': isTransitioning }"
  ></div>

  <!-- Container World Space (16:9) -->
  <div class="safe-zone" :style="{ transformOrigin: zoomTransformOrigin }">
    <img src="/images/guild/entrada-bg-clean.webp" class="master-bg" />
    <GuildParticlesCanvas />
    <GuildVfxLayer v-if="!isMobile" />
    <GuildNpcSpeechBubble v-if="!isMobile" />
    <GuildArchPortal />
    <GuildDiegeticHotspots />
  </div>

  <!-- Camada Screen Space (HUD) -->
  <div class="guild-hud-layer">
    <GuildTopBanner />
    <GuildReceptionDesk />
  </div>
</div>
```

## Onde no código

- **Página Principal do Saguão**: [Frontend/pages/index.vue](../../Frontend/pages/index.vue)
- **Componentes do Saguão**:
  - [Frontend/components/features/hall/GuildVfxLayer.vue](../../Frontend/components/features/hall/GuildVfxLayer.vue)
  - [Frontend/components/features/hall/GuildParticlesCanvas.vue](../../Frontend/components/features/hall/GuildParticlesCanvas.vue)
  - [Frontend/components/features/hall/GuildLibraryPortal.vue](../../Frontend/components/features/hall/GuildLibraryPortal.vue)
  - [Frontend/components/features/hall/GuildArchPortal.vue](../../Frontend/components/features/hall/GuildArchPortal.vue)
  - [Frontend/components/features/hall/GuildDiegeticHotspots.vue](../../Frontend/components/features/hall/GuildDiegeticHotspots.vue)
  - [Frontend/components/features/hall/GuildReceptionDesk.vue](../../Frontend/components/features/hall/GuildReceptionDesk.vue)
- **Composables**:
  - [Frontend/composables/ui/useGuildAudio.ts](../../Frontend/composables/ui/useGuildAudio.ts)
  - [Frontend/composables/ui/useResponsive.ts](../../Frontend/composables/ui/useResponsive.ts)
  - [Frontend/composables/ui/useZoomAnimation.ts](../../Frontend/composables/ui/useZoomAnimation.ts)

## Consequências

### Positivas

- Imersão total do usuário ("Wow Factor") mantendo usabilidade e clareza de tarefas.
- Transições de rota suaves com sensação de movimento dentro do mapa da guilda.
- Suporte fluido a telas mobile e desktop.

### Negativas / Trade-offs

- Requer assets gráficos rigorosamente alinhados (spritesheets e overlays com dimensões exatas).
- Maior complexidade na gestão de z-index e eventos de ponteiro.

## Validação (Critérios de Aceite)

- Taxa de quadros constante de 60 FPS monitorada no Chrome DevTools Performance.
- Abertura de porta e efeitos sonoros disparam instantaneamente no hover sem atraso perceptível.

## ADRs Relacionadas

- ADR-005: [005-visualization-engine.md](005-visualization-engine.md)
- ADR-007: [007-frontend-state-management.md](007-frontend-state-management.md)
