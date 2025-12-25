import { ref, type Ref } from 'vue'

export interface Sparkle { id: number; x: number; y: number; delay: number; duration: number; size: number; hue: number }

export interface UseSparklesResult {
  sparkles: Ref<Sparkle[]>
  createSparkles: (amount?: number) => void
  clearSparkles: () => void
}

export function useSparkles(): UseSparklesResult {
  const sparkles = ref<Sparkle[]>([])
  let sparkleId = 0

  function createSparkles(amount = 42) {
    const arr: Sparkle[] = []
    for (let i = 0; i < amount; i++) {
      arr.push({
        id: sparkleId++,
        x: Math.random() * 100,
        y: Math.random() * 100,
        delay: Math.random() * 900,
        duration: 2500 + Math.random() * 4000,
        size: 6 + Math.random() * 16,
        hue: 35 + Math.random() * 25,
      })
    }
    sparkles.value = arr
  }

  function clearSparkles() {
    sparkles.value = []
  }

  return { sparkles, createSparkles, clearSparkles }
}
