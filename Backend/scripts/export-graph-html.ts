import * as fs from 'fs';
import * as path from 'path';

const dataDir = path.resolve(__dirname, '../src/ai/data');
const graphPath = path.join(dataDir, 'knowledge-graph.json');
const outputPath = path.join(dataDir, 'knowledge-graph.html');

if (!fs.existsSync(graphPath)) {
  console.error('❌ File knowledge-graph.json not found! Run npm run wiki:index first.');
  process.exit(1);
}

const rawData = JSON.parse(fs.readFileSync(graphPath, 'utf8'));

const nodeMap = new Map<string, { id: string; label: string; type: string; path: string; content: string }>();

const nodes = rawData.nodes.map((node: { id: string; label: string; type: string; path: string; content: string }) => {
  nodeMap.set(node.id, node);
  let color = '#3b82f6'; // service - blue
  if (node.type === 'module') color = '#ec4899'; // module - pink
  if (node.type === 'controller') color = '#10b981'; // controller - green
  if (node.type === 'document') color = '#f59e0b'; // document - amber

  return {
    id: node.id,
    label: node.label,
    title: `<b>${node.label}</b><br/><i>${node.type}</i>`,
    group: node.type,
    path: node.path,
    content: node.content,
    color: {
      background: color,
      border: '#ffffff',
      highlight: { background: '#f43f5e', border: '#ffffff' },
    },
    font: { color: '#ffffff', size: 12, face: 'system-ui' },
    borderWidth: 2,
    size: node.type === 'module' ? 26 : node.type === 'document' ? 20 : 16,
  };
});

const nodeIds = new Set(nodeMap.keys());
const normalizedNodeMap = new Map<string, string>();
for (const key of nodeIds) {
  const norm = key.replace(/\\/g, '/').replace(/\.(ts|js|md)$/, '');
  normalizedNodeMap.set(norm, key);
}

function resolveNodeId(id: string): string | null {
  if (!id) return null;
  const cleanId = id.replace(/\\/g, '/');
  if (nodeIds.has(cleanId)) return cleanId;
  const norm = cleanId.replace(/\.(ts|js|md)$/, '');
  if (normalizedNodeMap.has(norm)) return normalizedNodeMap.get(norm)!;
  if (normalizedNodeMap.has(norm + '/index')) return normalizedNodeMap.get(norm + '/index')!;
  return null;
}

const edges: Array<Record<string, unknown>> = [];
const degreeMap = new Map<string, number>();

for (const edge of rawData.edges) {
  const from = resolveNodeId(edge.source);
  const to = resolveNodeId(edge.target);
  if (from && to && from !== to) {
    edges.push({
      from,
      to,
      label: edge.relationship,
      arrows: { to: { enabled: true, scaleFactor: 0.8 } },
      color: {
        color: '#38bdf8',
        highlight: '#f43f5e',
        hover: '#38bdf8',
        opacity: 0.85,
      },
      width: 2,
      font: { color: '#94a3b8', size: 9, align: 'middle', background: '#0f172a' },
    });
    degreeMap.set(from, (degreeMap.get(from) || 0) + 1);
    degreeMap.set(to, (degreeMap.get(to) || 0) + 1);
  }
}

const htmlContent = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>SecondBrain - Knowledge Graph Visualizer</title>
  <script type="text/javascript" src="https://unpkg.com/vis-network/standalone/umd/vis-network.min.js"></script>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 0;
      font-family: system-ui, -apple-system, sans-serif;
      background-color: #090d16;
      color: #f8fafc;
      overflow: hidden;
    }
    #header {
      height: 64px;
      padding: 12px 24px;
      background: #111827;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid #1f2937;
    }
    #main-container {
      display: flex;
      width: 100vw;
      height: calc(100vh - 64px);
    }
    #mynetwork {
      flex: 1;
      height: 100%;
    }
    #side-panel {
      width: 400px;
      height: 100%;
      background: #111827;
      border-left: 1px solid #1f2937;
      padding: 20px;
      overflow-y: auto;
      display: none;
      flex-direction: column;
      gap: 16px;
      box-shadow: -4px 0 24px rgba(0,0,0,0.5);
    }
    #side-panel.active { display: flex; }
    .toolbar-btn {
      background: #1f2937;
      border: 1px solid #374151;
      color: #f3f4f6;
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 12px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: all 0.2s;
    }
    .toolbar-btn:hover { background: #374151; border-color: #4b5563; }
    .toolbar-btn.active { background: #2563eb; border-color: #3b82f6; color: #fff; }
    .type-tag {
      display: inline-block;
      padding: 4px 8px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
    }
    .type-module { background: #ec4899; color: #fff; }
    .type-controller { background: #10b981; color: #fff; }
    .type-service { background: #3b82f6; color: #fff; }
    .type-document { background: #f59e0b; color: #fff; }
    .content-box {
      background: #030712;
      border: 1px solid #1f2937;
      border-radius: 8px;
      padding: 12px;
      font-family: monospace;
      font-size: 11px;
      white-space: pre-wrap;
      max-height: 320px;
      overflow-y: auto;
      color: #e5e7eb;
    }
    .close-btn {
      align-self: flex-end;
      background: transparent;
      border: none;
      color: #9ca3af;
      font-size: 18px;
      cursor: pointer;
    }
    .close-btn:hover { color: #fff; }
    #search-input {
      background: #030712;
      border: 1px solid #374151;
      color: #fff;
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 13px;
      width: 200px;
    }
  </style>
</head>
<body>
  <div id="header">
    <div style="display:flex; align-items:center; gap:16px;">
      <h3 style="margin: 0; color:#60a5fa;">🧠 SecondBrain Knowledge Graph</h3>
      <span style="font-size: 12px; color: #9ca3af;" id="graph-stats">${nodes.length} nós • ${edges.length} conexões</span>
    </div>
    
    <div style="display:flex; align-items:center; gap:12px;">
      <input type="text" id="search-input" placeholder="🔍 Buscar nó..." oninput="searchNode(this.value)"/>
      <button class="toolbar-btn active" id="btn-isolated" onclick="toggleIsolated()"><span>👁️</span> Ocultar Isolados</button>
      <button class="toolbar-btn" id="btn-layout" onclick="toggleLayout()"><span>🌲</span> Layout Hierárquico</button>
    </div>
  </div>

  <div id="main-container">
    <div id="mynetwork"></div>
    <div id="side-panel">
      <button class="close-btn" onclick="closePanel()">✕</button>
      <div id="panel-body">
        <p style="color:#9ca3af;">Clique em um nó para visualizar os detalhes e dependências.</p>
      </div>
    </div>
  </div>

  <script type="text/javascript">
    const rawNodes = ${JSON.stringify(nodes)};
    const rawEdges = ${JSON.stringify(edges)};
    const degreeMap = new Map(${JSON.stringify(Array.from(degreeMap.entries()))});
    const nodeMap = new Map(rawNodes.map(n => [n.id, n]));

    let hideIsolated = true;
    let isHierarchical = false;

    function getFilteredNodes() {
      if (!hideIsolated) return rawNodes;
      return rawNodes.filter(n => (degreeMap.get(n.id) || 0) > 0);
    }

    const container = document.getElementById('mynetwork');
    let nodesDataSet = new vis.DataSet(getFilteredNodes());
    let edgesDataSet = new vis.DataSet(rawEdges);

    const data = { nodes: nodesDataSet, edges: edgesDataSet };

    const organicPhysics = {
      solver: 'barnesHut',
      barnesHut: {
        gravitationalConstant: -18000,
        centralGravity: 0.05,
        springLength: 260,
        springConstant: 0.02,
        damping: 0.15,
        avoidOverlap: 1
      },
      stabilization: { iterations: 200 }
    };

    const options = {
      nodes: {
        shape: 'dot',
        font: { size: 12, color: '#f9fafb' }
      },
      edges: {
        width: 2,
        selectionWidth: 4,
        hoverWidth: 3,
        smooth: false
      },
      physics: organicPhysics,
      interaction: { hover: true, tooltipDelay: 100 }
    };

    const network = new vis.Network(container, data, options);
    const sidePanel = document.getElementById('side-panel');
    const panelBody = document.getElementById('panel-body');

    updateStats();

    network.on('selectNode', function(params) {
      if (params.nodes.length > 0) {
        const nodeId = params.nodes[0];
        const node = nodeMap.get(nodeId);
        if (node) showDetails(node);
      }
    });

    network.on('deselectNode', function() {
      closePanel();
    });

    function toggleIsolated() {
      hideIsolated = !hideIsolated;
      const btn = document.getElementById('btn-isolated');
      if (hideIsolated) {
        btn.classList.add('active');
        btn.innerHTML = '<span>👁️</span> Ocultar Isolados';
      } else {
        btn.classList.remove('active');
        btn.innerHTML = '<span>👁️</span> Mostrar Todos';
      }
      nodesDataSet.clear();
      nodesDataSet.add(getFilteredNodes());
      updateStats();
    }

    function toggleLayout() {
      isHierarchical = !isHierarchical;
      const btn = document.getElementById('btn-layout');
      if (isHierarchical) {
        btn.classList.add('active');
        btn.innerHTML = '<span>🌌</span> Layout Orgânico';
        network.setOptions({
          layout: { hierarchical: { direction: 'UD', sortMethod: 'directed', nodeSpacing: 180, levelSeparation: 150 } },
          physics: { enabled: false }
        });
      } else {
        btn.classList.remove('active');
        btn.innerHTML = '<span>🌲</span> Layout Hierárquico';
        network.setOptions({
          layout: { hierarchical: { enabled: false } },
          physics: organicPhysics
        });
      }
    }

    function updateStats() {
      const activeCount = nodesDataSet.length;
      document.getElementById('graph-stats').innerText = \`\${activeCount} nós visíveis (de \${rawNodes.length}) • \${rawEdges.length} conexões\`;
    }

    function showDetails(node) {
      sidePanel.classList.add('active');
      const typeClass = 'type-' + node.group;
      const connectedEdges = rawEdges.filter(e => e.from === node.id || e.to === node.id);
      
      const neighbors = connectedEdges.map(e => {
        const isSource = e.from === node.id;
        const otherId = isSource ? e.to : e.from;
        const direction = isSource ? '➡️' : '⬅️';
        return \`<li style="margin-bottom:4px;">\${direction} <b style="color:#60a5fa;">\${e.label}</b>: \${otherId}</li>\`;
      }).join('');

      panelBody.innerHTML = \`
        <span class="type-tag \${typeClass}">\${node.group}</span>
        <h3 style="margin: 8px 0 4px 0; color:#fff;">\${node.label}</h3>
        <p style="font-size:11px; color:#9ca3af; word-break:break-all; margin:0 0 16px 0;">\${node.path}</p>
        
        <h4 style="margin:8px 0 4px 0; color:#38bdf8;">Conexões (\${connectedEdges.length}):</h4>
        <ul style="padding-left:16px; margin:0 0 16px 0; font-size:11px; color:#d1d5db;">\${neighbors || 'Nenhuma conexão direta'}</ul>

        <h4 style="margin:8px 0 4px 0; color:#38bdf8;">Conteúdo / Snippet:</h4>
        <div class="content-box">\${escapeHtml(node.content)}</div>
      \`;
    }

    function closePanel() {
      sidePanel.classList.remove('active');
    }

    function escapeHtml(str) {
      if (!str) return '';
      return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    function searchNode(query) {
      if (!query.trim()) return;
      const found = getFilteredNodes().find(n => n.label.toLowerCase().includes(query.toLowerCase()));
      if (found) {
        network.focus(found.id, { scale: 1.4, animation: true });
        network.selectNodes([found.id]);
        showDetails(found);
      }
    }
  </script>
</body>
</html>`;

fs.writeFileSync(outputPath, htmlContent);
console.log(`✅ Fully Optimized Knowledge Graph generated: ${outputPath}`);
