import type { PertLayoutPreset } from './usePertLayoutEngine'

type PertResolvedLayoutMode = 'hierarchical' | 'force'

type CreatePostProcessParams = {
  cy: any
  isDenseGraph: boolean
  layoutPreset: PertLayoutPreset
  reorderRowsByBarycenter: (cy: any) => void
  rebalanceCrowdedRows: (cy: any, maxNodesPerRow?: number, subRowSpacing?: number, colSpacing?: number) => void
  separateNodeOverlaps: (cy: any, minGap?: number, iterations?: number, verticalStrength?: number) => void
  normalizeWideAspect: (cy: any, maxAspectRatio?: number, minCompression?: number) => void
}

export const usePertPostProcessor = () => {
  const createPostProcess = ({
    cy,
    isDenseGraph,
    layoutPreset,
    reorderRowsByBarycenter,
    rebalanceCrowdedRows,
    separateNodeOverlaps,
    normalizeWideAspect,
  }: CreatePostProcessParams) => {
    const postProcess = (mode: PertResolvedLayoutMode) => {
      if (!cy) return

      if (mode === 'force') {
        // In force-directed layouts we preserve organic placement and only resolve node collisions.
        separateNodeOverlaps(cy, isDenseGraph ? 24 : 18, isDenseGraph ? 16 : 12, 0.58)
        return
      }

      rebalanceCrowdedRows(cy, layoutPreset.rowMax, layoutPreset.rowSpacing, layoutPreset.colSpacing)
      reorderRowsByBarycenter(cy)
      separateNodeOverlaps(cy, isDenseGraph ? 12 : 9, isDenseGraph ? 8 : 5, isDenseGraph ? 0.7 : 0.55)

      if (layoutPreset.normalizeAspect) {
        normalizeWideAspect(cy, layoutPreset.aspect, layoutPreset.minCompression)
      }
    }

    return postProcess
  }

  return {
    createPostProcess,
  }
}
