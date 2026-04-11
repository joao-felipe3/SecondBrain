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
      'border-width': 1.2,
      'border-color': '#0d47a1',
      'z-index-compare': 'manual',
      'z-index': 30,
      opacity: 1,
    },
  },
  {
    selector: '.start-node',
    style: {
      'background-color': '#fbc02d',
      'border-color': '#f57f17',
      'border-width': 3,
      color: '#212121',
    },
  },
  {
    selector: '.ready-node',
    style: {
      'background-color': '#00acc1',
      'border-color': '#006064',
      'border-width': 3,
    },
  },
  {
    selector: '.unavailable-node',
    style: {
      'background-color': '#b0bec5',
      'border-color': '#78909c',
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
      'border-color': '#c62828',
      'border-width': 2.4,
    },
  },
  {
    selector: '.slack-near-node',
    style: {
      'border-color': '#ef6c00',
      'border-width': 2,
    },
  },
  {
    selector: '.slack-safe-node',
    style: {
      'border-color': '#2e7d32',
      'border-width': 1.6,
    },
  },
  {
    selector: '.critical-node',
    style: {
      'background-color': '#d32f2f',
      'border-color': '#8b0000',
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
      'border-color': '#1b5e20',
    },
  },
  {
    selector: 'node.unavailable-node',
    style: {
      'background-color': '#b0bec5',
      'border-color': '#78909c',
      color: '#37474f',
      opacity: 0.65,
    },
  },
  {
    selector: 'node.slack-critical-node',
    style: {
      'border-color': '#c62828',
      'border-width': 2.4,
    },
  },
  {
    selector: 'node.slack-near-node',
    style: {
      'border-color': '#ef6c00',
      'border-width': 2,
    },
  },
  {
    selector: 'node.slack-safe-node',
    style: {
      'border-color': '#2e7d32',
      'border-width': 1.6,
    },
  },
  {
    selector: 'edge',
    style: {
      width: 3.8,
      'line-color': 'rgba(66, 66, 66, 0.62)',
      'target-arrow-color': 'rgba(66, 66, 66, 0.92)',
      'target-arrow-shape': 'triangle',
      'target-arrow-scale': 3.7,
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
    selector: '.radial-route-edge',
    style: {
      'curve-style': 'unbundled-bezier',
      'control-point-distances': 'data(radialCpDistances)',
      'control-point-weights': 'data(radialCpWeights)',
      'control-point-step-size': 62,
    },
  },
  {
    selector: '.hierarchical-route-edge',
    style: {
      'curve-style': 'unbundled-bezier',
      'control-point-distances': 'data(radialCpDistances)',
      'control-point-weights': 'data(radialCpWeights)',
      'control-point-step-size': 56,
    },
  },
  {
    selector: '.outer-route-node',
    style: {
      label: '',
      width: 1,
      height: 1,
      opacity: 0,
      'background-opacity': 0,
      'border-width': 0,
      events: 'no',
      'z-index': 1,
    },
  },
  {
    selector: '.outer-route-edge',
    style: {
      'curve-style': 'segments',
      'segment-distances': '0',
      'segment-weights': '0.5',
      width: 2.1,
      opacity: 0.7,
      'line-color': 'rgba(21, 118, 133, 0.56)',
      'target-arrow-color': 'rgba(21, 118, 133, 0.7)',
      'target-arrow-scale': 1.75,
    },
  },
  {
    selector: '.outer-route-pre-edge',
    style: {
      'target-arrow-shape': 'none',
    },
  },
  {
    selector: '.outer-route-post-edge',
    style: {
      'target-arrow-shape': 'triangle',
    },
  },
  {
    selector: '.outer-route-mid-edge',
    style: {
      'target-arrow-shape': 'none',
      opacity: 0.7,
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
    selector: '.radial-edge',
    style: {
      width: 1.2,
      opacity: 0.75,
      'target-arrow-shape': 'none',
      'line-color': 'rgba(70, 70, 70, 0.36)',
    },
  },
  {
    selector: '.primary-incoming-edge',
    style: {
      width: 2.8,
      opacity: 0.7,
      'line-color': 'rgba(24, 115, 128, 0.72)',
      'target-arrow-color': 'rgba(24, 115, 128, 0.8)',
      'target-arrow-shape': 'triangle',
      'target-arrow-scale': 1.7,
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
      width: 5.2,
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
      width: 5.2,
      'line-color': '#d32f2f',
      'target-arrow-color': '#d32f2f',
      'target-arrow-scale': 3.7,
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
