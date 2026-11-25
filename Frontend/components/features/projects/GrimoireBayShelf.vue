<template>
  <div class="bay-shelf" aria-label="Estante de tomos">
    <!-- Três baias pintadas na sala: cada uma com duas fileiras de três capas -->
    <div
      v-for="(bay, bayIndex) in BAYS"
      :key="bayIndex"
      class="bay"
      :style="{ left: bay.left, width: bay.width }"
    >
      <div
        v-for="(row, rowIndex) in ROWS"
        :key="rowIndex"
        class="bay-row"
        :style="{ top: row.top, height: row.height }"
      >
        <div v-for="cell in SLOTS_PER_ROW" :key="cell" class="book-slot">
          <template v-if="bookAt(bayIndex, rowIndex, cell - 1)">
            <UiGrimoireBook
              :key="bookKey(bookAt(bayIndex, rowIndex, cell - 1))"
              :title="bookAt(bayIndex, rowIndex, cell - 1).name"
              :color="bookAt(bayIndex, rowIndex, cell - 1).color || '#8b4513'"
              :task-count="bookAt(bayIndex, rowIndex, cell - 1).taskCount ?? 0"
              :progress="bookAt(bayIndex, rowIndex, cell - 1).progress ?? 0"
              :is-locked="bookAt(bayIndex, rowIndex, cell - 1).isLocked || false"
              :interactive="true"
              class="shelf-book"
              @mouseenter="$emit('project-hover', bookAt(bayIndex, rowIndex, cell - 1))"
              @click="onBookClick(bookAt(bayIndex, rowIndex, cell - 1), $event)"
            />
          </template>
        </div>
      </div>
    </div>

    <!-- Novo tomo: placa sobre a base da baia do meio -->
    <button type="button" class="create-plaque" @click="$emit('create-project')">
      <span aria-hidden="true">+</span> Novo Projeto
    </button>

    <!-- Paginação quando há mais de 18 tomos -->
    <nav v-if="totalPages > 1" class="pager" aria-label="Páginas da estante">
      <button
        type="button"
        class="pager-arrow"
        :disabled="page === 0"
        aria-label="Página anterior da estante"
        @click="page -= 1"
      >
        ◀
      </button>
      <span class="pager-label" aria-live="polite">Página {{ page + 1 }} de {{ totalPages }}</span>
      <button
        type="button"
        class="pager-arrow"
        :disabled="page >= totalPages - 1"
        aria-label="Próxima página da estante"
        @click="page += 1"
      >
        ▶
      </button>
    </nav>

    <p v-if="projects.length === 0" class="empty-hint">
      Os tomos aparecem aqui. Comece criando o primeiro projeto.
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import UiGrimoireBook from '../../ui/diegetic/UiGrimoireBook.vue';

const props = withDefaults(
  defineProps<{
    projects: any[];
  }>(),
  { projects: () => [] },
);

const emit = defineEmits<{
  (e: 'select-project', project: any, origin: DOMRect | null): void;
  (e: 'create-project'): void;
  (e: 'project-hover', project: any): void;
}>();

// Guarda a posição da capa clicada: o livro sai dela na abertura
function onBookClick(project: any, event: Event) {
  const el = event.currentTarget as HTMLElement | null;
  emit('select-project', project, el ? el.getBoundingClientRect() : null);
}

// Posições medidas na imagem Projects-expandido.webp (2560×1440), em % do palco 16:9.
// Cada baia tem duas fileiras; a linha de baixo de cada fileira é a prateleira.
const BAYS = [
  { left: '19.5%', width: '18.3%' },
  { left: '41%', width: '18.5%' },
  { left: '62.8%', width: '18%' },
];
// Em % da altura da baia (22,5% a 54,5% do palco): fileira de cima até a 1ª prateleira
// (37,8%), fileira de baixo de 39,6% até a 2ª prateleira (54,4%).
const ROWS = [
  { top: '0%', height: '47.5%' },
  { top: '53.5%', height: '46.5%' },
];
const SLOTS_PER_ROW = 3;
const PER_PAGE = BAYS.length * ROWS.length * SLOTS_PER_ROW;

const page = ref(0);
const totalPages = computed(() => Math.max(1, Math.ceil(props.projects.length / PER_PAGE)));

// Se a lista diminuir, volta para uma página que ainda existe
watch(totalPages, (total) => {
  if (page.value > total - 1) page.value = total - 1;
});

const pageProjects = computed(() =>
  props.projects.slice(page.value * PER_PAGE, (page.value + 1) * PER_PAGE),
);

// Ordem: baia 1 (fileira de cima, depois de baixo), baia 2, baia 3
function bookAt(bayIndex: number, rowIndex: number, cellIndex: number) {
  const index = bayIndex * ROWS.length * SLOTS_PER_ROW + rowIndex * SLOTS_PER_ROW + cellIndex;
  return pageProjects.value[index];
}

function bookKey(project: any) {
  return project._id || project.id || project.name;
}
</script>

<style scoped>
.bay-shelf {
  position: absolute;
  inset: 0;
  /* Capas dimensionadas pela altura do palco (cqh), para acompanhar a imagem */
  container-type: size;
  --book-h: 14cqh;
  --book-w: calc(var(--book-h) * 0.7);
}

/* Telas maiores: capas um pouco maiores (limite: a altura do compartimento pintado, ~15%) */
@media (min-width: 1600px) {
  .bay-shelf {
    --book-h: 15cqh;
  }
}

.bay {
  position: absolute;
  top: 22.5%;
  height: 32%;
}

.bay-row {
  position: absolute;
  left: 0;
  right: 0;
  display: flex;
  align-items: flex-end;
  justify-content: space-around;
  padding: 0 4%;
  box-sizing: border-box;
}

.book-slot {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  width: 33%;
  height: 100%;
}

.shelf-book {
  cursor: pointer;
}

.create-plaque {
  position: absolute;
  left: 50%;
  top: 71%;
  transform: translate(-50%, -50%);
  padding: 0.35rem 0.9rem;
  border-radius: 4px;
  border: 1px solid hsl(45, 90%, 55%);
  background: linear-gradient(180deg, hsl(43, 85%, 45%) 0%, hsl(35, 75%, 28%) 100%);
  color: #fff;
  font-family: var(--font-guild-title, 'Cinzel', serif);
  font-size: clamp(0.7rem, 1.1cqh, 0.95rem);
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.5);
  white-space: nowrap;
}

.create-plaque:hover {
  box-shadow: 0 4px 12px rgba(234, 179, 8, 0.4);
}

.pager {
  position: absolute;
  left: 50%;
  top: 88%;
  transform: translate(-50%, -50%);
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.35rem 0.75rem;
  border-radius: 6px;
  background: rgba(40, 24, 12, 0.8);
  border: 1px solid hsl(35, 40%, 35%);
  color: hsl(38, 65%, 85%);
  font-family: var(--font-guild-title, 'Cinzel', serif);
  font-size: 0.8rem;
}

.pager-arrow {
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  border: 1px solid hsl(35, 40%, 40%);
  background: hsl(35, 45%, 30%);
  color: #fff;
  cursor: pointer;
}

.pager-arrow:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.empty-hint {
  position: absolute;
  left: 50%;
  top: 40%;
  transform: translate(-50%, -50%);
  width: min(60%, 420px);
  margin: 0;
  padding: 0.9rem 1.1rem;
  box-sizing: border-box;
  border-radius: 6px;
  background: rgba(20, 12, 6, 0.85);
  border: 1px solid hsl(35, 40%, 35%);
  text-align: center;
  color: hsl(38, 65%, 88%);
  font-family: var(--font-guild-title, 'Cinzel', serif);
}

@media (prefers-reduced-motion: reduce) {
  .shelf-book {
    transition: none;
  }
}
</style>
