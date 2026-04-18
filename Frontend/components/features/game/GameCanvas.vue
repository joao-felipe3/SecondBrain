<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { gameConfig } from '~/game/config/gameConfig'
import { useGameStore } from '~/stores/game'
import { useProjectStore } from '~/stores/project'
import { Calendar, BarChart2, Play, X } from 'lucide-vue-next'

/**
 * GameCanvas - Responsável por instanciar o Phaser dentro do Nuxt
 */

const game = ref<Phaser.Game | null>(null)
const gameStore = useGameStore()
const projectStore = useProjectStore()

onMounted(async () => {
  projectStore.loadProjects()

  if (process.client) {
    const PhaserModule = await import('phaser')
    const Phaser = (PhaserModule as any).default || PhaserModule
    game.value = new Phaser.Game(gameConfig)
    
    if (typeof window !== 'undefined') {
      (window as any).game = game.value
    }
  }
})

onBeforeUnmount(() => {
  if (game.value) {
    game.value.destroy(true)
    game.value = null
  }
})

const closePanel = () => {
  gameStore.openPanel(null)
}
</script>

<template>
  <div>
    <!-- Overlay de Transição (z-50) - FORA da div com overflow-hidden -->
    <div v-if="gameStore.isTransitioning" 
         class="fixed inset-0 bg-black z-50 flex items-center justify-center pointer-events-auto">
      <div class="flex flex-col items-center gap-10">
        <div class="relative">
          <img src="/game/guild_shell.png" class="w-[500px] h-[300px] object-cover rounded-[2rem] border-8 border-yellow-900/40 shadow-[0_0_50px_rgba(0,0,0,0.8)] opacity-60 blur-[2px]" />
          <div class="absolute inset-0 flex items-center justify-center scale-150">
             <img src="/game/banner_transparent.png" class="w-32 h-48 object-contain animate-sway drop-shadow-2xl" />
          </div>
        </div>
        <div class="text-yellow-600 text-4xl font-medieval animate-pulse text-center tracking-[0.5em] drop-shadow-lg">
          <span>CARREGANDO...</span>
        </div>
      </div>
    </div>

    <div class="phaser-wrapper relative isolate w-full h-full bg-black overflow-hidden flex items-center justify-center">
      <!-- Container do Phaser (Camada Base) -->
      <div id="game-container" class="relative z-0 rounded-lg shadow-2xl shadow-black/50 border-4 border-yellow-900/30"></div>

      <!-- HUD OVERLAY (VUE) - Camada Superior (z-20) -->
      <div class="hud-layer absolute inset-0 pointer-events-none p-4 flex flex-col justify-between z-[80]">
      
      <!-- TOP BAR -->
      <div class="flex justify-between items-start pointer-events-auto">
        <div class="flex items-start gap-4">
          <!-- Banner Decorativo Esquerdo -->
          <img src="/game/banner_transparent.png" class="w-24 h-40 object-contain -mt-6 drop-shadow-[0_10px_15px_rgba(0,0,0,0.5)] animate-sway opacity-100" />
          
          <div class="bg-[url('/svg/wooden.svg')] bg-cover px-8 py-4 -mt-2 min-w-[280px] flex items-center justify-center drop-shadow-2xl relative border-b-2 border-yellow-900/50">
            <span class="text-3xl font-medieval text-[#4e2a1e] tracking-wider drop-shadow-[0_2px_2px_rgba(255,255,255,0.3)]">TASK RPG</span>
            <!-- Pequeno selo decorativo -->
            <img src="/svg/stamp.svg" class="absolute -right-6 -bottom-6 w-14 h-14 rotate-12 drop-shadow-md" />
          </div>
        </div>

        <div class="flex items-start gap-4">
          <!-- Botões Rápidos / Inventário -->
          <div class="flex flex-col gap-3 mt-4 items-end">
            <button class="p-4 bg-[url('/svg/button.svg')] bg-cover hover:scale-110 active:scale-95 transition-all drop-shadow-xl group">
              <Calendar class="w-8 h-8 text-yellow-100 group-hover:rotate-12 transition-transform" />
            </button>
          </div>
          
          <!-- Banner Decorativo Direito -->
          <img src="/game/banner_transparent.png" class="w-24 h-40 object-contain -mt-6 drop-shadow-[0_10px_15px_rgba(0,0,0,0.5)] animate-sway-reverse opacity-100" />
        </div>
      </div>

      <!-- BOTTOM DECORATIONS (Barris e Tapete visual) -->
      <div class="flex justify-between items-end px-4 pb-4">
        <div class="relative group">
          <img src="/game/barrels_transparent.png" class="w-48 h-48 object-contain drop-shadow-[0_20px_30px_rgba(0,0,0,0.8)] transition-transform group-hover:scale-105" />
          <div class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 rounded-full scale-75">
            <span class="text-yellow-100 font-medieval text-sm tracking-widest bg-yellow-900/80 px-4 py-1 rounded">ESTOQUE</span>
          </div>
        </div>

        <div class="flex flex-col items-center mb-[-20px]">
          <img src="/game/rug_transparent.png" class="w-80 h-20 object-contain opacity-60 drop-shadow-lg" />
        </div>

        <div class="relative group">
          <img src="/game/barrels_transparent.png" class="w-40 h-40 object-contain drop-shadow-[0_20px_30px_rgba(0,0,0,0.8)] -scale-x-100 transition-transform group-hover:scale-105" />
          <img src="/game/barrels_transparent.png" class="absolute -left-10 bottom-0 w-24 h-24 object-contain drop-shadow-2xl opacity-90" />
        </div>
      </div>

      <!-- TOOLTIP DE HOTSPOT -->
      <div v-if="gameStore.hoveredHotspot" 
           class="absolute left-1/2 bottom-40 -translate-x-1/2 px-12 py-5 bg-[url('/svg/old-paper.svg')] bg-cover min-w-[250px] text-center pointer-events-none animate-bounce-slow z-30 drop-shadow-2xl border-2 border-yellow-900/10">
        <span class="text-2xl font-medieval text-[#4e2a1e] uppercase tracking-widest drop-shadow-sm">{{ gameStore.hoveredHotspot }}</span>
      </div>

      <!-- PAINÉIS DE UI (OVERLAYS DIEGÉTICOS) -->
      <div v-if="gameStore.activePanel" 
           class="absolute inset-0 bg-black/70 z-40 flex items-center justify-center pointer-events-auto backdrop-blur-md transition-all" 
           @click.self="closePanel">
        
        <div class="bg-[url('/svg/old-paper-4.svg')] bg-contain bg-no-repeat bg-center p-16 min-w-[700px] min-h-[800px] flex flex-col items-center relative animate-fade-in drop-shadow-[0_35px_60px_-15px_rgba(0,0,0,0.6)]">
          <!-- Decorações laterais do painel -->
          <img src="/game/banner_transparent.png" class="absolute -left-24 top-1/2 -translate-y-1/2 w-32 h-64 object-contain opacity-80 drop-shadow-2xl" />
          <img src="/game/banner_transparent.png" class="absolute -right-24 top-1/2 -translate-y-1/2 w-32 h-64 object-contain opacity-80 drop-shadow-2xl -scale-x-100" />
          
          <!-- Botão fechar (X) -->
          <button @click="closePanel" class="absolute top-24 right-24 p-3 text-yellow-950 hover:scale-125 hover:rotate-90 transition-all drop-shadow-md">
            <X class="w-10 h-10" />
          </button>

          <h2 class="text-5xl font-medieval text-yellow-950 mt-16 mb-10 uppercase underline decoration-double tracking-widest">{{ gameStore.activePanel }}</h2>
          
          <div class="flex-1 w-full flex flex-col items-center justify-center text-yellow-950 font-serif italic text-xl text-center px-16">
            <div class="mb-10 p-8 border-2 border-yellow-900/30 rounded-xl bg-yellow-900/10 shadow-inner">
              <img v-if="gameStore.activePanel === 'tasks'" src="/game/banner_transparent.png" class="w-32 h-32 object-contain mx-auto mb-6 opacity-90 drop-shadow-lg" />
              <img v-if="gameStore.activePanel === 'projects'" src="/game/work_table.png" class="w-48 h-24 object-contain mx-auto mb-6 opacity-90 drop-shadow-lg" />
              <img v-if="gameStore.activePanel === 'calendar'" src="/game/counter.png" class="w-32 h-24 object-contain mx-auto mb-6 opacity-90 drop-shadow-lg" />
              
              <p v-if="gameStore.activePanel === 'tasks'" class="animate-pulse font-bold tracking-wide">Consultando o Mural de Missões...</p>
              <p v-if="gameStore.activePanel === 'projects'" class="animate-pulse font-bold tracking-wide">O Mago está organizando seus Projetos...</p>
              <p v-if="gameStore.activePanel === 'calendar'" class="animate-pulse font-bold tracking-wide">Verificando o pergaminho do Calendário...</p>
            </div>
          </div>

          <button @click="closePanel" class="mb-16 px-14 py-4 bg-[url('/svg/button.svg')] bg-cover text-yellow-100 font-medieval text-2xl hover:brightness-125 active:scale-95 transition-all drop-shadow-xl shadow-black/50">
            VOLTAR À GUILDA
          </button>
        </div>
        </div>
      </div>

    </div>
  </div>
</template>

<style scoped>
#game-container {
  display: block;
  margin: 0;
  padding: 0;
  position: relative;
  z-index: 1;
}

#game-container canvas {
  position: relative !important;
  z-index: 1 !important;
}

.hud-layer {
  position: absolute;
  inset: 0;
  z-index: 80 !important;
}

.font-medieval {
  font-family: 'Irish Grover', cursive;
}

@keyframes bounce-slow {
  0%, 100% { transform: translate(-50%, 0); }
  50% { transform: translate(-50%, -10px); }
}

@keyframes fade-in {
  from { opacity: 0; transform: scale(0.9); }
  to { opacity: 1; transform: scale(1); }
}

@keyframes sway {
  0%, 100% { transform: rotate(-3deg); }
  50% { transform: rotate(3deg); }
}

.animate-sway {
  animation: sway 4s ease-in-out infinite;
}

.animate-sway-reverse {
  animation: sway 4s ease-in-out infinite reverse;
}

.animate-bounce-slow {
  animation: bounce-slow 2s ease-in-out infinite;
}

.animate-fade-in {
  animation: fade-in 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
</style>
