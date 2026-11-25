<template>
  <Teleport to="body">
    <!-- Mesma moldura do livro de edição (BookModal): overlay, contêiner, sprite e livro -->
    <div
      v-if="isOpen && project"
      ref="overlayEl"
      class="book-modal-overlay grimoire-viewer"
      @click.self="close"
    >
      <div
        ref="containerEl"
        class="container"
        role="dialog"
        aria-modal="true"
        aria-labelledby="grimoire-viewer-title"
        @keydown="onDialogKeydown"
      >
        <h2 id="grimoire-viewer-title" class="sr-only">{{ project.name }}</h2>

        <button
          ref="closeBtn"
          type="button"
          class="icon-floating-close"
          aria-label="Fechar livro"
          @click="close"
        >
          ✕
        </button>

        <button
          type="button"
          class="nav-arrow nav-prev"
          :disabled="isFirst || !hasPlanning"
          aria-label="Página anterior"
          @click="prev"
        >
          ◀
        </button>

        <div ref="spriteEl" class="sprite-wrapper">
          <div class="book">
            <!-- Quadro do sprite correspondente à etapa atual (sem a animação de virar páginas) -->
            <div
              class="sprite"
              aria-hidden="true"
              :style="{ backgroundPosition: spriteFramePosition, animation: 'none' }"
            ></div>
            <div class="carousel" :style="{ '--slides': TOTAL_CHAPTERS }">
              <div ref="contentEl" class="carousel-item active">
                <!-- Estado vazio: projeto sem planejamento -->
                <div v-if="!hasPlanning" class="book-empty">
                  <span class="empty-icon" aria-hidden="true">📜</span>
                  <h3 class="empty-title">Este tomo ainda está em branco</h3>
                  <p class="empty-text">
                    Defina o objetivo SMART, monte a EAP e cadastre as primeiras missões. Cada etapa do
                    planejamento ganha uma página neste livro.
                  </p>
                  <button type="button" class="action-btn primary" @click="openEditor(1)">
                    Começar planejamento
                  </button>
                </div>

                <component
                  :is="activeComponent"
                  v-else
                  :key="displayedChapter.id"
                  :project="project"
                  :editing="false"
                />
              </div>
            </div>
          </div>
        </div>

        <button
          type="button"
          class="nav-arrow nav-next"
          :disabled="isLast || !hasPlanning"
          aria-label="Próxima página"
          @click="next"
        >
          ▶
        </button>

        <nav v-if="hasPlanning" class="chapter-ribbons" aria-label="Etapas do planejamento">
          <button
            v-for="(chapter, index) in GRIMOIRE_CHAPTERS"
            :key="chapter.id"
            type="button"
            class="chapter-ribbon"
            :class="{ 'is-active': index === current }"
            :aria-current="index === current ? 'page' : undefined"
            :aria-label="`Ir para a etapa ${index + 1}: ${chapter.title}`"
            @click="goTo(index)"
          >
            <span aria-hidden="true">{{ chapter.icon }}</span>
            <span class="ribbon-label">{{ chapter.title }}</span>
          </button>
        </nav>

        <div v-if="hasPlanning" class="actions-bar">
          <span class="page-indicator" aria-live="polite">
            Etapa {{ current + 1 }} de {{ TOTAL_CHAPTERS }} · {{ activeChapter.title }}
          </span>
          <button
            type="button"
            class="action-btn"
            :aria-label="`Editar ${project.name}`"
            @click="openEditor(current)"
          >
            Editar projeto
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch, type Component } from 'vue';
import GeneralInfoPage from './pages/GeneralInfoPage.vue';
import SmartObjectivesPage from './pages/SmartObjectivesPage.vue';
import WBSPage from './pages/WBSPage.vue';
import CriticalPathPage from './pages/CriticalPathPage.vue';
import RTMPage from './pages/RTMPage.vue';
import RiskPage from './pages/RiskPage.vue';
import GanttPage from './pages/GanttPage.vue';
import PertDiagramPage from './pages/PertDiagramPage.vue';
import XMatrixPage from './pages/XMatrixPage.vue';
import BacklogAndProgress from './pages/BacklogAndProgress.vue';
import {
  GRIMOIRE_CHAPTERS,
  clampChapter,
  grimoireKeyAction,
  hasProjectPlanning,
  useGrimoireBook,
} from '~/composables/features/useGrimoireBook';
import type { Project } from '~/models/Project';

const TOTAL_CHAPTERS = GRIMOIRE_CHAPTERS.length;

// Componente de cada etapa, pela mesma ordem de GRIMOIRE_CHAPTERS
const CHAPTER_COMPONENTS: Record<string, Component> = {
  geral: GeneralInfoPage,
  smart: SmartObjectivesPage,
  eap: WBSPage,
  'caminho-critico': CriticalPathPage,
  rtm: RTMPage,
  riscos: RiskPage,
  gantt: GanttPage,
  pert: PertDiagramPage,
  'x-matrix': XMatrixPage,
  backlog: BacklogAndProgress,
};

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

const props = withDefaults(
  defineProps<{
    isOpen: boolean;
    project: Project | null;
    initialChapter?: number;
    /** Posição da capa clicada: o livro sai dela na abertura */
    origin?: DOMRect | null;
  }>(),
  { initialChapter: 0, origin: null },
);

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'open-editor', chapter: number): void;
}>();

const containerEl = ref<HTMLElement | null>(null);
const spriteEl = ref<HTMLElement | null>(null);
const overlayEl = ref<HTMLElement | null>(null);
const closeBtn = ref<HTMLButtonElement | null>(null);
let returnFocusEl: HTMLElement | null = null;

const GOLD_GLOW = 'rgba(253, 224, 71, 0.55)';
const SHADOW = '0 30px 80px rgba(0, 0, 0, 0.7)';

/**
 * Abertura: o livro sai da capa clicada, gira levemente como se fosse aberto,
 * e um brilho dourado passa por ele. O fundo escurece em paralelo.
 */
function playOpenAnimation() {
  if (typeof window === 'undefined' || !spriteEl.value || !overlayEl.value) return;
  if (typeof spriteEl.value.animate !== 'function') return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

  const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
  const book = spriteEl.value;
  const target = book.getBoundingClientRect();
  const from = props.origin;

  // O fundo escurece a partir da capa
  overlayEl.value.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 520, easing: 'ease-out' });

  if (from && from.width > 0 && from.height > 0) {
    // A capa clicada vira uma "sombra" que voa até a posição do livro e se funde com ele
    const ghost = document.createElement('div');
    ghost.className = 'book-ghost';
    // Estilos inline: o elemento fica no body, fora do escopo CSS deste componente
    Object.assign(ghost.style, {
      position: 'fixed',
      zIndex: '3001',
      pointerEvents: 'none',
      boxShadow: '4px 8px 20px rgba(0, 0, 0, 0.5), 0 0 30px rgba(253, 224, 71, 0.4)',
    });
    ghost.style.background = `linear-gradient(90deg, rgba(0, 0, 0, 0.35) 0%, rgba(255, 255, 255, 0.08) 4%, transparent 9%), ${accentColor.value}`;
    document.body.appendChild(ghost);

    const box = (r: { left: number; top: number; width: number; height: number }) => ({
      left: `${r.left}px`,
      top: `${r.top}px`,
      width: `${r.width}px`,
      height: `${r.height}px`,
    });

    const ghostAnim = ghost.animate(
      [
        { ...box(from), opacity: 1, borderRadius: '4px 8px 8px 4px' },
        { ...box(target), opacity: 1, borderRadius: '6px 14px 14px 6px', offset: 0.75 },
        { ...box(target), opacity: 0, borderRadius: '6px 14px 14px 6px' },
      ],
      // Começo mais suave: a sombra sai da capa antes de acelerar até o livro
      { duration: 760, easing: 'cubic-bezier(0.45, 0, 0.2, 1)', fill: 'forwards' },
    );
    ghostAnim.onfinish = () => ghost.remove();
    ghostAnim.oncancel = () => ghost.remove();

    // O livro aparece conforme a sombra chega, já com o brilho dourado
    book.animate(
      [
        { opacity: 0, transform: 'scale(0.98)', boxShadow: `0 0 0 rgba(253, 224, 71, 0), ${SHADOW}` },
        { opacity: 1, transform: 'none', boxShadow: `0 0 120px ${GOLD_GLOW}, ${SHADOW}`, offset: 0.45 },
        { opacity: 1, transform: 'none', boxShadow: `0 0 60px rgba(253, 224, 71, 0.12), ${SHADOW}` },
      ],
      { duration: 560, delay: 380, easing: 'ease-out', fill: 'backwards' },
    );
    return;
  }

  // Sem capa de origem (ex.: navegação mobile): cresce do centro
  book.animate(
    [
      { opacity: 0, transform: 'scale(0.9)' },
      { opacity: 1, transform: 'none' },
    ],
    { duration: 480, easing: EASE, fill: 'backwards' },
  );
}

const { current, isFirst, isLast, goTo, next, prev } = useGrimoireBook();

const hasPlanning = computed(() => hasProjectPlanning(props.project));
const accentColor = computed(() => props.project?.color || '#8b4513');
const activeChapter = computed(() => GRIMOIRE_CHAPTERS[current.value]);

// Conteúdo exibido: acompanha `current`, mas ao trocar de página só muda no meio da virada
const displayedIndex = ref(0);
const displayedChapter = computed(() => GRIMOIRE_CHAPTERS[displayedIndex.value]);
const activeComponent = computed(() => CHAPTER_COMPONENTS[displayedChapter.value.id]);
const contentEl = ref<HTMLElement | null>(null);

// A folha do sprite traz quadros da animação de virar página (aba de papel acima do livro).
// Parado, o livro mostra o quadro limpo (o primeiro); a animação só roda ao trocar de página.
const SPRITE_COLUMNS = 5;
const CLEAN_FRAME = 0;
const PAGE_TURN_STEP_MS = 45;
const PAGE_TURN_FRAMES = [0, 1, 2, 3, 4, 5, 6];
const spriteFramePosition = computed(() => '0px 0px');

function spriteFrameAt(frame: number, tw: number, th: number): string {
  return `${-(frame % SPRITE_COLUMNS) * tw}px ${-Math.floor(frame / SPRITE_COLUMNS) * th}px`;
}

/**
 * Vira a página: percorre os quadros da folha de `from` até `to` e volta ao quadro limpo.
 * Devolve a duração em ms (0 se a animação não pôde tocar).
 */
function playPageTurn(from: number, to: number): number {
  if (from === to || typeof window === 'undefined') return 0;
  // Decisão do produto: a virada toca mesmo com movimento reduzido. É curta (0,7 s), só troca
  // quadros do livro (sem deslocamento) e é a resposta visual à ação do usuário.
  const sprite = spriteEl.value?.querySelector<HTMLElement>('.sprite');
  if (!sprite || typeof sprite.animate !== 'function') return 0;

  const tw = sprite.offsetWidth;
  const th = sprite.offsetHeight;
  // A folha tem 7 quadros da virada (0 a 6): avançar percorre de 0 a 6, voltar de 6 a 0
  const frames = to > from ? [...PAGE_TURN_FRAMES] : [...PAGE_TURN_FRAMES].reverse();

  const keyframes: Keyframe[] = frames.map((frame, i) => ({
    backgroundPosition: spriteFrameAt(frame, tw, th),
    offset: i / frames.length,
    easing: 'steps(1, end)',
  }));
  keyframes.push({ backgroundPosition: spriteFrameAt(CLEAN_FRAME, tw, th), offset: 1 });

  const duration = frames.length * PAGE_TURN_STEP_MS;
  sprite.animate(keyframes, { duration, fill: 'none' });
  return duration;
}

let contentAnimation: Animation | null = null;
let swapTimer: number | null = null;

function cancelContentTransition() {
  if (swapTimer !== null) window.clearTimeout(swapTimer);
  swapTimer = null;
  contentAnimation?.cancel();
  contentAnimation = null;
}

/**
 * Conteúdo da página acompanha a virada: o conteúdo atual some no começo, a página nova
 * entra no meio da virada e aparece até o fim. Sem animação, troca na hora.
 */
function revealPage(to: number, duration: number) {
  cancelContentTransition();
  const el = contentEl.value;
  if (!el || duration <= 0 || typeof el.animate !== 'function') {
    displayedIndex.value = to;
    return;
  }

  const fadeOutMs = duration * 0.3;
  const swapAtMs = duration * 0.45;
  const fadeInMs = duration * 0.55;

  contentAnimation = el.animate([{ opacity: 1 }, { opacity: 0 }], {
    duration: fadeOutMs,
    easing: 'ease-in',
    fill: 'forwards',
  });

  swapTimer = window.setTimeout(async () => {
    swapTimer = null;
    displayedIndex.value = to;
    await nextTick();
    contentAnimation?.cancel();
    contentAnimation = el.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: fadeInMs,
      easing: 'ease-out',
    });
  }, swapAtMs);
}

// Troca de página (setas, teclado ou fitas): vira a página e revela o conteúdo novo junto.
// Ao abrir o livro, posiciona direto, sem animação.
let skipPageTurn = false;
watch(current, (to, from) => {
  if (skipPageTurn || !props.isOpen) {
    cancelContentTransition();
    displayedIndex.value = to;
    return;
  }
  revealPage(to, playPageTurn(from, to));
});

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  );
}

function onWindowKeydown(event: KeyboardEvent) {
  const action = grimoireKeyAction(event.key);
  if (!action) return;

  if (action === 'close') {
    event.preventDefault();
    close();
    return;
  }

  // Setas não trocam de página enquanto o usuário digita em um campo
  if (isTypingTarget(event.target)) return;

  event.preventDefault();
  if (action === 'prev') prev();
  else next();
}

// Mantém o foco dentro do livro (dialog modal)
function onDialogKeydown(event: KeyboardEvent) {
  if (event.key !== 'Tab' || !containerEl.value) return;

  const items = Array.from(containerEl.value.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  if (items.length === 0) {
    event.preventDefault();
    return;
  }

  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;
  const insideDialog = active instanceof HTMLElement && containerEl.value.contains(active);

  if (event.shiftKey && (active === first || !insideDialog)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (active === last || !insideDialog)) {
    event.preventDefault();
    first.focus();
  }
}

function close() {
  emit('close');
}

function openEditor(chapter: number) {
  emit('open-editor', chapter);
}

watch(
  () => props.isOpen,
  async (open) => {
    if (typeof window === 'undefined') return;

    if (open) {
      returnFocusEl = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      // Posiciona na etapa inicial sem animar a virada de página
      skipPageTurn = true;
      goTo(clampChapter(props.initialChapter, TOTAL_CHAPTERS));
      cancelContentTransition();
      displayedIndex.value = current.value;
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', onWindowKeydown);
      await nextTick();
      skipPageTurn = false;
      playOpenAnimation();
      closeBtn.value?.focus();
      return;
    }

    document.body.style.overflow = '';
    window.removeEventListener('keydown', onWindowKeydown);
    // Esc / botão devolvem o foco ao livro que estava selecionado
    const target = returnFocusEl;
    returnFocusEl = null;
    await nextTick();
    if (target && document.contains(target)) target.focus();
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  if (typeof window === 'undefined') return;
  cancelContentTransition();
  window.removeEventListener('keydown', onWindowKeydown);
  document.body.style.overflow = '';
});
</script>

<style scoped>
/* Botão de fechar: o estilo do BookModal é escopado, então é repetido aqui */
.icon-floating-close {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  z-index: 3001;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  font-size: 1.1rem;
  cursor: pointer;
  backdrop-filter: blur(4px);
}

.icon-floating-close:hover {
  background: rgba(0, 0, 0, 0.65);
}

.icon-floating-close:focus-visible {
  outline: 2px solid #fde047;
  outline-offset: 2px;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

.book-empty {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 2rem;
  text-align: center;
  color: #333;
  font-family: 'Irish Grover', cursive;
}

.empty-icon {
  font-size: 3rem;
}

.empty-title {
  margin: 0;
  color: #8b4513;
}

.empty-text {
  max-width: 420px;
  margin: 0;
  line-height: 1.5;
}

/* Fitas de etapa, sob o livro (mesma paleta do livro de edição) */
/* Layout fixo: a moldura não muda de posição quando o conteúdo da página muda de altura.
   Fitas e barra de ação ficam no rodapé, fora do fluxo do livro. */
.grimoire-viewer .container {
  height: 100%;
  justify-content: center;
}

/* Centralizado no meio da tela, como o sprite (fora do fluxo: o texto da página não o desloca).
   Usa margens em vez de transform, porque a animação de entrada do modal define transform. */
.grimoire-viewer .sprite-wrapper {
  position: absolute;
  top: 50%;
  left: 0;
  right: 0;
  width: 90%;
  /* Altura do livro visível: o carrossel do BookModal usa th × 0,6107 */
  margin: calc(-0.5px * var(--sprite-th) * 0.6107) auto 0;
  height: calc(1px * var(--sprite-th) * 0.6107);
  display: flex;
  align-items: stretch;
}

.grimoire-viewer .book {
  height: 100%;
  width: 100%;
}

.chapter-ribbons {
  position: fixed;
  left: 50%;
  bottom: 4.25rem;
  transform: translateX(-50%);
  width: min(96vw, 1200px);
  box-sizing: border-box;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.35rem;
  margin: 0;
}

.chapter-ribbon {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.35rem 0.7rem;
  border: 1px solid #8b4513;
  border-bottom: none;
  border-radius: 6px 6px 0 0;
  background: #f5deb3;
  color: #5a2d0c;
  font-family: 'Irish Grover', cursive;
  font-size: 0.85rem;
  cursor: pointer;
}

.chapter-ribbon.is-active {
  background: var(--book-accent-color, #8b4513);
  color: #fff;
  box-shadow: 0 -2px 0 #fde047 inset;
}

.actions-bar {
  position: fixed;
  left: 50%;
  bottom: 1rem;
  transform: translateX(-50%);
  margin: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  flex-wrap: wrap;
  z-index: 3001;
  color: #fff;
  font-family: 'Irish Grover', cursive;
}

.page-indicator {
  font-size: 0.95rem;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.8);
}

.action-btn {
  background: rgba(255, 255, 255, 0.09);
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.18);
  padding: 0.5rem 1rem;
  border-radius: 6px;
  cursor: pointer;
  font: inherit;
  font-size: 0.9rem;
}

.action-btn.primary {
  background: #2563eb;
  border-color: #1d4ed8;
}

.action-btn:focus-visible,
.chapter-ribbon:focus-visible {
  outline: 2px solid #fde047;
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .chapter-ribbon {
    transition: none;
  }
}
</style>
