import { ref, onMounted, onBeforeUnmount, computed } from "vue";
import { breakpointsTailwind, useBreakpoints } from "@vueuse/core";

export function useResponsive() {
  const isMobile = ref(false);
  const isTablet = ref(false);
  const isDesktop = ref(true);
  const isPortrait = ref(false);
  const windowWidth = ref(1200);
  const windowHeight = ref(800);

  // Use VueUse breakpoints if available
  const breakpoints = useBreakpoints(breakpointsTailwind);

  const MOBILE_BREAKPOINT = 960;

  function updateDimensions() {
    if (typeof window !== "undefined") {
      windowWidth.value = window.innerWidth;
      windowHeight.value = window.innerHeight;
      isPortrait.value = window.innerHeight > window.innerWidth;

      // Modo mobile vertical: ativado em orientação Retrato (Portrait) ou em telas extremamente estreitas (< 640px)
      isMobile.value = isPortrait.value || window.innerWidth < 640;
      isTablet.value =
        window.innerWidth >= 640 &&
        window.innerWidth < MOBILE_BREAKPOINT &&
        !isPortrait.value;
      isDesktop.value =
        window.innerWidth >= MOBILE_BREAKPOINT ||
        (!isPortrait.value && window.innerWidth >= 640);
    }
  }

  onMounted(() => {
    updateDimensions();
    window.addEventListener("resize", updateDimensions, { passive: true });
  });

  onBeforeUnmount(() => {
    if (typeof window !== "undefined") {
      window.removeEventListener("resize", updateDimensions);
    }
  });

  return {
    isMobile,
    isTablet,
    isDesktop,
    isPortrait,
    windowWidth,
    windowHeight,
    breakpoint: computed(() => (isMobile.value ? "mobile" : "desktop")),
  };
}
