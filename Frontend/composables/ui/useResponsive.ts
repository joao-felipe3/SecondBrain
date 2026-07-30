import { ref, onMounted, onBeforeUnmount, computed } from 'vue'
import { breakpointsTailwind, useBreakpoints } from '@vueuse/core'

export function useResponsive() {
  const isMobile = ref(false)
  const isTablet = ref(false)
  const isDesktop = ref(true)
  const windowWidth = ref(1200)

  // Use VueUse breakpoints if available
  const breakpoints = useBreakpoints(breakpointsTailwind)
  const mdAndUp = breakpoints.greaterOrEqual('md') // 768px or 960px custom

  const MOBILE_BREAKPOINT = 960

  function updateDimensions() {
    if (typeof window !== 'undefined') {
      windowWidth.value = window.innerWidth
      isMobile.value = window.innerWidth < MOBILE_BREAKPOINT
      isTablet.value = window.innerWidth >= 640 && window.innerWidth < MOBILE_BREAKPOINT
      isDesktop.value = window.innerWidth >= MOBILE_BREAKPOINT
    }
  }

  onMounted(() => {
    updateDimensions()
    window.addEventListener('resize', updateDimensions, { passive: true })
  })

  onBeforeUnmount(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', updateDimensions)
    }
  })

  return {
    isMobile,
    isTablet,
    isDesktop,
    windowWidth,
    breakpoint: computed(() => (isMobile.value ? 'mobile' : 'desktop'))
  }
}
