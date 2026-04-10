import type { Ref } from 'vue'
import type { PertDiagramNode } from './usePertDiagramData'
import type { PertTooltipState } from './usePertDiagramState'

type UsePertTooltipParams = {
  chartWrapper: Ref<HTMLElement | null>
  tooltip: Ref<PertTooltipState>
  tooltipWidth?: number
  tooltipHeight?: number
  offset?: number
  margin?: number
}

export const usePertTooltip = ({
  chartWrapper,
  tooltip,
  tooltipWidth = 250,
  tooltipHeight = 108,
  offset = 14,
  margin = 8,
}: UsePertTooltipParams) => {
  const updateTooltipPosition = (event: any) => {
    if (!chartWrapper.value || !tooltip.value.visible) return
    const rendered = event?.renderedPosition
    if (!rendered) return

    const wrapperWidth = chartWrapper.value.clientWidth
    const wrapperHeight = chartWrapper.value.clientHeight

    let x = Number(rendered.x ?? 0) + offset
    let y = Number(rendered.y ?? 0) + offset

    x = Math.max(margin, Math.min(x, wrapperWidth - tooltipWidth - margin))
    y = Math.max(margin, Math.min(y, wrapperHeight - tooltipHeight - margin))

    tooltip.value.x = x
    tooltip.value.y = y
  }

  const showTooltip = (node: any, event: any) => {
    const dataNode = node.data('node') as PertDiagramNode | undefined
    if (!dataNode) return

    tooltip.value.node = dataNode
    tooltip.value.visible = true
    updateTooltipPosition(event)
  }

  return {
    updateTooltipPosition,
    showTooltip,
  }
}
