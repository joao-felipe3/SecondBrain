type CytoscapeFactory = any

const buildPertGraphStyles = () => [
  {
    selector: 'node',
    style: {
      label: 'data(label)',
      'text-wrap': 'wrap',
      'text-max-width': '160px',
      'text-valign': 'bottom',
      'text-halign': 'center',
      'text-margin-y': 34,
      color: '#ffffff',
      'font-size': 10,
      shape: 'ellipse',
      width: 'data(visualSize)',
      height: 'data(visualSize)',
      'border-width': 'data(slackBorderWidth)',
      'border-color': 'data(slackSemanticColor)',
      'border-opacity': 1,
      'z-index-compare': 'manual',
      'z-index': 30,
      opacity: 1,
    },
  },
  {
    selector: '.start-node',
    style: {
      'background-color': '#fbc02d',
      'border-width': 3,
      color: '#212121',
    },
  },
  {
    selector: '.ready-node',
    style: {
      'background-color': '#00acc1',
      'border-width': 3,
    },
  },
  {
    selector: '.unavailable-node',
    style: {
      'background-color': '#b0bec5',
      color: '#37474f',
      opacity: 0.65,
    },
  },
  {
    selector: '.path-focus',
    style: {
      opacity: 1,
    },
  },
  {
    selector: '.path-dim',
    style: {
      opacity: 0.44,
    },
  },
  {
    selector: '.short-label',
    style: {
      label: 'data(shortLabel)',
      'text-max-width': '120px',
    },
  },
  {
    selector: '.show-slack',
    style: {
      label: 'data(labelWithSlack)',
      'line-height': 1.18,
      'text-margin-y': 38,
    },
  },
  {
    selector: '.no-label',
    style: {
      label: '',
    },
  },
  {
    selector: '.slack-critical-node',
    style: {
      'border-width': 5,
    },
  },
  {
    selector: '.slack-near-node',
    style: {
      'border-width': 4,
    },
  },
  {
    selector: '.slack-safe-node',
    style: {
      'border-width': 3.1,
    },
  },
  {
    selector: '.critical-node',
    style: {
      'background-color': '#d32f2f',
      'border-width': 2,
    },
  },
  {
    selector: '.regular-node',
    style: {
      'background-color': '#1976d2',
    },
  },
  {
    selector: '.done-node',
    style: {
      'background-color': '#2e7d32',
    },
  },
  {
    selector: 'node.unavailable-node',
    style: {
      'background-color': '#b0bec5',
      color: '#37474f',
      opacity: 0.65,
    },
  },
  {
    selector: 'node.slack-critical-node',
    style: {
      'border-width': 5,
    },
  },
  {
    selector: 'node.slack-near-node',
    style: {
      'border-width': 4,
    },
  },
  {
    selector: 'node.slack-safe-node',
    style: {
      'border-width': 3.1,
    },
  },
  {
    selector: 'edge',
    style: {
      width: 'data(edgeWidth)',
      'line-color': 'rgba(66, 66, 66, 0.62)',
      'target-arrow-color': 'rgba(66, 66, 66, 0.92)',
      'target-arrow-shape': 'triangle',
      'target-arrow-scale': 'data(edgeArrowScale)',
      'curve-style': 'bezier',
      'z-index-compare': 'manual',
      'z-index': 10,
      label: '',
      color: '#424242',
      opacity: 0.95,
    },
  },
  {
    selector: '.fan-edge',
    style: {
      'curve-style': 'unbundled-bezier',
      'control-point-distances': 'data(cpDistance)',
      'control-point-weights': 0.34,
    },
  },
  {
    selector: '.parallel-edge',
    style: {
      'curve-style': 'unbundled-bezier',
      'control-point-distances': 'data(cpDistance)',
      'control-point-weights': 0.38,
    },
  },
  {
    selector: '.routed-edge',
    style: {
      'curve-style': 'unbundled-bezier',
      'control-point-distances': 'data(cpDistances)',
      'control-point-weights': 'data(cpWeights)',
      'control-point-step-size': 56,
    },
  },
  {
    selector: '.dense-edge',
    style: {
      width: 1.8,
      opacity: 0.65,
      'target-arrow-scale': 1.8,
    },
  },
  {
    selector: '.backbone-edge',
    style: {
      width: 3,
      opacity: 0.65,
      'line-color': 'rgba(32, 120, 132, 0.75)',
      'target-arrow-color': 'rgba(32, 120, 132, 0.9)',
      'target-arrow-scale': 2.2,
    },
  },
  {
    selector: '.idle-edge',
    style: {
      width: 2.2,
      opacity: 0.6,
      'target-arrow-scale': 1.75,
      'line-color': 'rgba(90, 90, 90, 0.34)',
      'target-arrow-color': 'rgba(90, 90, 90, 0.5)',
    },
  },
  {
    selector: '.long-edge',
    style: {
      'line-style': 'dashed',
      opacity: 0.4,
    },
  },
  {
    selector: '.path-edge',
    style: {
      width: 'mapData(edgeWidth, 2, 7, 4.6, 7.8)',
      'line-color': '#00838f',
      'target-arrow-color': '#00838f',
      opacity: 1,
    },
  },
  {
    selector: '.path-dim-edge',
    style: {
      opacity: 0.35,
    },
  },
  {
    selector: '.blocked-edge',
    style: {
      opacity: 0.3,
    },
  },
  {
    selector: '.suppressed-edge',
    style: {
      display: 'none',
    },
  },
  {
    selector: '.routing-hidden-edge',
    style: {
      display: 'none',
    },
  },
  {
    selector: '.force-visible-edge',
    style: {
      display: 'element',
      opacity: 0.9,
      'target-arrow-shape': 'triangle',
    },
  },
  {
    selector: '.critical-edge',
    style: {
      width: 'mapData(edgeWidth, 2, 7, 5.2, 8.2)',
      'line-color': '#d32f2f',
      'target-arrow-color': '#d32f2f',
      'target-arrow-scale': 'mapData(edgeArrowScale, 2, 5, 3.3, 4.8)',
      opacity: 0.95,
    },
  },
  {
    selector: '.edge-dashed',
    style: {
      'line-style': 'dashed',
    },
  },
  {
    selector: '.is-dimmed',
    style: {
      opacity: 0.3,
    },
  },
  {
    selector: '.is-highlighted',
    style: {
      opacity: 1,
    },
  },
  {
    selector: '.impact-node',
    style: {
      'underlay-color': 'rgba(255, 152, 0, 0.35)',
      'underlay-opacity': 0.65,
      'underlay-padding': 8,
      'border-width': 4.2,
    },
  },
  {
    selector: '.impact-trace-node',
    style: {
      'underlay-color': 'rgba(2, 136, 209, 0.28)',
      'underlay-opacity': 0.55,
      'underlay-padding': 6,
    },
  },
  {
    selector: '.impact-edge',
    style: {
      'line-color': '#ff8f00',
      'target-arrow-color': '#ff8f00',
      width: 'mapData(edgeWidth, 2, 7, 4.8, 8.6)',
      opacity: 0.96,
    },
  },
  {
    selector: '.impact-trace-edge',
    style: {
      'line-color': '#0288d1',
      'target-arrow-color': '#0288d1',
      width: 'mapData(edgeWidth, 2, 7, 3.8, 7.2)',
      opacity: 0.88,
    },
  },
  {
    selector: '.impact-edge-pulse-a',
    style: {
      opacity: 0.98,
      width: 'mapData(edgeWidth, 2, 7, 5.2, 9.2)',
    },
  },
  {
    selector: '.impact-edge-pulse-b',
    style: {
      opacity: 0.72,
      width: 'mapData(edgeWidth, 2, 7, 3.8, 7.4)',
    },
  },
  {
    selector: '.impact-trace-pulse-a',
    style: {
      opacity: 0.96,
      width: 'mapData(edgeWidth, 2, 7, 4.4, 7.8)',
    },
  },
  {
    selector: '.impact-trace-pulse-b',
    style: {
      opacity: 0.65,
      width: 'mapData(edgeWidth, 2, 7, 3.1, 5.9)',
    },
  },
]

export const usePertCytoscapeBootstrap = () => {
  const ensureFactory = async (currentFactory: CytoscapeFactory | null): Promise<CytoscapeFactory> => {
    if (currentFactory) return currentFactory
    const module = await import('cytoscape')
    return module.default
  }

  const ensureDagreRegistration = async (
    factory: CytoscapeFactory,
    dagreAlreadyRegistered: boolean,
  ): Promise<boolean> => {
    if (dagreAlreadyRegistered) return true

    try {
      const dagreModuleName = 'cytoscape-dagre'
      const dagreModule = await import(/* @vite-ignore */ dagreModuleName)
      factory.use(dagreModule.default)
      return true
    } catch {
      return false
    }
  }

  const createInstance = (factory: CytoscapeFactory, container: HTMLElement) => {
    return factory({
      container,
      elements: [],
      style: buildPertGraphStyles(),
    })
  }

  return {
    ensureFactory,
    ensureDagreRegistration,
    createInstance,
  }
}
