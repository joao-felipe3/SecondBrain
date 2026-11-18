<template>
  <Teleport to="body">
    <Transition name="grimoire">
      <div v-if="isOpen" class="guild-reception-overlay" @click.self="close">
        <div class="grimoire-book" role="dialog" aria-modal="true" aria-labelledby="grimoire-title">
          <!-- cantoneiras de latão da capa -->
          <span class="corner corner-tl" aria-hidden="true"></span>
          <span class="corner corner-tr" aria-hidden="true"></span>
          <span class="corner corner-bl" aria-hidden="true"></span>
          <span class="corner corner-br" aria-hidden="true"></span>

          <!-- Botão Fechar em Selo de Cera -->
          <button class="close-seal-btn" title="Fechar Grimório" @click="close">
            <UiWaxSeal color="red" size="sm" icon="✕" interactive />
          </button>

          <div class="grimoire-spread">
            <!-- PÁGINA ESQUERDA: título, consistência e atalhos -->
            <section class="page page-left">
              <header class="grimoire-header">
                <svg class="grimoire-emblem" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M12 6.2C9.8 4.7 7 4.2 3.5 4.6v13.6c3.5-.4 6.3.1 8.5 1.6 2.2-1.5 5-2 8.5-1.6V4.6C17 4.2 14.2 4.7 12 6.2z"
                  />
                  <path
                    d="M12 6.2v13.6M6 8.2c1.6-.1 3 .2 4 .8M6 11.2c1.6-.1 3 .2 4 .8M14 9c1-.6 2.4-.9 4-.8M14 12c1-.6 2.4-.9 4-.8"
                  />
                </svg>
                <h2 id="grimoire-title" class="grimoire-title">Grimório de Registro</h2>
                <p class="grimoire-kicker">da Guilda</p>
                <svg class="flourish" viewBox="0 0 200 16" aria-hidden="true">
                  <path d="M4 8h70M126 8h70M74 8c6 0 9-6 15-3M126 8c-6 0-9 6-15 3" />
                  <path class="flourish-gem" d="M100 2l6 6-6 6-6-6z" />
                </svg>
                <p class="grimoire-subtitle">
                  Sintonizado com o Oráculo de Planejamento &amp; Registro de Aventureiros
                </p>
              </header>

              <div class="streak-medallion">
                <div class="medallion-ring">
                  <svg class="medallion-flame" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M12 2.5c1.2 3.4 4.8 5.4 4.8 10a4.8 4.8 0 0 1-9.6 0c0-2.3 1.1-3.6 2.3-4.6.1 2.2 1 3.4 2.3 3.6-.3-3.4-.9-5.7.2-9z"
                    />
                  </svg>
                  <span class="medallion-value">{{ streakDays }}</span>
                </div>
                <div class="medallion-caption">
                  <strong>{{ streakDays === 1 ? 'Dia de foco' : 'Dias seguidos de foco' }}</strong>
                  <span>Consistência do Aventureiro</span>
                </div>
              </div>

              <nav class="grimoire-actions" aria-label="Atalhos do grimório">
                <NuxtLink to="/task" class="grimoire-btn btn-primary" @click="close">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path :d="ICONS.scroll" /></svg>
                  <span>Consultar Mural de Contratos</span>
                </NuxtLink>
                <NuxtLink to="/projects" class="grimoire-btn btn-secondary" @click="close">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path :d="ICONS.books" /></svg>
                  <span>Explorar Arquivos de Projetos</span>
                </NuxtLink>
              </nav>

              <span class="folio" aria-hidden="true">— i —</span>
            </section>

            <!-- PÁGINA DIREITA: o livro-razão de registros -->
            <section class="page page-right" aria-label="Registros">
              <!-- fita marcadora -->
              <span class="bookmark" aria-hidden="true"></span>

              <h3 class="ledger-title"><span class="drop-cap">R</span>egistros do Aventureiro</h3>

              <ul class="ledger">
                <li v-for="row in ledgerRows" :key="row.label" class="ledger-row">
                  <span class="ledger-icon" :class="`tone-${row.tone}`">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path :d="row.icon" /></svg>
                  </span>
                  <span class="ledger-text">
                    <span class="ledger-label">{{ row.label }}</span>
                    <span class="ledger-sub">{{ row.sub }}</span>
                  </span>
                  <span class="ledger-leader" aria-hidden="true"></span>
                  <span class="ledger-value">{{ row.value }}</span>
                </li>
              </ul>

              <div class="xp-ribbon">
                <span class="xp-label">Experiência acumulada</span>
                <span class="xp-value">{{ totalXp }} <small>XP</small></span>
              </div>

              <blockquote class="guild-motto">
                “Cada contrato selado fortalece as pedras deste salão.”
                <cite>— Mestre da Guilda</cite>
              </blockquote>

              <span class="folio" aria-hidden="true">— ii —</span>
            </section>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useUiGuildStore } from '~/stores/uiGuild';
import { useTaskStore } from '~/stores/task';
import { useProjectStore } from '~/stores/project';
import UiWaxSeal from '~/components/ui/diegetic/UiWaxSeal.vue';

/** ícones desenhados a pena (traço, viewBox 24) */
const ICONS = {
  scroll:
    'M7 4h10a2 2 0 0 1 2 2v12M7 4a2 2 0 0 0-2 2v1.5h2M7 4v14a2 2 0 0 0 2 2h9a2 2 0 0 0 1-3.7M10 9h6M10 12h6M10 15h4',
  swords:
    'M5 4l10.5 10.5M19 4L8.5 14.5M13.5 16.5l4-4M6.5 12.5l4 4M16 16l3 3M8 16l-3 3M5 4v3M5 4h3M19 4v3M19 4h-3',
  books: 'M4.5 4.5h3.5v15H4.5zM9 6.5h3.5v13H9zM13.6 6l3.3-.9 3.6 13.6-3.3.9zM3 19.5h18',
  hourglass:
    'M7 3.5h10M7 20.5h10M8 3.5c0 4 4 5 4 8.5s-4 4.5-4 8.5M16 3.5c0 4-4 5-4 8.5s4 4.5 4 8.5M10 18h4',
} as const;

const uiGuildStore = useUiGuildStore();
const taskStore = useTaskStore();
const projectStore = useProjectStore();

const isOpen = computed(() => uiGuildStore.isReceptionOpen);

function close() {
  uiGuildStore.closeReceptionModal();
}

// Métricas Computadas
const completedTasksCount = computed(
  () => taskStore.tasks.filter((t) => t.status === 'done' || t.status === 'completed').length,
);

const activeTasksCount = computed(
  () => taskStore.tasks.filter((t) => t.status === 'doing' || t.status === 'in_progress').length,
);

const todoTasksCount = computed(
  () => taskStore.tasks.filter((t) => t.status === 'todo' || t.status === 'pending').length,
);

const totalProjectsCount = computed(() => projectStore.projects.length);

const totalXp = computed(() => completedTasksCount.value * 100);

const streakDays = computed(
  () => taskStore.habitsDashboard?.streaksOver7Days || (completedTasksCount.value > 0 ? 3 : 1),
);

const ledgerRows = computed(() => [
  {
    label: 'Contratos Cumpridos',
    sub: 'Selados e arquivados',
    value: completedTasksCount.value,
    icon: ICONS.scroll,
    tone: 'green',
  },
  {
    label: 'Missões em Andamento',
    sub: 'Aventureiros em campo',
    value: activeTasksCount.value,
    icon: ICONS.swords,
    tone: 'red',
  },
  {
    label: 'No Mural de Espera',
    sub: 'Aguardando um herói',
    value: todoTasksCount.value,
    icon: ICONS.hourglass,
    tone: 'amber',
  },
  {
    label: 'Projetos Registrados',
    sub: 'Biblioteca de Arquivos',
    value: totalProjectsCount.value,
    icon: ICONS.books,
    tone: 'blue',
  },
]);
</script>

<style scoped>
.guild-reception-overlay {
  --ink: hsl(25, 45%, 16%);
  --ink-soft: hsl(25, 28%, 36%);
  --ink-faint: rgba(92, 58, 30, 0.35);
  --leather: hsl(355, 45%, 20%);
  --leather-dark: hsl(355, 50%, 11%);
  --gilt: hsl(43, 75%, 58%);
  --gilt-dark: hsl(38, 65%, 34%);

  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  background: radial-gradient(ellipse at 50% 45%, rgba(60, 35, 15, 0.55) 0%, rgba(10, 6, 3, 0.9) 75%);
  backdrop-filter: blur(5px);
  perspective: 1600px;
}

/* ===================== CAPA DE COURO ===================== */
.grimoire-book {
  position: relative;
  width: 100%;
  max-width: 880px;
  padding: 16px;
  border-radius: 10px 14px 14px 10px;
  background:
    radial-gradient(ellipse at 30% 20%, rgba(255, 255, 255, 0.08), transparent 55%),
    radial-gradient(ellipse at 70% 90%, rgba(0, 0, 0, 0.35), transparent 60%),
    linear-gradient(135deg, var(--leather) 0%, var(--leather-dark) 100%);
  box-shadow:
    inset 0 0 0 2px rgba(0, 0, 0, 0.5),
    inset 0 0 30px rgba(0, 0, 0, 0.6),
    0 24px 60px rgba(0, 0, 0, 0.75);
  transform-style: preserve-3d;
}

/* filete dourado gravado na capa */
.grimoire-book::before {
  content: '';
  position: absolute;
  inset: 6px;
  border: 1px solid rgba(220, 175, 80, 0.55);
  border-radius: 7px 10px 10px 7px;
  pointer-events: none;
}

.corner {
  position: absolute;
  width: 34px;
  height: 34px;
  z-index: 4;
  pointer-events: none;
  background:
    radial-gradient(circle at 9px 9px, #fff3c4 0 1.5px, transparent 2px),
    linear-gradient(135deg, #f3d27a 0%, #b8862f 45%, #6b4a17 100%);
  clip-path: polygon(0 0, 100% 0, 100% 22%, 22% 22%, 22% 100%, 0 100%);
  filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.6));
}
.corner-tl {
  top: 0;
  left: 0;
  border-top-left-radius: 10px;
}
.corner-tr {
  top: 0;
  right: 0;
  transform: scaleX(-1);
  border-top-left-radius: 14px;
}
.corner-bl {
  bottom: 0;
  left: 0;
  transform: scaleY(-1);
  border-top-left-radius: 10px;
}
.corner-br {
  bottom: 0;
  right: 0;
  transform: scale(-1, -1);
  border-top-left-radius: 14px;
}

.close-seal-btn {
  position: absolute;
  top: -14px;
  right: -14px;
  z-index: 10;
  padding: 0;
  background: none;
  border: none;
  cursor: pointer;
}

/* ===================== PÁGINAS ===================== */
.grimoire-spread {
  position: relative;
  display: grid;
  grid-template-columns: 1fr 1fr;
  /* bordas das folhas empilhadas embaixo */
  box-shadow:
    0 2px 0 hsl(38, 40%, 78%),
    0 4px 0 hsl(36, 35%, 70%),
    0 6px 0 hsl(34, 30%, 62%),
    0 8px 10px rgba(0, 0, 0, 0.5);
  border-radius: 4px;
}

.page {
  position: relative;
  display: flex;
  flex-direction: column;
  padding: 1.6rem 1.7rem 2.1rem;
  color: var(--ink);
  font-family: var(--font-guild-body, sans-serif);
  background:
    /* manchas do papel */
    radial-gradient(circle at 18% 82%, rgba(150, 100, 45, 0.1) 0 40px, transparent 90px),
    radial-gradient(circle at 85% 12%, rgba(150, 100, 45, 0.08) 0 30px, transparent 80px),
    radial-gradient(ellipse at 50% 45%, hsl(40, 62%, 89%) 0%, hsl(36, 48%, 79%) 100%);
}

.page-left {
  border-radius: 4px 0 0 4px;
  box-shadow:
    inset -26px 0 30px -18px rgba(70, 40, 15, 0.55),
    inset 0 0 40px rgba(120, 75, 30, 0.25);
}

.page-right {
  border-radius: 0 4px 4px 0;
  box-shadow:
    inset 26px 0 30px -18px rgba(70, 40, 15, 0.55),
    inset 0 0 40px rgba(120, 75, 30, 0.25);
}

/* vinco da lombada */
.grimoire-spread::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: 2px;
  transform: translateX(-50%);
  background: linear-gradient(
    180deg,
    rgba(60, 35, 12, 0.15),
    rgba(60, 35, 12, 0.5),
    rgba(60, 35, 12, 0.15)
  );
  pointer-events: none;
}

.folio {
  position: absolute;
  bottom: 0.7rem;
  left: 0;
  right: 0;
  text-align: center;
  font-family: var(--font-guild-title, serif);
  font-size: 0.7rem;
  color: var(--ink-soft);
  opacity: 0.7;
}

svg {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* ===================== PÁGINA ESQUERDA ===================== */
.grimoire-header {
  text-align: center;
}

.grimoire-emblem {
  display: block;
  margin: 0 auto;
  width: 44px;
  height: 44px;
  color: var(--gilt-dark);
  filter: drop-shadow(0 1px 0 rgba(255, 240, 200, 0.7));
}

.grimoire-title {
  margin: 0.2rem 0 0;
  font-family: var(--font-guild-title, serif);
  font-size: 1.65rem;
  line-height: 1.05;
  color: var(--ink);
  text-shadow: 0 1px 0 rgba(255, 245, 220, 0.6);
}

.grimoire-kicker {
  margin: 0.1rem 0 0;
  font-family: var(--font-guild-title, serif);
  font-size: 0.95rem;
  color: hsl(355, 50%, 32%);
}

.flourish {
  display: block;
  width: 70%;
  height: 16px;
  margin: 0.45rem auto 0.35rem;
  color: var(--ink-soft);
  stroke-width: 1.2;
}
.flourish-gem {
  fill: hsl(355, 55%, 38%);
  stroke: hsl(355, 55%, 25%);
}

.grimoire-subtitle {
  margin: 0;
  font-size: 0.78rem;
  font-style: italic;
  line-height: 1.4;
  color: var(--ink-soft);
}

/* medalhão da consistência */
.streak-medallion {
  display: flex;
  align-items: center;
  gap: 0.9rem;
  margin: 1.3rem 0 1.2rem;
  padding: 0.75rem 0.9rem;
  border: 1px dashed var(--ink-faint);
  border-radius: 10px;
  background: rgba(255, 250, 235, 0.35);
}

.medallion-ring {
  position: relative;
  flex-shrink: 0;
  width: 72px;
  height: 72px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background:
    radial-gradient(circle at 50% 60%, rgba(255, 170, 60, 0.35), transparent 60%),
    radial-gradient(circle at 35% 30%, hsl(30, 35%, 30%), hsl(22, 45%, 13%));
  box-shadow:
    0 0 0 3px #c99a3e,
    0 0 0 5px #6b4a17,
    0 4px 10px rgba(0, 0, 0, 0.45),
    inset 0 0 12px rgba(0, 0, 0, 0.7);
}

.medallion-flame {
  position: absolute;
  inset: 10px;
  width: calc(100% - 20px);
  height: calc(100% - 20px);
  fill: rgba(255, 150, 40, 0.16);
  stroke: rgba(255, 190, 90, 0.4);
  stroke-width: 1.1;
  animation: flameFlicker 2.4s ease-in-out infinite alternate;
  transform-origin: 50% 85%;
}

.medallion-value {
  position: relative;
  font-family: var(--font-guild-title, serif);
  font-size: 2rem;
  line-height: 1;
  margin-top: 6px;
  color: #fff3cf;
  -webkit-text-stroke: 0.5px rgba(60, 25, 5, 0.6);
  text-shadow:
    0 0 8px rgba(255, 160, 50, 0.9),
    0 2px 2px rgba(0, 0, 0, 0.8);
}

.medallion-caption {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;
}
.medallion-caption strong {
  font-family: var(--font-guild-title, serif);
  font-weight: normal;
  font-size: 1.05rem;
  color: var(--ink);
}
.medallion-caption span {
  font-size: 0.74rem;
  color: var(--ink-soft);
}

@keyframes flameFlicker {
  0% {
    transform: scale(0.96, 0.98) rotate(-1.5deg);
    opacity: 0.85;
  }
  100% {
    transform: scale(1.03, 1.05) rotate(1.5deg);
    opacity: 1;
  }
}

.grimoire-actions {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  margin-top: auto;
}

.grimoire-btn {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.65rem 0.9rem;
  border-radius: 6px;
  text-decoration: none;
  font-family: var(--font-guild-title, serif);
  font-size: 0.92rem;
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease,
    background 0.18s ease;
}
.grimoire-btn svg {
  width: 22px;
  height: 22px;
  flex-shrink: 0;
}

.btn-primary {
  color: hsl(40, 70%, 88%);
  background: linear-gradient(180deg, hsl(355, 45%, 30%) 0%, hsl(355, 50%, 18%) 100%);
  border: 1px solid #6b4a17;
  box-shadow:
    inset 0 0 0 1px rgba(230, 185, 90, 0.45),
    0 3px 8px rgba(0, 0, 0, 0.35);
}
.btn-primary svg {
  color: var(--gilt);
}
.btn-primary:hover {
  transform: translateY(-2px);
  box-shadow:
    inset 0 0 0 1px rgba(230, 185, 90, 0.7),
    0 6px 14px rgba(120, 60, 10, 0.45);
}

.btn-secondary {
  color: var(--ink);
  background: rgba(255, 250, 235, 0.5);
  border: 1px solid var(--ink-faint);
  box-shadow: 0 2px 5px rgba(80, 50, 20, 0.15);
}
.btn-secondary svg {
  color: hsl(210, 45%, 35%);
}
.btn-secondary:hover {
  transform: translateY(-2px);
  background: rgba(255, 250, 235, 0.85);
}

.grimoire-btn:focus-visible,
.close-seal-btn:focus-visible {
  outline: 2px solid var(--gilt);
  outline-offset: 2px;
}

/* ===================== PÁGINA DIREITA ===================== */
.bookmark {
  position: absolute;
  top: -6px;
  right: 2.2rem;
  width: 18px;
  height: 84px;
  background: linear-gradient(90deg, hsl(355, 55%, 30%), hsl(355, 60%, 40%) 50%, hsl(355, 55%, 28%));
  clip-path: polygon(0 0, 100% 0, 100% 100%, 50% 84%, 0 100%);
  filter: drop-shadow(1px 2px 1px rgba(0, 0, 0, 0.35));
}

.ledger-title {
  margin: 0.2rem 3rem 0.9rem 0;
  font-family: var(--font-guild-title, serif);
  font-weight: normal;
  font-size: 1.15rem;
  color: var(--ink);
}

/* capitular iluminada */
.drop-cap {
  display: inline-grid;
  place-items: center;
  width: 1.6em;
  height: 1.6em;
  margin-right: 0.12em;
  font-size: 1.25em;
  vertical-align: -0.15em;
  color: #fff1c9;
  background: radial-gradient(circle at 35% 30%, hsl(355, 50%, 40%), hsl(355, 55%, 22%));
  border: 1.5px solid #c99a3e;
  border-radius: 3px;
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.6);
}

.ledger {
  list-style: none;
  margin: 0;
  padding: 0;
}

.ledger-row {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  padding: 0.6rem 0;
  border-bottom: 1px solid var(--ink-faint);
}
.ledger-row:last-child {
  border-bottom: none;
}

.ledger-icon {
  flex-shrink: 0;
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: rgba(255, 250, 235, 0.55);
  box-shadow:
    inset 0 0 0 1.5px currentColor,
    inset 0 0 8px rgba(120, 75, 30, 0.2);
}
.ledger-icon svg {
  width: 20px;
  height: 20px;
}
.tone-green {
  color: hsl(145, 45%, 28%);
}
.tone-red {
  color: hsl(355, 55%, 35%);
}
.tone-amber {
  color: hsl(32, 70%, 35%);
}
.tone-blue {
  color: hsl(210, 50%, 33%);
}

.ledger-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.ledger-label {
  font-weight: 600;
  font-size: 0.86rem;
  color: var(--ink);
}
.ledger-sub {
  font-size: 0.72rem;
  font-style: italic;
  color: var(--ink-soft);
}

/* pontilhado de livro-razão até o número */
.ledger-leader {
  flex: 1;
  min-width: 12px;
  align-self: flex-end;
  margin-bottom: 0.45rem;
  border-bottom: 2px dotted var(--ink-faint);
}

.ledger-value {
  font-family: var(--font-guild-title, serif);
  font-size: 1.55rem;
  line-height: 1;
  color: var(--ink);
  min-width: 1.4ch;
  text-align: right;
}

.xp-ribbon {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-top: 1rem;
  padding: 0.55rem 1.1rem;
  color: hsl(42, 85%, 85%);
  background: linear-gradient(180deg, hsl(30, 40%, 30%), hsl(25, 45%, 18%));
  clip-path: polygon(0 0, 100% 0, calc(100% - 10px) 50%, 100% 100%, 0 100%, 10px 50%);
}
.xp-label {
  font-size: 0.74rem;
  letter-spacing: 0.4px;
  text-transform: uppercase;
}
.xp-value {
  font-family: var(--font-guild-title, serif);
  font-size: 1.2rem;
  color: #ffe08a;
}
.xp-value small {
  font-size: 0.7em;
}

/* lema da guilda no pé da página dos registros */
.guild-motto {
  margin: auto 0 0.6rem;
  padding-top: 1rem;
  text-align: center;
  font-size: 0.8rem;
  font-style: italic;
  line-height: 1.45;
  color: var(--ink-soft);
}
.guild-motto cite {
  display: block;
  margin-top: 0.2rem;
  font-family: var(--font-guild-title, serif);
  font-style: normal;
  font-size: 0.78rem;
  color: hsl(355, 45%, 32%);
}

/* ===================== MOBILE: uma página só ===================== */
@media (max-width: 720px) {
  .guild-reception-overlay {
    padding: 1rem;
    align-items: flex-start;
    overflow-y: auto;
  }
  .grimoire-book {
    margin: auto 0;
    padding: 12px;
  }
  .grimoire-spread {
    grid-template-columns: 1fr;
  }
  .grimoire-spread::after {
    display: none;
  }
  .page {
    padding: 1.3rem 1.15rem 2rem;
  }
  .page-left,
  .page-right {
    border-radius: 4px;
    box-shadow: inset 0 0 36px rgba(120, 75, 30, 0.25);
  }
  /* a página dos registros vem logo depois do título; os atalhos ficam no fim */
  .page-left {
    display: contents;
  }
  .grimoire-header,
  .streak-medallion,
  .grimoire-actions,
  .page-left .folio {
    background: none;
  }
  .grimoire-spread {
    background: radial-gradient(ellipse at 50% 30%, hsl(40, 62%, 89%) 0%, hsl(36, 48%, 79%) 100%);
    padding: 1.3rem 1.15rem 1.1rem;
    box-shadow:
      inset 0 0 36px rgba(120, 75, 30, 0.25),
      0 2px 0 hsl(38, 40%, 78%),
      0 4px 0 hsl(36, 35%, 70%),
      0 6px 8px rgba(0, 0, 0, 0.45);
  }
  .grimoire-header {
    order: 1;
  }
  .streak-medallion {
    order: 2;
    margin: 1rem 0 0.4rem;
  }
  .page-right {
    order: 3;
    padding: 0.6rem 0 0;
    background: none;
    box-shadow: none;
  }
  .grimoire-actions {
    order: 4;
    margin-top: 1.1rem;
  }
  .folio {
    display: none;
  }
  .bookmark {
    top: 0.2rem;
    right: 0.2rem;
    height: 52px;
  }
  .guild-motto {
    display: none;
  }
  /* sem padding sobrando na tela: o selo de fechar fica sobre a capa */
  .close-seal-btn {
    top: -6px;
    right: -6px;
  }
  .grimoire-title {
    font-size: 1.4rem;
  }
  .ledger-title {
    margin-right: 2rem;
  }
}

/* ===================== ABERTURA ===================== */
.grimoire-enter-active,
.grimoire-leave-active {
  transition: opacity 0.25s ease;
}
.grimoire-enter-from,
.grimoire-leave-to {
  opacity: 0;
}
.grimoire-enter-active .grimoire-book {
  animation: grimoireOpen 0.45s cubic-bezier(0.16, 1, 0.3, 1);
}
.grimoire-leave-active .grimoire-book {
  transition: transform 0.2s ease;
  transform: scale(0.96) translateY(10px);
}

@keyframes grimoireOpen {
  from {
    transform: rotateX(18deg) scale(0.9) translateY(30px);
  }
  to {
    transform: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .grimoire-enter-active .grimoire-book,
  .medallion-flame {
    animation: none;
  }
}
</style>
