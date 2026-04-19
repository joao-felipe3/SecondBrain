<template>
  <div class="history-tab">
    <div class="history-placeholder">
      <div class="placeholder-icon">🕐</div>
      <h3>Histórico de Edições</h3>
      <p>Este recurso estará disponível em uma próxima versão (Sprint 4)</p>
      <p class="info-text">
        Aqui você verá uma linha do tempo completa de todas as alterações feitas nesta tarefa,
        incluindo quem editou, quando, e quais foram as mudanças exatas.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
interface Props {
  task?: any
  projects?: any[]
}

const props = withDefaults(defineProps<Props>(), {
  task: () => null,
  projects: () => [],
})
</script>

<style scoped>
.history-tab {
  width: 100%;
  height: 100%;
  font-family: 'Irish Grover', cursive;
  color: #3e2723;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  overflow-y: auto;
  overflow-x: hidden;
}

.history-placeholder {
  text-align: center;
  max-width: 300px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
}

.placeholder-icon {
  font-size: 48px;
  opacity: 0.5;
}

.history-placeholder h3 {
  font-size: 18px;
  font-weight: 600;
  margin: 0;
  color: #3e2723;
}

.history-placeholder p {
  font-size: 13px;
  color: #a6794a;
  margin: 0;
  line-height: 1.5;
}

.info-text {
  font-style: italic;
  font-size: 12px !important;
  margin-top: 0.5rem !important;
}

/* Custom scrollbar */
.history-tab::-webkit-scrollbar {
  width: 6px;
}

.history-tab::-webkit-scrollbar-track {
  background: transparent;
}

.history-tab::-webkit-scrollbar-thumb {
  background-color: #d4a574;
  border-radius: 3px;
}

.history-tab::-webkit-scrollbar-thumb:hover {
  background-color: #b8934a;
}
</style>
