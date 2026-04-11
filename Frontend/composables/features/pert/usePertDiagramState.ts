import { ref } from 'vue'
import type { PertDiagramEdge, PertDiagramNode } from './usePertDiagramData'

export type PertNodeInsights = {
  directPredecessors: number
  directSuccessors: number
  totalAncestors: number
  totalDescendants: number
  layer: number
  isLocked: boolean
}

export type PertTooltipState = {
  visible: boolean
  x: number
  y: number
  node: PertDiagramNode | null
}

export const usePertDiagramState = () => {
  const selectedNode = ref<PertDiagramNode | null>(null)
  const lockedNodeId = ref<string | null>(null)
  const selectedNodeInsights = ref<PertNodeInsights | null>(null)
  const tooltip = ref<PertTooltipState>({
    visible: false,
    x: 0,
    y: 0,
    node: null,
  })

  const hideTooltip = () => {
    tooltip.value.visible = false
    tooltip.value.node = null
  }

  const buildNodeInsights = (
    nodeId: string,
    nodes: PertDiagramNode[],
    edges: PertDiagramEdge[],
  ) => {
    const predecessorMap = new Map<string, string[]>()
    const successorMap = new Map<string, string[]>()

    for (const node of nodes) {
      predecessorMap.set(node.id, [])
      successorMap.set(node.id, [])
    }

    for (const edge of edges) {
      predecessorMap.set(edge.target, [...(predecessorMap.get(edge.target) || []), edge.source])
      successorMap.set(edge.source, [...(successorMap.get(edge.source) || []), edge.target])
    }

    const walk = (start: string, map: Map<string, string[]>) => {
      const visited = new Set<string>()
      const queue = [...(map.get(start) || [])]
      while (queue.length > 0) {
        const current = queue.shift() as string
        if (visited.has(current)) continue
        visited.add(current)
        const next = map.get(current) || []
        for (const id of next) {
          if (!visited.has(id)) queue.push(id)
        }
      }
      return visited.size
    }

    const node = nodes.find((item) => item.id === nodeId)
    selectedNodeInsights.value = {
      directPredecessors: (predecessorMap.get(nodeId) || []).length,
      directSuccessors: (successorMap.get(nodeId) || []).length,
      totalAncestors: walk(nodeId, predecessorMap),
      totalDescendants: walk(nodeId, successorMap),
      layer: Math.max(0, Number(node?.earlyStart || 0)),
      isLocked: lockedNodeId.value === nodeId,
    }
  }

  return {
    selectedNode,
    lockedNodeId,
    selectedNodeInsights,
    tooltip,
    hideTooltip,
    buildNodeInsights,
  }
}
