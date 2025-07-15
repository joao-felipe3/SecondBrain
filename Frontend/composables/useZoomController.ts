import { useZoomAnimation } from './useZoomAnimation'
import type { Ref } from 'vue'
import type { Task } from '../models/Task'

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
    const paper = event.currentTarget as HTMLElement
    state.originalRect.value = paper.getBoundingClientRect()
    state.createRef.value = true
    emit('zoom-in')

    await animateZoomIn(paper)
    state.zoomedTask.value = task
    state.zoomed.value = true
  }

  async function zoomOutTask() {
    state.zoomed.value = false
    emit('zoom-out')

    if (state.create.value && state.createRef.value) {
      emit('remove-last-task', state.zoomedTask.value?._id)
    }

    const zoomedEl = document.querySelector('.zoomed-task-paper')
    state.zoomedTask.value = null

    if (zoomedEl instanceof HTMLElement && state.originalRect.value) {
      await animateZoomOut(zoomedEl, state.originalRect.value)
    }

    state.originalRect.value = null
  }

  return {
    zoomIntoTask,
    zoomOutTask,
  }
}
