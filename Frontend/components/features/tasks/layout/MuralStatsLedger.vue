<template>
  <!-- folha de livro-caixa pregada na parede: pendentes e cumpridas, com o tempo estimado -->
  <section class="mural-ledger" :class="{ 'is-inline': inline }" aria-label="Livro-caixa de missões">
    <span class="ledger-nail" aria-hidden="true"></span>
    <h2 class="ledger-title">Livro-caixa</h2>
    <dl class="ledger-rows">
      <div class="ledger-row">
        <dt>📜 A cumprir</dt>
        <dd>
          <strong>{{ stats.pending.count }}</strong>
          <span class="ledger-time">{{ stats.pending.time }}</span>
        </dd>
      </div>
      <div class="ledger-row">
        <dt>🏆 Cumpridas</dt>
        <dd>
          <strong>{{ stats.completed.count }}</strong>
          <span class="ledger-time">{{ stats.completed.time }}</span>
        </dd>
      </div>
    </dl>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { summarizeTasks } from '~/composables/features/taskStats';

const props = withDefaults(
  defineProps<{
    tasks: any[];
    /** `inline`: faixa horizontal compacta (mobile), sem prego nem título */
    inline?: boolean;
  }>(),
  { inline: false },
);

const stats = computed(() => summarizeTasks(props.tasks));
</script>

<style scoped>
.mural-ledger {
  position: relative;
  padding: 1.1em 1em 0.9em;
  color: var(--guild-parchment-ink, #3b2414);
  font-family: var(--font-guild-body, 'Poppins', sans-serif);
  background: radial-gradient(
    ellipse at 50% 35%,
    var(--guild-parchment-base, #f4e4bc) 0%,
    var(--guild-parchment-dark, #d8bc82) 100%
  );
  border-radius: 3px;
  clip-path: polygon(0 2%, 4% 0, 97% 1%, 100% 5%, 99% 97%, 95% 100%, 3% 99%, 1% 95%);
  box-shadow: inset 0 0 18px rgba(110, 70, 35, 0.45);
  filter: drop-shadow(0 6px 10px rgba(0, 0, 0, 0.6));
  transform: rotate(-1.5deg);
}

.ledger-nail {
  position: absolute;
  top: 0.35em;
  left: 50%;
  width: 0.6em;
  height: 0.6em;
  transform: translateX(-50%);
  border-radius: 50%;
  background: radial-gradient(circle at 35% 35%, #d1d5db 0%, #4b5563 65%, #111827 100%);
}

.ledger-title {
  margin: 0 0 0.45em;
  text-align: center;
  font-family: var(--font-guild-title, 'Irish Grover', serif);
  font-size: 1.15em;
  font-weight: 400;
  letter-spacing: 0.5px;
  border-bottom: 1px solid rgba(92, 58, 30, 0.35);
  padding-bottom: 0.25em;
}

.ledger-rows {
  margin: 0;
  display: grid;
  gap: 0.45em;
}

.ledger-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5em;
}

.ledger-row dt {
  font-size: 0.85em;
  white-space: nowrap;
}

.ledger-row dd {
  margin: 0;
  display: flex;
  align-items: baseline;
  gap: 0.4em;
  white-space: nowrap;
}

.ledger-row strong {
  font-family: var(--font-guild-title, 'Irish Grover', serif);
  font-size: 1.35em;
  font-weight: 400;
  line-height: 1;
}

.ledger-time {
  font-size: 0.78em;
  opacity: 0.8;
}

/* mobile: faixa de pergaminho numa linha só */
.mural-ledger.is-inline {
  padding: 0.35em 0.8em;
  transform: none;
  clip-path: polygon(0 8%, 2% 0, 98% 4%, 100% 92%, 97% 100%, 1% 96%);
}

.mural-ledger.is-inline .ledger-nail,
.mural-ledger.is-inline .ledger-title {
  display: none;
}

.mural-ledger.is-inline .ledger-rows {
  grid-template-columns: 1fr 1fr;
  gap: 0.8em;
}

.mural-ledger.is-inline .ledger-row strong {
  font-size: 1.1em;
}
</style>
