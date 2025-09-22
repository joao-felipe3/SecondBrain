<template>
 <svg width="233.6" height="12.3" xmlns="http://www.w3.org/2000/svg" xmlns:svg="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
 <defs>
  <radialGradient cx="7.71" cy="2.99" gradientUnits="userSpaceOnUse" :id="`progressbar-a-${projectId}`" r="8.63">
   <stop offset="0" :stop-color="lightColor"/>
   <stop offset="1" :stop-color="darkColor"/>
  </radialGradient>
  <radialGradient cx="7.54" cy="9.27" gradientUnits="userSpaceOnUse" :id="`progressbar-b-${projectId}`" r="7.94">
   <stop offset="0" :stop-color="mediumColor"/>
   <stop offset="1" :stop-color="darkerColor"/>
  </radialGradient>
  <radialGradient cx="7.93" cy="1.49" gradientUnits="userSpaceOnUse" :id="`progressbar-c-${projectId}`" r="22.35">
   <stop offset="0" :stop-color="lighterColor"/>
   <stop offset="1"/>
  </radialGradient>
  <radialGradient cx="500.89" cy="2.99" gradientTransform="matrix(-1 0 0 1 726.76 0)" :id="`progressbar-h-${projectId}`" r="8.63" :xlink:href="`#progressbar-a-${projectId}`"/>
  <radialGradient cx="500.72" cy="9.27" gradientTransform="matrix(-1 0 0 1 726.76 0)" :id="`progressbar-i-${projectId}`" r="7.94" :xlink:href="`#progressbar-b-${projectId}`"/>
  <radialGradient cx="501.12" cy="1.49" gradientTransform="matrix(-1 0 0 1 726.76 0)" :id="`progressbar-j-${projectId}`" r="22.35" :xlink:href="`#progressbar-c-${projectId}`"/>
  <linearGradient :id="`progressbar-d-${projectId}`" x1="0.5" x2="0.5" y1="1.01" y2="0.01">
   <stop offset="0" :stop-color="darkColor"/>
   <stop offset="1" :stop-color="mediumColor"/>
  </linearGradient>
  <linearGradient :id="`progressbar-e-${projectId}`" x1="0.5" x2="0.5" y1="1.01" y2="0">
   <stop offset="0" :stop-color="lightColor"/>
   <stop offset="1" :stop-color="mediumColor"/>
  </linearGradient>
  <linearGradient :id="`progressbar-f-${projectId}`" x1="0.5" x2="0.5" y1="0.99" y2="0.01">
   <stop offset="0" :stop-color="darkColor"/>
   <stop offset="1" :stop-color="darkerColor"/>
  </linearGradient>
 </defs>
 <g class="layer">
  <title>Layer 1</title>
  <g data-name="Camada 2" id="svg_1">
   <g data-name="Layer 1" id="svg_2">
    <path d="m6.1,12.3c-2.3,-2.1 -4.3,-4.2 -6.1,-6.2c1.8,-1.9 3.8,-4 6.1,-6.1l221.3,0c2.3,2.1 4.4,4.2 6.2,6.1c-1.8,2 -3.9,4.1 -6.2,6.2l-221.3,0z" :fill="mediumColor" fill-rule="evenodd" id="svg_3"/>
    <path d="m3.9,6.1l3.3,3.3l219.1,0a35.1,35.1 0 0 0 3.4,-3.3l-3.4,-3.3l-219.1,0l-3.3,3.3z" :fill="`url(#progressbar-d-${projectId})`" fill-rule="evenodd" id="svg_4"/>
    <path d="m7.2,2.8l219.1,0l1.1,-2.8l-221.3,0l1.1,2.8z" :fill="`url(#progressbar-e-${projectId})`" fill-rule="evenodd" id="svg_5"/>
    <path d="m7.2,9.4l219.1,0l1.1,2.9l-221.3,0l1.1,-2.9z" :fill="`url(#progressbar-f-${projectId})`" fill-rule="evenodd" id="svg_6"/>
    <path d="m0,6.1l3.9,0l3.3,-3.3l-1.1,-2.8c-2.3,2.1 -4.3,4.2 -6.1,6.1z" :fill="`url(#progressbar-a-${projectId})`" fill-rule="evenodd" id="svg_8"/>
    <path d="m0,6.1l3.9,0l3.3,3.3l-1.1,2.9c-2.3,-2.1 -4.3,-4.2 -6.1,-6.2z" :fill="`url(#progressbar-b-${projectId})`" fill-rule="evenodd" id="svg_9"/>
    <path d="m4.4,5.6l2.6,-2.8l-0.7,-2.3l1.1,2.1l19.5,0.2l-19.6,0.2l-2.9,2.6z" :fill="`url(#progressbar-c-${projectId})`" fill-rule="evenodd" id="svg_10" transform="matrix(1 0 0 1 0 0)"/>
    <path d="m233.6,6.1l-3.9,0l-3.4,-3.3l1.1,-2.8c2.3,2.1 4.4,4.2 6.2,6.1z" :fill="`url(#progressbar-h-${projectId})`" fill-rule="evenodd" id="svg_11"/>
    <path d="m233.6,6.1l-3.9,0a35.1,35.1 0 0 1 -3.4,3.3l1.1,2.9c2.3,-2.1 4.4,-4.2 6.2,-6.2z" :fill="`url(#progressbar-i-${projectId})`" fill-rule="evenodd" id="svg_12"/>
    <path d="m229.2,5.6l-2.6,-2.8l0.6,-2.3l-1,2.1l-19.5,0.2l19.5,0.2l3,2.6z" :fill="`url(#progressbar-j-${projectId})`" fill-rule="evenodd" id="svg_13"/>
   </g>
  </g>
 </g>
</svg>
</template>


<script setup>
import { computed } from 'vue'

const props = defineProps({
  projectColor: {
    type: String,
    default: '#4CAF50'
  },
  projectId: {
    type: String,
    default: 'default'
  }
})

// Função para converter hex para HSL
function hexToHsl(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h, s, l = (max + min) / 2

  if (max === min) {
    h = s = 0
  } else {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break
      case g: h = (b - r) / d + 2; break
      case b: h = (r - g) / d + 4; break
    }
    h /= 6
  }

  return [h * 360, s * 100, l * 100]
}

// Função para converter HSL para hex
function hslToHex(h, s, l) {
  l /= 100
  const a = s * Math.min(l, 1 - l) / 100
  const f = n => {
    const k = (n + h / 30) % 12
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)
    return Math.round(255 * color).toString(16).padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

// Gerar variações de cor baseadas na cor do projeto
const lightColor = computed(() => {
  const [h, s, l] = hexToHsl(props.projectColor)
  return hslToHex(h, Math.max(s - 20, 0), Math.min(l + 30, 95))
})

const mediumColor = computed(() => {
  return props.projectColor
})

const darkColor = computed(() => {
  const [h, s, l] = hexToHsl(props.projectColor)
  return hslToHex(h, Math.min(s + 10, 100), Math.max(l - 15, 10))
})

const darkerColor = computed(() => {
  const [h, s, l] = hexToHsl(props.projectColor)
  return hslToHex(h, Math.min(s + 20, 100), Math.max(l - 30, 5))
})

const lighterColor = computed(() => {
  const [h, s, l] = hexToHsl(props.projectColor)
  return hslToHex(h, Math.max(s - 30, 0), Math.min(l + 40, 98))
})

// Expor as variáveis para o template
const projectId = computed(() => props.projectId)
</script>
