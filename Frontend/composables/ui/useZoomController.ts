import { useZoomAnimation } from './useZoomAnimation'
import type { Ref } from 'vue'
import type { Task } from '../../models/Task'

type EmitFn = (event: string, payload?: any) => void

interface ZoomState {
  zoomedTask: Ref<Task | null>
  zoomed: Ref<boolean>
  create: Ref<boolean>
  createRef: Ref<boolean>
  originalRect: Ref<DOMRect | null>
}

export function useZoomController({ emit, state }: { emit: EmitFn; state: ZoomState }) {
  const { animateZoomIn, animateZoomOut } = useZoomAnimation()

  async function zoomIntoTask(event: MouseEvent, task: Task) {
    const target = event.currentTarget as HTMLElement | null
    const paper = (target?.querySelector?.('.task-paper') as HTMLElement | null) ?? target
    if (!paper) return

    state.originalRect.value = paper.getBoundingClientRect()
    state.createRef.value = true
    // Lock UI interactions (ex.: drag-and-drop) as soon as zoom begins.
    state.zoomed.value = true
    emit('zoom-in')

    await animateZoomIn(paper)
    state.zoomedTask.value = task
  }

  async function zoomOutTask() {
    const zoomedEl = document.querySelector('.zoomed-task-paper')
    const originalRect = state.originalRect.value

    const shouldRemoveLastTask = state.create.value && state.createRef.value
    const zoomedTaskId = state.zoomedTask.value?._id

    // Start the animation FIRST while the element is still mounted.
    const animationPromise =
      zoomedEl instanceof HTMLElement && originalRect
        ? animateZoomOut(zoomedEl, originalRect)
        : Promise.resolve()

    // Immediately unlock the board/UI (prevents the “lag” feeling).
    state.zoomed.value = false
    emit('zoom-out')

    // Tear down the overlay while the clone animates back to its origin.
    state.zoomedTask.value = null

    if (shouldRemoveLastTask) {
      emit('remove-last-task', zoomedTaskId)
    }

    await animationPromise
    state.originalRect.value = null
  }

  return {
    zoomIntoTask,
    zoomOutTask,
  }
}
