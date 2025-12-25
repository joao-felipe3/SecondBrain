import { computed, ref, type ComputedRef, type Ref } from 'vue'

export interface UseCarouselResult {
  carouselEl: Ref<HTMLElement | null>
  currentIndex: Ref<number>
  atStart: ComputedRef<boolean>
  atEnd: ComputedRef<boolean>
  go: (dir: number) => void
  updateIndex: () => void
  attach: () => void
  detach: () => void
  reset: () => void
}

export function useCarousel(totalSlides: number): UseCarouselResult {
  const carouselEl = ref<HTMLElement | null>(null)
  const currentIndex = ref(0)

  const atStart = computed(() => currentIndex.value === 0)
  const atEnd = computed(() => currentIndex.value === totalSlides - 1)

  const updateIndex = () => {
    const el = carouselEl.value
    if (!el) return
    const w = el.clientWidth || 1
    currentIndex.value = Math.round(el.scrollLeft / w)
  }

  const go = (dir: number) => {
    const el = carouselEl.value
    if (!el) return
    const w = el.clientWidth
    const next = Math.max(0, Math.min(totalSlides - 1, currentIndex.value + dir))
    el.scrollTo({ left: next * w, behavior: 'smooth' })
    currentIndex.value = next
  }

  const onScroll = () => { requestAnimationFrame(updateIndex) }

  const attach = () => {
    const el = carouselEl.value
    if (!el) return
    el.addEventListener('scroll', onScroll, { passive: true })
  }

  const detach = () => {
    const el = carouselEl.value
    if (!el) return
    el.removeEventListener('scroll', onScroll)
  }

  const reset = () => {
    const el = carouselEl.value
    if (!el) return
    el.scrollTo({ left: 0, behavior: 'auto' })
    currentIndex.value = 0
  }

  return { carouselEl, currentIndex, atStart, atEnd, go, updateIndex, attach, detach, reset }
}
