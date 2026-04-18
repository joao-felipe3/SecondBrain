<script setup lang="ts">
import GameCanvas from '~/components/features/game/GameCanvas.vue'

definePageMeta({
  layout: false
})
</script>

<template>
  <div class="h-screen w-screen bg-black overflow-hidden flex items-center justify-center">
    <ClientOnly>
      <GameCanvas />
      
      <template #fallback>
        <div class="flex flex-col items-center justify-center gap-4 text-yellow-700">
          <div class="w-12 h-12 border-4 border-yellow-700 border-t-transparent rounded-full animate-spin"></div>
          <p class="font-medieval text-xl">Preparando a Guilda...</p>
        </div>
      </template>
    </ClientOnly>
  </div>
</template>

<style scoped>
.font-medieval {
  font-family: 'Irish Grover', cursive;
}
</style>
