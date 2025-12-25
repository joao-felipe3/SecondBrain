import { ref } from 'vue'

export function useZoomState() {
  const zoomedTask = ref(null)
  const zoomed = ref(false)
  const create = ref(false)
  const createRef = ref(true)
  const originalRect = ref(null)

  return {
    zoomedTask,
    zoomed,
    create,
    createRef,
    originalRect,
  }
}
