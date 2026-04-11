import type { PertDiagramEdge, PertDiagramNode } from '~/composables/features/pert/usePertDiagramData'

export type PertGraphLevels = {
  levelById: Map<string, number>
  maxLayer: number
  startIds: string[]
}

export const usePertGraphTopology = () => {
  const getRootNodeIds = (nodes: PertDiagramNode[], edges: PertDiagramEdge[]) => {
    const hasIncoming = new Set<string>()
    for (const edge of edges) hasIncoming.add(edge.target)
    return nodes
      .filter((node) => !hasIncoming.has(node.id))
      .map((node) => node.id)
  }

  const computeGraphLevels = (nodes: PertDiagramNode[], edges: PertDiagramEdge[]): PertGraphLevels => {
    const inDegree = new Map<string, number>()
    const childrenById = new Map<string, string[]>()

    for (const node of nodes) {
      inDegree.set(node.id, 0)
      childrenById.set(node.id, [])
    }

    for (const edge of edges) {
      inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1)
      const children = childrenById.get(edge.source) || []
      children.push(edge.target)
      childrenById.set(edge.source, children)
    }

    const startIds = nodes
      .filter((node) => (inDegree.get(node.id) || 0) === 0)
      .map((node) => node.id)

    const levelById = new Map<string, number>()
    const queue: string[] = [...startIds]
    for (const id of startIds) levelById.set(id, 0)

    while (queue.length > 0) {
      const current = queue.shift() as string
      const currentLevel = levelById.get(current) || 0
      const children = childrenById.get(current) || []
      for (const child of children) {
        const nextLevel = currentLevel + 1
        const existing = levelById.get(child)
        if (existing === undefined || nextLevel > existing) {
          levelById.set(child, nextLevel)
          queue.push(child)
        }
      }
    }

    let maxLayer = 0
    for (const node of nodes) {
      maxLayer = Math.max(maxLayer, levelById.get(node.id) || 0)
    }

    return { levelById, maxLayer, startIds }
  }

  return {
    getRootNodeIds,
    computeGraphLevels,
  }
}
