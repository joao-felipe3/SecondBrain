import type { PertDiagramEdge } from './usePertDiagramData'

type PertResolvedLayoutMode = 'hierarchical' | 'radial'
type PertRadialVariant = 'preset' | 'concentric' | 'circle'

type GraphLevels = {
  levelById: Map<string, number>
  maxLayer: number
  startIds: string[]
}

export type PertLayoutPreset = {
  nodeSep: number
  edgeSep: number
  rankSep: number
  rowMax: number
  rowSpacing: number
  colSpacing: number
  aspect: number
  minCompression: number
  normalizeAspect: boolean
  zoomBoostCap: number
}

type CreateLayoutRunnerParams = {
  cy: any
  edges: PertDiagramEdge[]
  nodesCount: number
  roots: string[]
  dagreRegistered: boolean
  graphLevels: GraphLevels
  isDenseGraph: boolean
  layoutPreset: PertLayoutPreset
}

export const usePertLayoutEngine = () => {
  const buildLayoutPreset = (totalNodes: number, isDenseGraph: boolean): PertLayoutPreset => {
    if (totalNodes <= 20) {
      return {
        nodeSep: isDenseGraph ? 58 : 62,
        edgeSep: 34,
        rankSep: 112,
        rowMax: 8,
        rowSpacing: 88,
        colSpacing: 88,
        aspect: 1.85,
        minCompression: 0.64,
        normalizeAspect: true,
        zoomBoostCap: 1.55,
      }
    }

    if (totalNodes <= 34) {
      return {
        nodeSep: isDenseGraph ? 54 : 58,
        edgeSep: 40,
        rankSep: 104,
        rowMax: 7,
        rowSpacing: 84,
        colSpacing: 82,
        aspect: 1.7,
        minCompression: 0.68,
        normalizeAspect: true,
        zoomBoostCap: 1.48,
      }
    }

    return {
      nodeSep: isDenseGraph ? 62 : 66,
      edgeSep: 38,
      rankSep: 118,
      rowMax: 8,
      rowSpacing: 98,
      colSpacing: 98,
      aspect: 2.4,
      minCompression: 0.78,
      normalizeAspect: false,
      zoomBoostCap: 1.18,
    }
  }

  const createLayoutRunner = ({
    cy,
    edges,
    nodesCount,
    roots,
    dagreRegistered,
    graphLevels,
    isDenseGraph,
    layoutPreset,
  }: CreateLayoutRunnerParams) => {
    const createLayout = (
      mode: PertResolvedLayoutMode,
      radialVariant: PertRadialVariant = 'preset',
    ) => {
      if (mode === 'radial') {
        const buildRadialPresetPositions = () => {
          if (!cy) return {}

          const positions: Record<string, { x: number; y: number }> = {}
          const layerMap = new Map<number, any[]>()
          const predecessorByNodeId = new Map<string, string[]>()

          for (const edge of edges) {
            const predecessors = predecessorByNodeId.get(edge.target) || []
            predecessors.push(edge.source)
            predecessorByNodeId.set(edge.target, predecessors)
          }

          const normalizeAngle = (angle: number) => {
            let value = angle
            while (value < 0) value += Math.PI * 2
            while (value >= Math.PI * 2) value -= Math.PI * 2
            return value
          }

          const averageCircularAngle = (angles: number[]) => {
            if (!angles.length) return null
            const x = angles.reduce((sum: number, angle: number) => sum + Math.cos(angle), 0)
            const y = angles.reduce((sum: number, angle: number) => sum + Math.sin(angle), 0)
            if (Math.abs(x) < 1e-6 && Math.abs(y) < 1e-6) return null
            return normalizeAngle(Math.atan2(y, x))
          }

          const projectAngleToSector = (angle: number, sectorStart: number, sectorEnd: number) => {
            const start = normalizeAngle(sectorStart)
            const end = normalizeAngle(sectorEnd)
            const normalized = normalizeAngle(angle)

            if (start <= end) {
              if (normalized < start) return start
              if (normalized > end) return end
              return normalized
            }

            const inWrappedSector = normalized >= start || normalized <= end
            if (inWrappedSector) return normalized

            const toStart = Math.min(Math.abs(normalized - start), Math.abs(normalized - start + Math.PI * 2))
            const toEnd = Math.min(Math.abs(normalized - end), Math.abs(normalized - end + Math.PI * 2))
            return toStart <= toEnd ? start : end
          }

          const angleByNodeId = new Map<string, number>()
          const groupSize = new Map<string, number>()
          const groupKeyByNodeId = new Map<string, string>()

          cy.nodes().not('.outer-route-node').forEach((node: any) => {
            const groupKey = String(node.data('groupKey') || 'task')
            groupKeyByNodeId.set(String(node.id()), groupKey)
            groupSize.set(groupKey, (groupSize.get(groupKey) || 0) + 1)
          })

          const groupEntries = Array.from(groupSize.entries())
            .map(([key, size]) => ({ key, size }))
            .sort((a, b) => b.size - a.size || a.key.localeCompare(b.key))

          const maxGroupSectors = 10
          const groups = groupEntries.length > maxGroupSectors
            ? [
                ...groupEntries.slice(0, maxGroupSectors - 1),
                {
                  key: 'Other',
                  size: groupEntries
                    .slice(maxGroupSectors - 1)
                    .reduce((sum: number, entry: { key: string; size: number }) => sum + entry.size, 0),
                },
              ]
            : groupEntries

          const groupSectorIndex = new Map<string, number>()
          groups.forEach((group, index) => {
            groupSectorIndex.set(group.key, index)
          })

          const sectorCount = Math.max(1, groups.length)
          const groupKeyToSector = (nodeId: string) => {
            const groupKey = groupKeyByNodeId.get(nodeId) || 'task'
            if (groupSectorIndex.has(groupKey)) return groupSectorIndex.get(groupKey) as number
            return groupSectorIndex.get('Other') ?? 0
          }

          cy.nodes().not('.outer-route-node').forEach((node: any) => {
            const layer = Number(node.data('layer') || 0)
            if (!layerMap.has(layer)) layerMap.set(layer, [])
            layerMap.get(layer)?.push(node)
          })

          const layers = Array.from(layerMap.keys()).sort((a, b) => a - b)
          if (layers.length === 0) return positions

          const maxNodesPerLayer = layers.reduce((max: number, layer: number) => {
            const size = (layerMap.get(layer) || []).length
            return Math.max(max, size)
          }, 1)

          const centerX = 0
          const centerY = 0
          const minArcSpacing = isDenseGraph
            ? (maxNodesPerLayer > 14 ? 138 : maxNodesPerLayer > 10 ? 124 : 110)
            : 82
          const baseRingGap = isDenseGraph
            ? (maxNodesPerLayer > 14 ? 168 : maxNodesPerLayer > 10 ? 154 : 142)
            : 104
          let currentRadius = Math.max(baseRingGap * 1.18, 112)

          for (const layer of layers) {
            const nodesInLayer = layerMap.get(layer) || []
            if (nodesInLayer.length === 0) continue

            const annotated = [...nodesInLayer].map((node) => {
              const nodeId = String(node.id())
              const predecessorIds = predecessorByNodeId.get(nodeId) || []
              const predecessorAngles = predecessorIds
                .map((id) => angleByNodeId.get(id))
                .filter((angle): angle is number => Number.isFinite(angle as number))
              const anchorAngle = averageCircularAngle(predecessorAngles)
              const sectorIndex = groupKeyToSector(nodeId)
              const groupKey = groupKeyByNodeId.get(nodeId) || 'task'

              return {
                node,
                anchorAngle,
                groupKey,
                sectorIndex,
              }
            })

            const sectorSweep = (Math.PI * 2) / sectorCount
            const sectorPadding = Math.min(sectorSweep * 0.18, 0.22)
            const annotatedBySector = new Map<number, typeof annotated>()
            for (let sector = 0; sector < sectorCount; sector += 1) {
              annotatedBySector.set(sector, [])
            }
            for (const item of annotated) {
              const bucket = annotatedBySector.get(item.sectorIndex) || []
              bucket.push(item)
              annotatedBySector.set(item.sectorIndex, bucket)
            }

            const orderedBySector: Array<{ node: any; angle: number }> = []
            for (let sector = 0; sector < sectorCount; sector += 1) {
              const items = annotatedBySector.get(sector) || []
              if (!items.length) continue

              const sectorStart = -Math.PI / 2 + sector * sectorSweep + sectorPadding
              const sectorEnd = -Math.PI / 2 + (sector + 1) * sectorSweep - sectorPadding
              const span = Math.max(0.05, sectorEnd - sectorStart)

              const sortedSector = items.sort((a, b) => {
                const projectedA = a.anchorAngle === null
                  ? null
                  : projectAngleToSector(a.anchorAngle, sectorStart, sectorEnd)
                const projectedB = b.anchorAngle === null
                  ? null
                  : projectAngleToSector(b.anchorAngle, sectorStart, sectorEnd)

                if (projectedA !== null && projectedB !== null) {
                  return projectedA - projectedB
                }
                if (projectedA !== null) return -1
                if (projectedB !== null) return 1

                const outA = Number(a.node.data('outDegree') || 0)
                const outB = Number(b.node.data('outDegree') || 0)
                if (outA !== outB) return outB - outA
                return String(a.node.id()).localeCompare(String(b.node.id()))
              })

              const count = sortedSector.length
              const step = count <= 1 ? 0 : span / (count - 1)
              sortedSector.forEach((item, index) => {
                const angle = count <= 1 ? sectorStart + span / 2 : sectorStart + step * index
                orderedBySector.push({ node: item.node, angle: normalizeAngle(angle) })
              })
            }

            const orderedNodes = orderedBySector.map((item) => item.node)

            const requiredRadius = Math.max(
              currentRadius,
              (orderedNodes.length * minArcSpacing) / (2 * Math.PI),
              baseRingGap,
            )
            currentRadius = requiredRadius

            orderedBySector.forEach((item) => {
              const nodeId = String(item.node.id())
              const angle = item.angle
              positions[nodeId] = {
                x: centerX + Math.cos(angle) * currentRadius,
                y: centerY + Math.sin(angle) * currentRadius,
              }
              angleByNodeId.set(nodeId, angle)
            })

            currentRadius += baseRingGap
          }

          return positions
        }

        if (radialVariant === 'preset') {
          const positions = buildRadialPresetPositions()
          return cy.layout({
            name: 'preset',
            fit: false,
            animate: false,
            padding: 34,
            positions,
          })
        }

        if (radialVariant === 'circle') {
          return cy.layout({
            name: 'circle',
            fit: false,
            animate: false,
            avoidOverlap: true,
            padding: 34,
            spacingFactor: isDenseGraph ? 1.34 : 1.22,
            sort: (a: any, b: any) => {
              const nodeAId = String(a.id())
              const nodeBId = String(b.id())
              const layerA = graphLevels.levelById.get(nodeAId) || 0
              const layerB = graphLevels.levelById.get(nodeBId) || 0
              if (layerA !== layerB) return layerA - layerB

              const outA = Number(a.data('outDegree') || 0)
              const outB = Number(b.data('outDegree') || 0)
              return outB - outA
            },
          })
        }

        return cy.layout({
          name: 'concentric',
          fit: false,
          animate: false,
          avoidOverlap: true,
          minNodeSpacing: isDenseGraph ? 34 : 24,
          padding: 30,
          startAngle: -Math.PI / 2,
          sweep: Math.PI * 2,
          clockwise: true,
          equidistant: true,
          concentric: (node: any) => {
            const nodeId = String(node.id())
            const layer = graphLevels.levelById.get(nodeId) || 0
            const outDegree = Number(node.data('outDegree') || 0)
            const criticalBoost = node.hasClass('critical-node') ? 8 : 0
            const readyBoost = node.hasClass('ready-node') ? 4 : 0
            return (graphLevels.maxLayer - layer + 1) * 100 + outDegree * 3 + criticalBoost + readyBoost
          },
          levelWidth: () => (isDenseGraph ? 140 : 110),
        })
      }

      if (dagreRegistered) {
        return cy.layout({
          name: 'dagre',
          rankDir: 'TB',
          ranker: 'network-simplex',
          acyclicer: 'greedy',
          align: 'UL',
          nodeSep: layoutPreset.nodeSep,
          edgeSep: layoutPreset.edgeSep,
          rankSep: layoutPreset.rankSep,
          animate: false,
          fit: false,
          padding: 28,
        })
      }

      return cy.layout({
        name: 'breadthfirst',
        directed: true,
        circle: false,
        roots,
        spacingFactor: nodesCount > 80 ? 1.7 : 2.1,
        nodeDimensionsIncludeLabels: true,
        avoidOverlap: true,
        padding: 26,
        animate: false,
      })
    }

    const runLayout = (
      mode: PertResolvedLayoutMode,
      radialVariant: PertRadialVariant = 'preset',
    ) => {
      try {
        createLayout(mode, radialVariant).run()
        return true
      } catch {
        return false
      }
    }

    const isInvalidBounds = (bounds: any) => {
      const width = Number(bounds?.w || 0)
      const height = Number(bounds?.h || 0)
      return !Number.isFinite(width) || !Number.isFinite(height) || width < 2 || height < 2
    }

    const hasInvalidNodePositions = () => {
      if (!cy) return true
      return cy.nodes().toArray().some((node: any) => {
        const pos = node.position()
        const x = Number(pos?.x)
        const y = Number(pos?.y)
        return !Number.isFinite(x) || !Number.isFinite(y)
      })
    }

    const hasInvalidGeometry = () => {
      if (!cy) return true
      const nodes = cy.nodes().not('.outer-route-node')
      if (!nodes || nodes.length === 0) return true
      const bounds = nodes.boundingBox()
      return isInvalidBounds(bounds) || hasInvalidNodePositions()
    }

    const fitGraph = () => {
      if (!cy) return
      cy.resize()
      cy.fit(undefined, 28)
    }

    return {
      runLayout,
      hasInvalidGeometry,
      fitGraph,
    }
  }

  return {
    buildLayoutPreset,
    createLayoutRunner,
  }
}
