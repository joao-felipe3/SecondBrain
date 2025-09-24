<template>
  <svg
    width="894.7"
    height="1134.3"
    viewBox="0 0 894.7 1134.3"
    xmlns="http://www.w3.org/2000/svg"
    xmlns:svg="http://www.w3.org/2000/svg"
    :class="{ tinted: tint }"
  >
    <g class="layer">
      <title>Layer 1</title>
      <g data-name="Camada 2" id="svg_1">
        <path d="m762.8,1134.3l-630.9,0a32.7,32.7 0 0 1 -32.7,-30.7l-57.4,-880.9l811.1,0l-57.4,880.9a32.7,32.7 0 0 1 -32.7,30.7zm-149.8,-1134.3l-331.3,0a40.6,40.6 0 0 0 -37.3,24.7l-36.5,86l479,0l-36.6,-86a40.5,40.5 0 0 0 -37.3,-24.7z" fill="#c1cad3" id="svg_2"/>
        <rect fill="#dae0e5" height="165.32" id="svg_3" rx="25" width="894.7" y="94.5"/>
        <rect fill="#a2afba" height="686.23" id="svg_4" rx="39.5" width="78.9" x="407.9" y="353.2"/>
        <path d="m271.7,1038.9a39.5,39.5 0 0 1 -41.7,-37.1l-36.2,-606.2a39.4,39.4 0 0 1 37,-41.8l2.4,0a39.5,39.5 0 0 1 39.4,37.1l36.2,606.2a39.5,39.5 0 0 1 -37.1,41.8zm351.3,0a39.5,39.5 0 0 0 41.8,-37.1l36.2,-606.2a39.5,39.5 0 0 0 -37.1,-41.8l-2.3,0a39.4,39.4 0 0 0 -39.4,37.1l-36.2,606.2a39.5,39.5 0 0 0 37,41.8z" fill="#a2afba" id="svg_5"/>
      </g>
    </g>
  </svg>
</template>

<script setup>
const props = defineProps({
  // When true, icon becomes monochrome using currentColor
  tint: { type: Boolean, default: false },
})
</script>

<style scoped>
/* Only apply currentColor when tint mode is enabled */
.tinted path,
.tinted rect {
  fill: currentColor !important;
}
</style>