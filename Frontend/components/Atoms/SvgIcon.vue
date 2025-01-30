<template>
  <div 
    v-if="icon" 
    :class="className" 
    v-html="icon"
    :style="{ padding: '0.25rem', margin: '0', display: 'inline-flex' }"
  ></div>
</template>

<script>
import { ref, watch } from 'vue'

const icons = import.meta.glob('/assets/icons/*.svg', { as: 'raw' })

export default {
  props: {
    name: {
      type: String,
      required: true
    },
    className: {
      type: String,
      default: ''
    },
    style: {
      type: Object,
      default: () => ({})
    }
  },
  setup(props) {
    const icon = ref('')

    const loadIcon = async () => {
      try {
        const iconPath = `/assets/icons/${props.name}.svg`
        if (icons[iconPath]) {
          let svgContent = await icons[iconPath]()

          // Ajustar o conteúdo do SVG para incluir o stroke-width diretamente
          const svgWithStyle = svgContent.replace(
            '<svg',
            `<svg 
              style="width: ${props.style.width || '1em'}; 
                     height: ${props.style.height || '1em'};" 
              stroke="${props.style.color || 'currentColor'}" 
              stroke-width="${props.style.strokeWidth || '1'}"`
          )

          icon.value = svgWithStyle
        } else {
          console.error(`Icon not found: ${props.name}`)
        }
      } catch (error) {
        console.error('Icon not loaded:', error)
      }
    }

    watch(() => props.name, loadIcon, { immediate: true })

    return {
      icon
    }
  }
}
</script>