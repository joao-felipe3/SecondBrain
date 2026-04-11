type PertResolvedLayoutMode = 'hierarchical' | 'force'

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
    nodesCount,
    roots,
    dagreRegistered,
    isDenseGraph,
    layoutPreset,
  }: CreateLayoutRunnerParams) => {
    const createLayout = (mode: PertResolvedLayoutMode) => {
      if (mode === 'force') {
        return cy.layout({
          name: 'cose',
          fit: false,
          animate: false,
          randomize: false,
          padding: 40,
          componentSpacing: isDenseGraph ? 128 : 92,
          nodeRepulsion: isDenseGraph ? 14500 : 11000,
          nodeOverlap: 28,
          idealEdgeLength: isDenseGraph ? 168 : 142,
          edgeElasticity: 78,
          gravity: 0.14,
          numIter: isDenseGraph ? 2400 : 1800,
          initialTemp: 240,
          coolingFactor: 0.95,
          minTemp: 1,
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

    const runLayout = (mode: PertResolvedLayoutMode) => {
      try {
        createLayout(mode).run()
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
      const nodes = cy.nodes()
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
