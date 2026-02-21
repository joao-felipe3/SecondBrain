export type WBSNode = {
  _id?: string
  name: string
  description?: string
  level: number
  estimatedHours: number
  children?: WBSNode[]
}

export type LeafNode = {
  node: WBSNode
  path: string
  level: number
  generatedTasks?: any[]
  generatedHours?: number
}

export type ResolutionPayload =
  | { type: 'rebaseline'; hours: number; reason: string }
  | { type: 'dedupe' }
  | { type: 'simplify-to-budget' }
  | { type: 'simplify-to-target'; targetHours: number; reason?: string }
  | { type: 'dedupe-then-rebaseline'; hours: number; reason: string }
  | { type: 'dedupe-then-simplify-to-target'; targetHours: number; reason?: string }
  | { type: 'dedupe-then-simplify-to-budget' }

export function useConversionHelpers() {
  function getPriorityColor(priority: number): string {
    const colors: Record<number, string> = { 1: 'error', 2: 'warning', 3: 'info', 4: 'success' }
    return colors[priority] ?? 'grey'
  }

  function getTaskTypeIcon(type: string): string {
    const icons: Record<string, string> = {
      practice: 'dumbbell',
      produce: 'pencil-box',
      test: 'checkbox-marked-circle',
      consolidate: 'book',
      prepare: 'clipboard-list',
    }
    return icons[String(type || '').toLowerCase()] ?? 'checkbox-blank-circle-outline'
  }

  function formatDate(dateValue: any): string {
    if (!dateValue) return 'N/A'
    try {
      return new Date(dateValue).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    } catch {
      return 'Data inválida'
    }
  }

  function getBudgetDiffPercentage(generatedHours: number, estimatedHours: number): number {
    return estimatedHours > 0 ? ((generatedHours - estimatedHours) / estimatedHours) * 100 : 0
  }

  function getBudgetDiffClass(diffPercent: number): string {
    if (diffPercent > 50) return 'text-error font-weight-bold'
    if (diffPercent > 20) return 'text-warning font-weight-bold'
    if (diffPercent < -10) return 'text-info'
    return 'text-success'
  }

  return { getPriorityColor, getTaskTypeIcon, formatDate, getBudgetDiffPercentage, getBudgetDiffClass }
}
