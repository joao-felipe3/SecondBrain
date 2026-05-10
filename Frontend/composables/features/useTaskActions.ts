import { useTaskStore } from '~/stores/task'
import type { Task } from '~/models/Task'
import type { Ref } from 'vue'

export function useTaskActions(params: {
  emit: (event: string, payload?: any) => void,
  zoomOutTask: () => Promise<void> | void,
  createRef: Ref<boolean>,
  create: Ref<boolean>,
}) {
  const { emit, zoomOutTask, createRef, create } = params
  const taskStore = useTaskStore()

  async function handleEdit(task: Task) {
    const { _id, ...data } = task
    const isCreate = create.value || !_id

    if (isCreate) {
      const type = (task as any)?.microTaskType
      if (type === 'habit') {
        await taskStore.createHabit(data as any)
      } else if (type) {
        await taskStore.createMicroTask(data as any)
      } else {
        await taskStore.createTask(data)
      }
      emit('remove-last-task')
      createRef.value = false
    } else {
      await taskStore.updateTask(_id as any, task)
    }
    zoomOutTask()
  }

  async function handleDelete(taskId: string) {
    await zoomOutTask()
    await taskStore.deleteTask(taskId)
    emit('remove-last-task', taskId)

    createFallAnimation(taskId)
  }

  function handleCompleteFall(taskId: string) {
    emit('remove-last-task', taskId)
    createFallAnimation(taskId)
  }

  function createFallAnimation(taskId: string) {
    const paperEl = document.querySelector(`[data-task-id="${taskId}"]`) as HTMLElement | null
    if (!paperEl) return

    const rect = paperEl.getBoundingClientRect()
    const clone = paperEl.cloneNode(true) as HTMLElement

    Object.assign(clone.style, {
      position: 'fixed',
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      transition: 'transform 1s ease, opacity 1s ease',
      zIndex: 9999,
      pointerEvents: 'none',
    })

    document.body.appendChild(clone)

    void clone.offsetWidth

    clone.style.transform = 'translateY(200px) rotateZ(30deg)'
    clone.style.opacity = '0'

    setTimeout(() => {
      document.body.removeChild(clone)
    }, 1000)
  }

  return {
    handleEdit,
    handleDelete,
    handleCompleteFall,
  }
}
