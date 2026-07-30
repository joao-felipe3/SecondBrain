<template>
  <div
    ref="npcContainerRef"
    class="npc-hotspot-container"
    @click="cycleDialogue"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
  >
    <!-- Balão de Fala RPG / HQ -->
    <Transition name="speech-bubble-pop">
      <div v-if="isVisible" class="npc-speech-bubble" @click.stop="cycleDialogue">
        <div class="bubble-speaker-header">
          <span class="speaker-avatar">🧔🏻‍♂️🧝‍♀️</span>
          <span class="speaker-name">Gloin & Lyra (Aventureiros)</span>
        </div>

        <p class="bubble-text">
          "{{ currentDialogue }}"
        </p>

        <div class="bubble-click-hint">
          <span>Clique para próxima fala... 💬</span>
        </div>

        <div class="bubble-tail"></div>
      </div>
    </Transition>

    <!-- Indicador Flutuante no NPC -->
    <div class="npc-avatar-indicator" :class="{ 'is-active': isVisible }">
      <span class="indicator-icon">💬</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useTaskStore } from '~/stores/task'
import { useProjectStore } from '~/stores/project'

const taskStore = useTaskStore()
const projectStore = useProjectStore()

const npcContainerRef = ref<HTMLElement | null>(null)
const isHovered = ref(false)
const dialogIndex = ref(0)
const isManuallyOpened = ref(false)

const completedCount = computed(() => {
  return taskStore.tasks.filter((t) => t.status === 'done' || t.status === 'completed').length
})

const projectCount = computed(() => projectStore.projects.length)

const streakDays = computed(() => {
  return taskStore.habitsDashboard?.streaksOver7Days || (completedCount.value > 0 ? 4 : 1)
})

const dialogues = computed(() => [
  `Ei, aventureiro! Vi que você já cumpriu ${completedCount.value} contratos hoje! Hora de tomar um hidromel!`,
  `A biblioteca guarda ${projectCount.value} tomos de projetos. Mantenha o foco que a glória te espera!`,
  `Seu fogo interior está aceso! Já são ${streakDays.value} dias de consistência inabalável na guilda!`,
  `Dica do Gloin: divida tarefas gigantes em micro-passos. Até o maior dragão é derrotado um golpe por vez!`,
  `Lyra me disse que o Mural de Contratos está cheio de novas missões interessantes. Vai encarar?`
])

const currentDialogue = computed(() => {
  return dialogues.value[dialogIndex.value % dialogues.value.length]
})

const isVisible = computed(() => isHovered.value || isManuallyOpened.value)

function cycleDialogue(event?: Event) {
  if (event) {
    event.stopPropagation()
  }
  isManuallyOpened.value = true
  dialogIndex.value = (dialogIndex.value + 1) % dialogues.value.length
}

function handleDocumentClick(event: MouseEvent) {
  if (npcContainerRef.value && !npcContainerRef.value.contains(event.target as Node)) {
    isManuallyOpened.value = false
    isHovered.value = false
  }
}

onMounted(() => {
  if (typeof window !== 'undefined') {
    document.addEventListener('click', handleDocumentClick)
  }
})

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') {
    document.removeEventListener('click', handleDocumentClick)
  }
})
</script>

<style scoped>
.npc-hotspot-container {
  position: absolute;
  top: 48%;
  left: 33%;
  width: 14%;
  height: 25%;
  cursor: pointer;
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
}

.npc-avatar-indicator {
  background: radial-gradient(
    circle at 50% 50%,
    var(--guild-parchment-base) 0%,
    var(--guild-parchment-dark) 100%
  );
  border: 2px solid var(--guild-wood-mid);
  border-radius: 50%;
  width: 38px;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.1rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
  transition: transform 0.25s ease, border-color 0.25s ease;
  margin-top: 10px;
}

.npc-hotspot-container:hover .npc-avatar-indicator,
.npc-avatar-indicator.is-active {
  transform: scale(1.15) translateY(-4px);
  border-color: var(--guild-gold-glow);
  box-shadow: 0 6px 16px rgba(220, 160, 40, 0.5);
}

.npc-speech-bubble {
  position: absolute;
  bottom: 85%;
  left: 50%;
  transform: translateX(-50%);
  width: 280px;
  background: radial-gradient(
    circle at 50% 30%,
    #ffffff 0%,
    var(--guild-parchment-base) 100%
  );
  border: 2.5px solid var(--guild-wood-dark);
  border-radius: 14px;
  padding: 0.85rem 1rem;
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.6);
  z-index: 25;
  pointer-events: auto;
}

.bubble-speaker-header {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.75rem;
  font-weight: bold;
  color: var(--guild-wood-dark);
  margin-bottom: 0.35rem;
  border-bottom: 1px dashed rgba(120, 80, 40, 0.3);
  padding-bottom: 0.25rem;
}

.bubble-text {
  font-family: var(--font-guild-body);
  font-size: 0.85rem;
  color: var(--guild-parchment-ink);
  line-height: 1.35;
  margin: 0;
  font-weight: 500;
}

.bubble-click-hint {
  font-size: 0.68rem;
  color: hsl(25, 30%, 45%);
  text-align: right;
  margin-top: 0.4rem;
  font-style: italic;
}

.bubble-tail {
  position: absolute;
  bottom: -10px;
  left: 50%;
  transform: translateX(-50%);
  width: 0;
  height: 0;
  border-left: 9px solid transparent;
  border-right: 9px solid transparent;
  border-top: 10px solid var(--guild-wood-dark);
}

.speech-bubble-pop-enter-active,
.speech-bubble-pop-leave-active {
  transition: opacity 0.25s cubic-bezier(0.34, 1.56, 0.64, 1),
    transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.speech-bubble-pop-enter-from,
.speech-bubble-pop-leave-to {
  opacity: 0;
  transform: translate(-50%, 12px) scale(0.9);
}
</style>
