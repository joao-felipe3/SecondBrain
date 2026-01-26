import { ref, computed, type Ref, type ComputedRef } from 'vue'
import type { Project } from '~/models/Project'

export interface UseProjectEditingResult {
  editing: Ref<boolean>
  saving: Ref<boolean>
  draft: Ref<Project | null>
  displayProject: ComputedRef<Project | null>
  isValid: ComputedRef<boolean>
  startEdit: (project: Project | null) => void
  cancelEdit: () => void
  updateField: (field: string, value: any) => void
  reset: () => void
}

export function getProjectId(p: Project | null) {
  return p?._id ?? p?.id
}

export function useProjectEditing(source: Ref<Project | null>): UseProjectEditingResult {
  const editing = ref(false)
  const saving = ref(false)
  const draft = ref<Project | null>(null)

  const displayProject = computed(() => (editing.value ? draft.value : source.value))

  const startEdit = (project: Project | null) => {
    if (!project) return
    draft.value = JSON.parse(JSON.stringify(project))
    editing.value = true
  }

  const cancelEdit = () => {
    editing.value = false
    draft.value = null
  }

  const updateField = (field: string, value: any) => {
    if (!editing.value || !draft.value) return
    draft.value[field] = value
  }

  const isValid = computed(() => {
    if (!editing.value || !draft.value) return true
    return Boolean(String(draft.value.name ?? '').trim())
  })

  const reset = () => {
    editing.value = false
    saving.value = false
    draft.value = null
  }

  return { editing, saving, draft, displayProject, isValid, startEdit, cancelEdit, updateField, reset }
}
