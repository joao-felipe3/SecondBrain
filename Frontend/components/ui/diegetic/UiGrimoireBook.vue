<template>
  <div
    class="ui-grimoire-book"
    :class="{
      'is-interactive': interactive,
      'is-locked': isLocked,
    }"
    :style="bookStyle"
    :role="interactive ? 'button' : undefined"
    :tabindex="interactive ? 0 : undefined"
    :aria-label="ariaLabel"
    @click="handleClick"
    @keydown.enter.prevent="handleKey"
    @keydown.space.prevent="handleKey"
  >
    <!--
      Corpo 3D: a capa pintada é a face da frente; lombada (esquerda) e bloco de páginas (direita) dão
      espessura. Girado em --book-turn (a estante varia por posição); com 0° fica de frente, como antes.
    -->
    <div class="tome-body" aria-hidden="true">
      <div class="tome-spine">
        <!-- título gravado em dourado na lombada (visível quando o livro está de lado) -->
        <span class="tome-spine-title">{{ title }}</span>
      </div>
      <div class="tome-fore" />
      <div class="tome">
        <div class="tome-art" />
        <div class="tome-tint" />
        <div class="tome-sheen" />

        <!-- Inicial gravada no medalhão de latão -->
        <span class="tome-initial">{{ initial }}</span>

        <!-- Etiqueta de papel colada sobre a placa, com o título à mão -->
        <span class="tome-label">
          <span class="tome-label-text" :style="{ fontSize: labelFontSize }">{{ title }}</span>
        </span>

        <!-- Cadeado de ferro sobre a fivela quando o tomo está trancado -->
        <svg v-if="isLocked" class="tome-lock" viewBox="0 0 24 28">
          <path
            d="M6 12V8a6 6 0 0 1 12 0v4"
            fill="none"
            stroke="#2a2118"
            stroke-width="3"
            stroke-linecap="round"
          />
          <path d="M6 12V8a6 6 0 0 1 12 0v4" fill="none" stroke="#9c8f7c" stroke-width="1.4" />
          <rect x="3" y="11" width="18" height="15" rx="2.5" fill="url(#lockBody)" stroke="#1d160f" />
          <circle cx="12" cy="17.5" r="2" fill="#1d160f" />
          <rect x="11.2" y="18" width="1.6" height="4.5" rx="0.8" fill="#1d160f" />
          <defs>
            <linearGradient id="lockBody" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#8d7b5e" />
              <stop offset="1" stop-color="#4a3c2a" />
            </linearGradient>
          </defs>
        </svg>

        <!-- Luz da sala sobre o tomo inteiro (couro, latão, etiqueta): quente em cima, sombra embaixo -->
        <div class="tome-shade" />
      </div>
    </div>

    <!-- Plaquinha com missões e progresso (aparece ao passar o mouse ou focar) -->
    <div v-if="taskCount !== undefined || progress !== undefined" class="cover-meta">
      <span v-if="taskCount !== undefined" class="meta-tasks">
        {{ taskCount }} {{ taskCount === 1 ? 'missão' : 'missões' }}
      </span>
      <span v-if="progress !== undefined" class="meta-progress">{{ Math.round(progress) }}%</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { leatherTone } from '~/composables/ui/useLibraryScene';

const props = withDefaults(
  defineProps<{
    title: string;
    color?: string;
    taskCount?: number;
    progress?: number;
    isLocked?: boolean;
    interactive?: boolean;
  }>(),
  {
    color: '#8b4513',
    isLocked: false,
    interactive: true,
  },
);

const emit = defineEmits<{
  (e: 'click', event: Event): void;
}>();

function handleClick(event: MouseEvent) {
  if (props.interactive) {
    emit('click', event);
  }
}

// Enter/Espaço abrem o livro como um botão (teclado)
function handleKey(event: KeyboardEvent) {
  if (props.interactive) {
    emit('click', event);
  }
}

/** Primeira letra do título (ignora espaços e símbolos iniciais). */
const initial = computed(() => {
  const match = String(props.title || '').match(/[\p{L}\p{N}]/u);
  return match ? match[0].toLocaleUpperCase('pt-BR') : '✦';
});

/**
 * Tamanho do título na etiqueta: cabe ~9 letras por linha no tamanho padrão; palavras maiores
 * reduzem a fonte para não quebrar no meio (ex.: "Certificação").
 */
const labelFontSize = computed(() => {
  const longest = Math.max(
    1,
    ...String(props.title || '')
      .split(/\s+/)
      .map((w) => w.length),
  );
  const scale = Math.min(1, 9 / longest);
  return `${(7.2 * Math.max(scale, 0.62)).toFixed(2)}cqh`;
});

const ariaLabel = computed(() => {
  const missions =
    props.taskCount !== undefined
      ? `, ${props.taskCount} ${props.taskCount === 1 ? 'missão' : 'missões'}`
      : '';
  const locked = props.isLocked ? ', trancado' : '';
  return `Abrir livro ${props.title}${missions}${locked}`;
});

const bookStyle = computed(() => {
  return {
    '--book-accent-color': props.color || '#8b4513',
    '--book-leather': leatherTone(props.color || '#8b4513'),
  };
});
</script>

<style scoped>
/*
 * Arte: /imagens/grimoire/tome-base.webp (519×720, couro cinza neutro) e tome-leather-mask.webp
 * (alfa = couro). Posições do medalhão e da placa medidas nessa arte, em % do livro.
 */
.ui-grimoire-book {
  position: relative;
  /* Tamanho pode ser sobrescrito pelo pai (ex.: capas nas prateleiras da estante) */
  width: var(--book-w, 144px);
  height: var(--book-h, 200px);
  container-type: size;
  transition:
    transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1),
    filter 0.25s ease;
  /*
   * Sombra que segue o recorte do livro: contorno escuro fino + sombra ambiente projetada no fundo da
   * baia, para cima (o livro encosta no painel). Nada desce sobre a frente da tábua, senão o livro "flutua".
   */
  filter: drop-shadow(0 0 0.6px rgba(20, 9, 3, 0.9)) drop-shadow(0 -3px 7px rgba(14, 6, 2, 0.55));
  user-select: none;
  font-family: var(--font-guild-title, 'Cinzel', serif);
}

/* Sombra de contato: onde o livro toca a prateleira */
.ui-grimoire-book::before {
  content: '';
  position: absolute;
  left: -4%;
  right: -4%;
  bottom: -2.5%;
  height: 7%;
  border-radius: 50%;
  background: radial-gradient(
    ellipse at 50% 40%,
    rgba(12, 5, 1, 0.75) 0%,
    rgba(12, 5, 1, 0.35) 45%,
    transparent 72%
  );
  pointer-events: none;
  transition: opacity 0.25s ease;
}

.ui-grimoire-book.is-interactive:hover::before,
.ui-grimoire-book.is-interactive:focus-visible::before {
  opacity: 0.35;
}

.ui-grimoire-book.is-interactive {
  cursor: pointer;
}

.ui-grimoire-book.is-interactive:hover,
.ui-grimoire-book.is-interactive:focus-visible {
  transform: translateY(-6%) scale(1.04) rotate(-1deg);
  filter: drop-shadow(-3px 6px 6px rgba(0, 0, 0, 0.6)) drop-shadow(0 0 10px rgba(255, 196, 92, 0.45));
  z-index: 2;
}

.ui-grimoire-book.is-interactive:focus-visible {
  outline: 2px solid #fde047;
  outline-offset: 4px;
}

@media (prefers-reduced-motion: reduce) {
  .ui-grimoire-book {
    transition: none;
  }

  .ui-grimoire-book.is-interactive:hover,
  .ui-grimoire-book.is-interactive:focus-visible {
    transform: none;
  }
}

/* ---------- Corpo 3D ---------- */
.ui-grimoire-book {
  perspective: 380px;
  /* ponto de vista na altura da base: a base do livro fica reta sobre a tábua, qualquer que seja o giro */
  perspective-origin: 50% 100%;
  /* espessura do tomo (em % da largura do próprio livro) */
  --tome-depth: 40cqw;
}

.tome-body {
  position: absolute;
  inset: 0;
  transform-style: preserve-3d;
  /* gira em Y e inclina o topo uns graus para trás, encostando no fundo da baia */
  /* inclinação aplicada no eixo do próprio livro (aresta da base), depois o giro: a base não sai da tábua */
  transform: rotateY(var(--book-turn, 0deg)) rotateX(var(--book-lean, 0deg));
  transform-origin: 50% 100%;
}

.tome {
  position: absolute;
  inset: 0;
  /* a mistura da tinta fica restrita ao próprio livro */
  isolation: isolate;
}

/* Lombada: dobra para trás a partir da borda esquerda da capa (aparece quando o livro gira para a direita) */
.tome-spine {
  position: absolute;
  /* o canto de cima da capa pintada é arredondado (começa em ~1,5%): a lombada não passa dele */
  top: 1.4%;
  bottom: 0.6%;
  right: 98.6%;
  width: var(--tome-depth);
  transform-origin: 100% 50%;
  transform: rotateY(-90deg);
  backface-visibility: hidden;
  /* cabeça e pé da lombada arredondados (couro dobrado sobre o cabeceado) */
  border-radius: 45% 45% 3px 3px / 2.6% 2.6% 3px 3px;
  background:
    /* coifa: borda de couro dobrada no alto (reflexo) e o cabeceado logo abaixo (linha escura) */
    linear-gradient(
      to bottom,
      rgba(255, 222, 176, 0.32) 0,
      rgba(255, 222, 176, 0.14) 1.3%,
      rgba(18, 8, 2, 0.6) 1.3%,
      rgba(18, 8, 2, 0.6) 2.1%,
      rgba(0, 0, 0, 0.18) 2.1%,
      transparent 7%
    ),
    /* nervuras da lombada */
    linear-gradient(
        to bottom,
        transparent 0 17%,
        rgba(0, 0, 0, 0.45) 17% 18%,
        rgba(255, 220, 170, 0.18) 18% 19.5%,
        transparent 19.5% 37%,
        rgba(0, 0, 0, 0.45) 37% 38%,
        rgba(255, 220, 170, 0.18) 38% 39.5%,
        transparent 39.5% 60%,
        rgba(0, 0, 0, 0.45) 60% 61%,
        rgba(255, 220, 170, 0.18) 61% 62.5%,
        transparent 62.5% 82%,
        rgba(0, 0, 0, 0.45) 82% 83%,
        rgba(255, 220, 170, 0.18) 83% 84.5%,
        transparent 84.5%
      ),
    /* sombra geral: a lombada recebe menos luz que a capa */
    linear-gradient(rgba(28, 12, 4, 0.28), rgba(28, 12, 4, 0.28)),
    /* volume arredondado + luz da sala caindo para a base */
    linear-gradient(
        90deg,
        rgba(0, 0, 0, 0.55) 0%,
        rgba(0, 0, 0, 0.15) 35%,
        rgba(255, 210, 160, 0.12) 60%,
        rgba(0, 0, 0, 0.35) 100%
      ),
    linear-gradient(to bottom, rgba(0, 0, 0, 0) 40%, rgba(0, 0, 0, 0.4) 100%),
    var(--book-leather, #6b3a1e);
  box-shadow: inset 0 0 0 1px rgba(20, 9, 3, 0.6);
}

/* Título na lombada: plaqueta de couro escuro com letras douradas, entre a 1ª e a última nervura */
.tome-spine-title {
  position: absolute;
  left: 13%;
  right: 13%;
  top: 22%;
  bottom: 22%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  box-sizing: border-box;
  padding: 3% 0;
  writing-mode: vertical-rl;
  text-align: center;
  font-family: 'MedievalSharp', var(--font-guild-title, 'Cinzel', serif);
  font-size: 7.2cqh;
  line-height: 1.05;
  color: #e2bf72;
  text-shadow:
    0 0.06em 0 rgba(20, 9, 2, 0.9),
    0 -0.04em 0 rgba(255, 236, 180, 0.35);
  background: linear-gradient(90deg, rgba(14, 6, 2, 0.55), rgba(30, 14, 5, 0.35), rgba(14, 6, 2, 0.55));
  border-top: 1px solid rgba(214, 170, 90, 0.55);
  border-bottom: 1px solid rgba(214, 170, 90, 0.55);
  overflow-wrap: anywhere;
}

/* Bloco de páginas: dobra para trás a partir da borda direita (aparece quando o livro gira para a esquerda) */
.tome-fore {
  position: absolute;
  top: 2.5%;
  bottom: 1.5%;
  left: 96.8%;
  width: var(--tome-depth);
  transform-origin: 0 50%;
  transform: rotateY(90deg);
  backface-visibility: hidden;
  background:
    /* capa de trás (couro) na ponta, e a borda da capa da frente */
    linear-gradient(
      90deg,
      rgba(70, 40, 20, 0.95) 0 5%,
      transparent 5% 90%,
      var(--book-leather, #6b3a1e) 90% 100%
    ),
    /* folhas */ repeating-linear-gradient(90deg, #b99a64 0 1px, #94784a 1px 2px, #a88b58 2px 3px),
    #a88b58;
  box-shadow:
    inset 0 6px 6px -4px rgba(60, 30, 10, 0.55),
    inset 0 -8px 8px -4px rgba(40, 20, 6, 0.65);
  /* lateral fora da luz direta da lanterna */
  filter: brightness(0.78);
}

.tome-art {
  position: absolute;
  inset: 0;
  background: url('/imagens/grimoire/tome-base.webp') center / 100% 100% no-repeat;
}

/* Cor do projeto aplicada só no couro: overlay sobre o cinza médio dá couro tingido com textura e desgaste */
.tome-tint {
  position: absolute;
  inset: 0;
  /* couro: cor do projeto com saturação e brilho limitados (leatherTone) */
  background: var(--book-leather, var(--book-accent-color));
  mix-blend-mode: overlay;
  opacity: 0.92;
  -webkit-mask: url('/imagens/grimoire/tome-leather-mask.webp') center / 100% 100% no-repeat;
  mask: url('/imagens/grimoire/tome-leather-mask.webp') center / 100% 100% no-repeat;
}

/* reflexo quente de vela no canto superior (só no couro), para assentar o livro na luz da sala */
.tome-sheen {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at 30% 18%, rgba(255, 196, 120, 0.22) 0%, transparent 55%);
  mix-blend-mode: soft-light;
  -webkit-mask: url('/imagens/grimoire/tome-leather-mask.webp') center / 100% 100% no-repeat;
  mask: url('/imagens/grimoire/tome-leather-mask.webp') center / 100% 100% no-repeat;
  pointer-events: none;
}

/*
 * Luz da sala: multiplica o tomo inteiro (inclusive etiqueta e latão) por um degradê quente que escurece
 * para a base, onde a prateleira de cima e o próprio nicho fazem sombra. Recortado no formato do livro.
 */
.tome-shade {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(
      90deg,
      rgba(120, 72, 40, 0.55) 0%,
      transparent 14%,
      transparent 86%,
      rgba(120, 72, 40, 0.45) 100%
    ),
    linear-gradient(
      to bottom,
      rgb(236, 196, 150) 0%,
      rgb(224, 172, 124) 45%,
      rgb(176, 120, 78) 88%,
      rgb(130, 84, 52) 100%
    );
  mix-blend-mode: multiply;
  -webkit-mask: url('/imagens/grimoire/tome-base.webp') center / 100% 100% no-repeat;
  mask: url('/imagens/grimoire/tome-base.webp') center / 100% 100% no-repeat;
  pointer-events: none;
}

/* Medalhão: centro (52,3% ; 34,4%), diâmetro ~33% da largura */
.tome-initial {
  position: absolute;
  left: 52.3%;
  top: 34.4%;
  transform: translate(-50%, -50%);
  font-family: 'MedievalSharp', var(--font-guild-title, 'Cinzel', serif);
  font-size: 17cqh;
  line-height: 1;
  color: #5b4317;
  /* gravado no latão: sombra escura em cima, brilho embaixo */
  text-shadow:
    0 -0.04em 0 rgba(30, 18, 4, 0.75),
    0 0.05em 0 rgba(255, 232, 160, 0.55);
  opacity: 0.92;
}

/* Etiqueta de papel sobre a placa (centro 52,3% ; 68,4%), mais larga que a placa para caber o nome */
.tome-label {
  position: absolute;
  left: 51.5%;
  top: 68.4%;
  width: 70%;
  height: 21%;
  transform: translate(-50%, -50%) rotate(-1.2deg);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 5%;
  box-sizing: border-box;
  background:
    radial-gradient(ellipse at 50% 50%, transparent 55%, rgba(120, 78, 30, 0.35) 100%),
    linear-gradient(175deg, #efe0bb 0%, #e2cc98 55%, #d4b97f 100%);
  border-radius: 1.5px;
  box-shadow:
    0 1px 1.5px rgba(30, 15, 4, 0.55),
    inset 0 0 0 0.6px rgba(110, 72, 28, 0.55),
    inset 0 0 6px rgba(140, 92, 36, 0.35);
  /* bordas levemente irregulares de papel recortado à mão */
  clip-path: polygon(
    1% 4%,
    30% 0%,
    62% 3%,
    99% 1%,
    100% 52%,
    98% 97%,
    66% 100%,
    34% 96%,
    0% 99%,
    2% 50%
  );
}

.tome-label-text {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-align: center;
  font-family: 'MedievalSharp', var(--font-guild-title, 'Cinzel', serif);
  font-size: 7.2cqh;
  line-height: 1.05;
  color: #3a2410;
  overflow-wrap: break-word;
  hyphens: auto;
}

/* Cadeado sobre a fivela (direita, ~47% da altura) */
.tome-lock {
  position: absolute;
  left: 88%;
  top: 47.5%;
  width: 16cqh;
  transform: translate(-50%, -50%);
  filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.6));
}

.is-locked .tome-art,
.is-locked .tome-tint {
  filter: saturate(0.7) brightness(0.85);
}

/* Missões e progresso: plaquinha que surge abaixo do livro */
.cover-meta {
  position: absolute;
  left: 50%;
  top: 100%;
  transform: translate(-50%, 4px);
  display: flex;
  gap: 0.4rem;
  align-items: center;
  white-space: nowrap;
  padding: 0.15rem 0.45rem;
  border-radius: 3px;
  background: rgba(22, 13, 6, 0.92);
  border: 1px solid hsl(38, 55%, 42%);
  color: hsl(40, 70%, 86%);
  font-family: var(--font-guild-body, sans-serif);
  font-size: 0.68rem;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.18s ease;
  z-index: 3;
}

.meta-progress {
  color: #fcd34d;
  font-weight: 700;
}

.ui-grimoire-book:hover .cover-meta,
.ui-grimoire-book:focus-visible .cover-meta {
  opacity: 1;
}
</style>
