import json
import os
import math

GRAPH_DIR = os.path.dirname(os.path.abspath(__file__))
GRAPH_JSON = os.path.join(GRAPH_DIR, "graph.json")
GRAPH_3D_HTML = os.path.join(GRAPH_DIR, "graph_3d.html")

print("Loading graph.json...")
with open(GRAPH_JSON, "r", encoding="utf-8") as f:
    graph_data = json.load(f)

nodes = graph_data.get("nodes", [])
edges = graph_data.get("links", graph_data.get("edges", []))
print(f"Loaded {len(nodes)} nodes and {len(edges)} edges")

# Color palette by community / category
palette = [
    "#38BDF8", "#818CF8", "#C084FC", "#F472B6", "#FB7185",
    "#34D399", "#4ADE80", "#A3E635", "#FBBF24", "#FB923C",
    "#22D3EE", "#A78BFA", "#E879F9", "#2DD4BF", "#F59E0B"
]

degrees = {}
for e in edges:
    s = e.get("source") or e.get("from")
    t = e.get("target") or e.get("to")
    degrees[s] = degrees.get(s, 0) + 1
    degrees[t] = degrees.get(t, 0) + 1

# Group by community
communities = {}
for n in nodes:
    cid = n.get("community", 0)
    cname = n.get("community_name", "Geral")
    if cid not in communities:
        color = palette[cid % len(palette)]
        communities[cid] = {"cid": cid, "color": color, "label": cname, "count": 0, "nodes": []}
    communities[cid]["count"] += 1
    communities[cid]["nodes"].append(n["id"])

# Sort communities by size
sorted_communities = sorted(list(communities.values()), key=lambda x: x["count"], reverse=True)

# Assign 3D Centroid position to each community (using Fibonacci sphere distribution for perfect spacing)
num_comms = len(sorted_communities)
phi = (1 + math.sqrt(5)) / 2  # golden ratio
cluster_radius = 420.0

community_centroids = {}
for i, c in enumerate(sorted_communities):
    # Fibonacci sphere points
    theta = 2 * math.pi * i / phi
    y = 1 - (i / float(num_comms - 1)) * 2 if num_comms > 1 else 0
    radius_at_y = math.sqrt(max(0, 1 - y * y))
    x = math.cos(theta) * radius_at_y
    z = math.sin(theta) * radius_at_y
    
    # Scale with slight distance variation for depth
    dist = cluster_radius * (0.8 + 0.4 * (i % 3))
    community_centroids[c["cid"]] = {
        "x": round(x * dist, 1),
        "y": round(y * dist, 1),
        "z": round(z * dist, 1),
        "name": c["label"],
        "color": c["color"],
        "count": c["count"]
    }

# Process raw nodes with architectural layer categorization
raw_nodes = []
for n in nodes:
    cid = n.get("community", 0)
    cname = n.get("community_name", "Geral")
    sf = n.get("source_file", "")
    
    # Architecture layer determination
    arch_layer = "Core / Shared"
    layer_z = 0
    if sf.startswith("Backend"):
        arch_layer = "Backend"
        layer_z = -220
    elif sf.startswith("Frontend"):
        arch_layer = "Frontend"
        layer_z = 220
    elif sf.startswith("Project") or sf.startswith("docs"):
        arch_layer = "Documentação & Specs"
        layer_z = 0
    
    deg = degrees.get(n["id"], 0)
    # Give hubs more size and prominence
    size = min(26, max(4.5, 4.5 + (deg ** 0.5) * 1.7))
    color_bg = communities[cid]["color"]

    raw_nodes.append({
        "id": n["id"],
        "label": n.get("label", n["id"]),
        "color": {
            "background": color_bg,
            "border": color_bg,
            "highlight": {"background": "#ffffff", "border": color_bg}
        },
        "size": round(size, 1),
        "title": f"{n.get('label', n['id'])} ({n.get('file_type', 'code')}) - {deg} arestas",
        "community": cid,
        "community_name": cname,
        "source_file": sf,
        "file_type": n.get("file_type", "code"),
        "degree": deg,
        "arch_layer": arch_layer,
        "layer_z": layer_z,
        "centroid": community_centroids.get(cid, {"x": 0, "y": 0, "z": 0})
    })

raw_edges = []
for i, e in enumerate(edges):
    s = e.get("source") or e.get("from")
    t = e.get("target") or e.get("to")
    rel = e.get("relation", e.get("label", ""))
    raw_edges.append({
        "from": s,
        "to": t,
        "label": "",
        "title": rel,
        "width": 0.8,
        "color": "rgba(148, 163, 184, 0.4)"
    })

legend_list = [{"cid": c["cid"], "color": c["color"], "label": c["label"], "count": c["count"]} for c in sorted_communities]

raw_nodes_json = json.dumps(raw_nodes)
raw_edges_json = json.dumps(raw_edges)
legend_json = json.dumps(legend_list)
centroids_json = json.dumps(community_centroids)

print("Building ultimate 3D Knowledge Graph with Architectural Layers & Community Islands...")

html_3d = f"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>3D Knowledge Graph - SecondBrain (Constelações Estruturadas)</title>
<script src="https://unpkg.com/three@0.160.0/build/three.min.js"></script>
<script src="https://unpkg.com/3d-force-graph@1.73.3/dist/3d-force-graph.min.js"></script>
<style>
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{
    background: #020617;
    color: #e2e8f0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    overflow: hidden;
    height: 100vh;
    width: 100vw;
    display: flex;
    position: relative;
  }}
  #three-graph-container {{
    flex: 1;
    height: 100vh;
    position: relative;
    background: radial-gradient(circle at center, #0b1329 0%, #020617 100%);
  }}
  #three-graph {{ width: 100%; height: 100%; }}
  
  #sidebar {{
    width: 330px;
    height: 100vh;
    background: rgba(15, 23, 42, 0.95);
    backdrop-filter: blur(16px);
    border-left: 1px solid rgba(255, 255, 255, 0.1);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: -10px 0 30px rgba(0,0,0,0.6);
    z-index: 20;
  }}

  .header-bar {{
    padding: 14px 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    display: flex;
    align-items: center;
    justify-content: space-between;
  }}
  .header-title {{
    font-size: 14px;
    font-weight: 700;
    color: #f8fafc;
    display: flex;
    align-items: center;
    gap: 8px;
  }}
  .view-switch-btn {{
    background: linear-gradient(135deg, #3b82f6, #6366f1);
    color: white;
    border: none;
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    transition: all 0.2s ease;
  }}
  .view-switch-btn:hover {{
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
  }}

  #search-wrap {{ padding: 12px 16px; border-bottom: 1px solid rgba(255, 255, 255, 0.06); }}
  #search {{
    width: 100%;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: #f1f5f9;
    padding: 8px 12px;
    border-radius: 8px;
    font-size: 13px;
    outline: none;
  }}
  #search:focus {{ border-color: #60a5fa; }}
  #search-results {{ max-height: 150px; overflow-y: auto; padding: 4px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.06); display: none; }}
  .search-item {{ padding: 6px 12px; cursor: pointer; border-radius: 6px; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin: 2px 8px; }}
  .search-item:hover {{ background: rgba(59, 130, 246, 0.25); }}

  .section-tab {{
    display: flex;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(0,0,0,0.25);
  }}
  .tab-btn {{
    flex: 1;
    padding: 9px;
    text-align: center;
    font-size: 12px;
    font-weight: 600;
    color: #94a3b8;
    background: none;
    border: none;
    cursor: pointer;
    border-bottom: 2px solid transparent;
    transition: all 0.2s;
  }}
  .tab-btn.active {{
    color: #f8fafc;
    border-bottom-color: #3b82f6;
    background: rgba(59, 130, 246, 0.1);
  }}

  .panel-content {{ flex: 1; overflow-y: auto; padding: 14px 16px; display: flex; flex-direction: column; gap: 12px; }}
  
  #info-content .field {{ margin-bottom: 7px; font-size: 12px; color: #cbd5e1; }}
  #info-content .field b {{ color: #f8fafc; font-size: 13.5px; display: block; margin-bottom: 3px; word-break: break-all; }}
  #info-content .empty {{ color: #64748b; font-style: italic; font-size: 12px; }}

  .neighbor-link {{
    display: block;
    padding: 3px 8px;
    margin: 3px 0;
    border-radius: 4px;
    cursor: pointer;
    font-size: 11.5px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    border-left: 3px solid #3b82f6;
    background: rgba(255,255,255,0.03);
    transition: background 0.15s;
  }}
  .neighbor-link:hover {{ background: rgba(59, 130, 246, 0.25); color: #fff; }}
  #neighbors-list {{ max-height: 160px; overflow-y: auto; margin-top: 6px; }}

  .control-group {{
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 8px;
    padding: 10px 12px;
  }}
  .control-group-title {{
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #94a3b8;
    margin-bottom: 8px;
  }}
  .control-row {{
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 7px;
    font-size: 12px;
  }}
  .control-row input[type="range"] {{ width: 110px; cursor: pointer; accent-color: #3b82f6; }}
  .control-row span.val {{ color: #60a5fa; font-weight: 600; min-width: 32px; text-align: right; font-size: 11px; }}

  .btn-grid {{ display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 6px; }}
  .btn-action {{
    padding: 8px 10px;
    border-radius: 6px;
    border: 1px solid rgba(255,255,255,0.1);
    background: rgba(255,255,255,0.05);
    color: #e2e8f0;
    font-size: 11.5px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    text-align: center;
  }}
  .btn-action:hover {{ background: #3b82f6; border-color: #3b82f6; color: #fff; }}
  .btn-action.active {{ background: #2563eb; border-color: #60a5fa; color: #fff; }}

  .legend-item {{
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 8px;
    cursor: pointer;
    border-radius: 6px;
    font-size: 11.5px;
    transition: all 0.15s;
  }}
  .legend-item:hover {{ background: rgba(59, 130, 246, 0.2); transform: translateX(3px); }}
  .legend-dot {{ width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }}
  .legend-label {{ flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }}
  .legend-count {{ color: #64748b; font-size: 10.5px; }}
  
  #hud-overlay {{
    position: absolute;
    top: 16px;
    left: 16px;
    background: rgba(15, 23, 42, 0.85);
    backdrop-filter: blur(8px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    padding: 10px 16px;
    border-radius: 8px;
    font-size: 12px;
    color: #94a3b8;
    pointer-events: none;
    z-index: 10;
  }}
  #hud-overlay b {{ color: #60a5fa; }}

  #stats {{
    padding: 10px 16px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    font-size: 11px;
    color: #64748b;
  }}
</style>
</head>
<body>

<div id="three-graph-container">
  <div id="hud-overlay">
    <div>🪐 <b>Layout 3D Estruturado: <span id="current-layout-name" style="color:#60a5fa">Ilhas por Comunidade</span></b></div>
    <div style="font-size:11px; margin-top:2px;">• <b>Rotacionar:</b> Botão esquerdo | • <b>Mover (Pan):</b> Botão direito | • <b>Zoom:</b> Scroll</div>
  </div>
  <div id="three-graph"></div>
</div>

<div id="sidebar">
  <div class="header-bar">
    <div class="header-title">
      <span>🌐 SecondBrain 3D</span>
    </div>
    <a href="graph.html" class="view-switch-btn" title="Alternar para 2D">
      🗺️ Modo 2D
    </a>
  </div>

  <div id="search-wrap">
    <input id="search" type="text" placeholder="Buscar nó na esfera 3D..." autocomplete="off">
    <div id="search-results"></div>
  </div>

  <div class="section-tab">
    <button class="tab-btn active" onclick="switchTab('tab-layout', this)">Estruturas 3D</button>
    <button class="tab-btn" onclick="switchTab('tab-info', this)">Detalhes</button>
    <button class="tab-btn" onclick="switchTab('tab-legend', this)">Comunidades</button>
  </div>

  <!-- TAB 1: ESTRUTURAS & LAYOUTS 3D (MAIN) -->
  <div id="tab-layout" class="panel-content">
    <div class="control-group">
      <div class="control-group-title">Modos de Organização 3D</div>
      <div class="btn-grid">
        <button class="btn-action active" onclick="setLayout('islands')" id="btn-islands">🪐 Ilhas & Comunidades</button>
        <button class="btn-action" onclick="setLayout('architecture')" id="btn-architecture">🏗️ Camadas (Back / Front)</button>
        <button class="btn-action" onclick="setLayout('spiral')" id="btn-spiral">🌀 Espiral Galáctica</button>
        <button class="btn-action" onclick="setLayout('free')" id="btn-free">🌌 Nuvem Livre</button>
      </div>
    </div>

    <div class="control-group">
      <div class="control-group-title">Controle de Agrupamento</div>
      
      <div class="control-row">
        <label>Força de Coesão (Ilhas)</label>
        <input type="range" id="cluster-strength-slider" min="1" max="10" value="7" oninput="updateClusterStrength(this.value)">
        <span class="val" id="cluster-strength-val">0.7</span>
      </div>

      <div class="control-row">
        <label>Espaço entre Ilhas</label>
        <input type="range" id="spacing-slider" min="200" max="800" value="450" step="25" oninput="updateClusterSpacing(this.value)">
        <span class="val" id="spacing-val">450</span>
      </div>

      <div class="control-row">
        <label>Opacidade Arestas</label>
        <input type="range" id="link-opacity-slider" min="5" max="100" value="40" oninput="updateLinkOpacity(this.value)">
        <span class="val" id="link-opacity-val">0.40</span>
      </div>

      <div class="control-row">
        <label>Setas Direcionais</label>
        <input type="checkbox" id="arrows-toggle" checked onchange="toggleArrows()" style="accent-color:#3b82f6;">
      </div>

      <div class="control-row">
        <label>Pulsos de Partículas</label>
        <input type="checkbox" id="particles-toggle" checked onchange="toggleParticles()" style="accent-color:#3b82f6;">
      </div>
    </div>

    <div class="control-group">
      <div class="control-group-title">Câmera & Movimento</div>
      <div class="control-row">
        <label for="auto-rotate-toggle">Auto Rotação Cósmica</label>
        <input type="checkbox" id="auto-rotate-toggle" style="accent-color:#3b82f6;">
      </div>
      <button class="btn-action" style="width:100%" onclick="reset3DCamera()">Restaurar Câmera Panorâmica</button>
    </div>
  </div>

  <!-- TAB 2: INFO -->
  <div id="tab-info" class="panel-content" style="display:none;">
    <div id="info-panel">
      <div id="info-content"><span class="empty">Clique em qualquer nó 3D para voar até ele e destacar sua constelação.</span></div>
    </div>
  </div>

  <!-- TAB 3: COMMUNITIES -->
  <div id="tab-legend" class="panel-content" style="display:none;">
    <div style="font-size:11px; color:#94a3b8; font-weight:700; text-transform:uppercase; margin-bottom:8px;">
      Clique em uma ilha para focar:
    </div>
    <div id="legend" style="display:flex; flex-direction:column; gap:2px;"></div>
  </div>

  <div id="stats">{len(nodes)} nós &middot; {len(edges)} arestas &middot; {len(communities)} comunidades 3D</div>
</div>

<script>
const RAW_NODES = {raw_nodes_json};
const RAW_EDGES = {raw_edges_json};
const LEGEND = {legend_json};
const CENTROIDS = {centroids_json};

const nodeMap = new Map();
RAW_NODES.forEach(n => nodeMap.set(n.id, n));

const adjacency = new Map();
RAW_NODES.forEach(n => adjacency.set(n.id, new Set()));
RAW_EDGES.forEach(e => {{
  if (adjacency.has(e.from) && adjacency.has(e.to)) {{
    adjacency.get(e.from).add(e.to);
    adjacency.get(e.to).add(e.from);
  }}
}});

let currentLayout = 'islands';
let currentClusterStrength = 0.7;
let currentClusterSpacing = 450;
let currentLinkOpacity = 0.40;
let currentBaseWidth = 0.8;
let showArrows = true;

// 3D Graph Data formatting
const gData = {{
  nodes: RAW_NODES.map(n => ({{
    id: n.id,
    name: n.label,
    val: Math.max(1.8, Math.sqrt(n.degree || 1) * 1.8),
    color: n.color.background,
    community: n.community,
    community_name: n.community_name,
    file_type: n.file_type,
    source_file: n.source_file,
    degree: n.degree,
    arch_layer: n.arch_layer,
    layer_z: n.layer_z,
    centroid: n.centroid
  }})),
  links: RAW_EDGES.map(e => {{
    const sNode = nodeMap.get(e.from);
    const tNode = nodeMap.get(e.to);
    const isSameCommunity = sNode && tNode && sNode.community === tNode.community;
    return {{
      source: e.from,
      target: e.to,
      label: e.label || '',
      color: e.color || '#64748b',
      isSameCommunity: isSameCommunity
    }};
  }})
}};

const highlightNodes = new Set();
const highlightLinks = new Set();

const elem = document.getElementById('three-graph');
const Graph = ForceGraph3D()(elem)
  .graphData(gData)
  .backgroundColor('#020617')
  .nodeLabel(node => `${{node.name}} (${{node.file_type || 'code'}}) • ${{node.arch_layer}} • ${{node.degree}} arestas`)
  .nodeColor(node => highlightNodes.size > 0 ? (highlightNodes.has(node.id) ? node.color : 'rgba(30, 41, 59, 0.18)') : node.color)
  .nodeVal(node => highlightNodes.has(node.id) ? node.val * 2.5 : node.val)
  .nodeRelSize(3.2)
  .nodeResolution(16)
  .linkColor(link => {{
    if (highlightLinks.size > 0) {{
      return highlightLinks.has(link) ? '#60a5fa' : 'rgba(255, 255, 255, 0.02)';
    }}
    return link.isSameCommunity ? `rgba(148, 163, 184, ${{currentLinkOpacity}})` : `rgba(99, 102, 241, ${{currentLinkOpacity * 0.75}})`;
  }})
  .linkWidth(link => {{
    if (highlightLinks.size > 0) {{
      return highlightLinks.has(link) ? 2.5 : 0.2;
    }}
    return currentBaseWidth;
  }})
  .linkCurvature(0.08)
  .linkDirectionalArrowLength(link => showArrows ? (highlightLinks.has(link) ? 5 : 3.5) : 0)
  .linkDirectionalArrowRelPos(0.95)
  .linkDirectionalArrowColor(link => highlightLinks.has(link) ? '#93c5fd' : 'rgba(203, 213, 225, 0.7)')
  .linkDirectionalParticles(link => highlightLinks.has(link) ? 4 : (document.getElementById('particles-toggle').checked ? 1 : 0))
  .linkDirectionalParticleWidth(1.8)
  .linkDirectionalParticleSpeed(0.006)
  .linkDirectionalParticleColor(() => '#60a5fa')
  .onNodeClick(node => {{
    const distance = 130;
    const distRatio = 1 + distance/Math.hypot(node.x, node.y, node.z);
    Graph.cameraPosition(
      {{ x: node.x * distRatio, y: node.y * distRatio, z: node.z * distRatio }},
      node,
      2000
    );
    show3DInfo(node);
  }});

// CUSTOM FORCES FOR ISLANDS & ARCHITECTURE LAYERING
function applyCurrentForces() {{
  const scale = currentClusterSpacing / 420.0;

  if (currentLayout === 'islands') {{
    // Attract nodes toward their community centroid
    Graph.d3Force('clusterX', d3.forceX(d => (d.centroid ? d.centroid.x * scale : 0)).strength(currentClusterStrength));
    Graph.d3Force('clusterY', d3.forceY(d => (d.centroid ? d.centroid.y * scale : 0)).strength(currentClusterStrength));
    Graph.d3Force('clusterZ', d3.forceZ(d => (d.centroid ? d.centroid.z * scale : 0)).strength(currentClusterStrength));
    Graph.d3Force('charge').strength(-80);
    Graph.d3Force('link').distance(l => l.isSameCommunity ? 20 : 180).strength(l => l.isSameCommunity ? 0.8 : 0.05);
  }} else if (currentLayout === 'architecture') {{
    // Stratified Layers along Z: Backend at -250, Frontend at +250, Core at 0
    Graph.d3Force('clusterX', d3.forceX(d => (d.centroid ? d.centroid.x * 0.8 : 0)).strength(0.35));
    Graph.d3Force('clusterY', d3.forceY(d => (d.centroid ? d.centroid.y * 0.8 : 0)).strength(0.35));
    Graph.d3Force('clusterZ', d3.forceZ(d => d.layer_z).strength(0.95));
    Graph.d3Force('charge').strength(-120);
    Graph.d3Force('link').distance(l => l.isSameCommunity ? 25 : 120).strength(0.5);
  }} else if (currentLayout === 'spiral') {{
    // Galactic Spiral Disk
    Graph.d3Force('clusterX', d3.forceX(d => (d.centroid ? d.centroid.x * scale : 0)).strength(0.5));
    Graph.d3Force('clusterY', d3.forceY(d => (d.centroid ? d.centroid.y * scale : 0)).strength(0.5));
    Graph.d3Force('clusterZ', d3.forceZ(0).strength(0.85)); // Flatten into disk
    Graph.d3Force('charge').strength(-150);
    Graph.d3Force('link').distance(40).strength(0.5);
  }} else if (currentLayout === 'free') {{
    // Free floating sphere
    Graph.d3Force('clusterX', null);
    Graph.d3Force('clusterY', null);
    Graph.d3Force('clusterZ', null);
    Graph.d3Force('charge').strength(-300);
    Graph.d3Force('link').distance(80).strength(0.3);
  }}

  Graph.d3ReheatSimulation();
}}

// Initialize forces with structured islands!
applyCurrentForces();

function setLayout(layoutName) {{
  currentLayout = layoutName;
  document.querySelectorAll('.btn-grid .btn-action').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById(`btn-${{layoutName}}`);
  if (btn) btn.classList.add('active');

  const names = {{
    'islands': 'Ilhas por Comunidade',
    'architecture': 'Camadas Arquiteturais (Backend / Frontend)',
    'spiral': 'Espiral Galáctica (Disco 3D)',
    'free': 'Nuvem Cósmica Livre'
  }};
  document.getElementById('current-layout-name').textContent = names[layoutName] || layoutName;

  applyCurrentForces();
}}

function updateClusterStrength(val) {{
  currentClusterStrength = val / 10.0;
  document.getElementById('cluster-strength-val').textContent = currentClusterStrength.toFixed(1);
  applyCurrentForces();
}}

function updateClusterSpacing(val) {{
  currentClusterSpacing = parseFloat(val);
  document.getElementById('spacing-val').textContent = val;
  applyCurrentForces();
}}

function switchTab(tabId, el) {{
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.panel-content').forEach(p => p.style.display = 'none');
  if (el) el.classList.add('active');
  document.getElementById(tabId).style.display = 'flex';
}}

function updateLinkOpacity(val) {{
  currentLinkOpacity = (val / 100);
  document.getElementById('link-opacity-val').textContent = currentLinkOpacity.toFixed(2);
  Graph.linkColor(Graph.linkColor());
}}

function toggleArrows() {{
  showArrows = document.getElementById('arrows-toggle').checked;
  Graph.linkDirectionalArrowLength(Graph.linkDirectionalArrowLength());
}}

function toggleParticles() {{
  Graph.linkDirectionalParticles(Graph.linkDirectionalParticles());
}}

function show3DInfo(node) {{
  highlightNodes.clear();
  highlightLinks.clear();
  
  if (node) {{
    highlightNodes.add(node.id);
    const neighbors = adjacency.get(node.id) || new Set();
    neighbors.forEach(nid => highlightNodes.add(nid));
    
    gData.links.forEach(link => {{
      const sId = typeof link.source === 'object' ? link.source.id : link.source;
      const tId = typeof link.target === 'object' ? link.target.id : link.target;
      if (sId === node.id || tId === node.id) {{
        highlightLinks.add(link);
      }}
    }});

    const neighborIds = Array.from(neighbors);
    const neighborItems = neighborIds.map(nid => {{
      const nb = nodeMap.get(nid);
      const color = nb ? nb.color.background : '#3b82f6';
      return `<span class="neighbor-link" style="border-left-color:${{color}}" onclick="focus3DById('${{nid}}')">${{nb ? nb.label : nid}}</span>`;
    }}).join('');

    document.getElementById('info-content').innerHTML = `
      <div class="field"><b>${{node.name}}</b></div>
      <div class="field"><span style="color:#94a3b8">Camada:</span> <b style="color:#60a5fa">${{node.arch_layer}}</b></div>
      <div class="field"><span style="color:#94a3b8">Tipo:</span> ${{node.file_type || 'code'}}</div>
      <div class="field"><span style="color:#94a3b8">Comunidade:</span> ${{node.community_name || 'N/A'}} (#${{node.community}})</div>
      <div class="field"><span style="color:#94a3b8">Arquivo:</span> <span style="font-family:monospace;font-size:11px">${{node.source_file || '-'}}</span></div>
      <div class="field"><span style="color:#94a3b8">Conexões:</span> ${{node.degree}} arestas</div>
      ${{neighborIds.length ? `<div class="field" style="margin-top:10px;color:#cbd5e1;font-weight:600">Vizinhos Conectados (${{neighborIds.length}}):</div><div id="neighbors-list">${{neighborItems}}</div>` : ''}}
    `;

    // Switch to info tab
    switchTab('tab-info', document.querySelectorAll('.tab-btn')[1]);
  }} else {{
    document.getElementById('info-content').innerHTML = '<span class="empty">Clique em qualquer nó para inspecionar</span>';
  }}
  
  Graph.nodeColor(Graph.nodeColor())
       .linkColor(Graph.linkColor())
       .linkWidth(Graph.linkWidth())
       .linkDirectionalArrowLength(Graph.linkDirectionalArrowLength())
       .linkDirectionalParticles(Graph.linkDirectionalParticles());
}}

function focus3DById(id) {{
  const node = gData.nodes.find(n => n.id === id);
  if (node) {{
    const distance = 130;
    const distRatio = 1 + distance/Math.hypot(node.x, node.y, node.z);
    Graph.cameraPosition(
      {{ x: node.x * distRatio, y: node.y * distRatio, z: node.z * distRatio }},
      node,
      1500
    );
    show3DInfo(node);
  }}
}}

function focusCommunity(cid) {{
  highlightNodes.clear();
  highlightLinks.clear();
  const cNodes = gData.nodes.filter(n => n.community === cid);
  if (!cNodes.length) return;
  cNodes.forEach(n => highlightNodes.add(n.id));
  
  gData.links.forEach(link => {{
    const sId = typeof link.source === 'object' ? link.source.id : link.source;
    const tId = typeof link.target === 'object' ? link.target.id : link.target;
    if (highlightNodes.has(sId) && highlightNodes.has(tId)) {{
      highlightLinks.add(link);
    }}
  }});

  const cx = cNodes.reduce((s, n) => s + n.x, 0) / cNodes.length;
  const cy = cNodes.reduce((s, n) => s + n.y, 0) / cNodes.length;
  const cz = cNodes.reduce((s, n) => s + n.z, 0) / cNodes.length;

  Graph.cameraPosition(
    {{ x: cx * 1.6 + 180, y: cy * 1.6 + 180, z: cz * 1.6 + 180 }},
    {{ x: cx, y: cy, z: cz }},
    1800
  );

  Graph.nodeColor(Graph.nodeColor())
       .linkColor(Graph.linkColor())
       .linkWidth(Graph.linkWidth());
}}

function reset3DCamera() {{
  highlightNodes.clear();
  highlightLinks.clear();
  Graph.nodeColor(Graph.nodeColor())
       .linkColor(Graph.linkColor())
       .linkWidth(Graph.linkWidth())
       .linkDirectionalArrowLength(Graph.linkDirectionalArrowLength())
       .linkDirectionalParticles(Graph.linkDirectionalParticles());
  Graph.cameraPosition({{ x: 0, y: 0, z: 850 }}, {{ x: 0, y: 0, z: 0 }}, 1500);
  document.getElementById('info-content').innerHTML = '<span class="empty">Clique em qualquer nó para inspecionar</span>';
}}

// Auto-rotate toggle
let angle = 0;
const rotateToggle = document.getElementById('auto-rotate-toggle');
setInterval(() => {{
  if (rotateToggle.checked) {{
    angle += Math.PI / 1600;
    const distance = 850;
    Graph.cameraPosition({{
      x: distance * Math.sin(angle),
      z: distance * Math.cos(angle)
    }});
  }}
}}, 30);

// Search
const searchInput = document.getElementById('search');
const searchResults = document.getElementById('search-results');

searchInput.addEventListener('input', () => {{
  const q = searchInput.value.toLowerCase().trim();
  searchResults.innerHTML = '';
  if (!q) {{ searchResults.style.display = 'none'; return; }}
  const matches = RAW_NODES.filter(n => n.label.toLowerCase().includes(q) || (n.source_file && n.source_file.toLowerCase().includes(q))).slice(0, 20);
  if (!matches.length) {{ searchResults.style.display = 'none'; return; }}
  searchResults.style.display = 'block';
  matches.forEach(n => {{
    const el = document.createElement('div');
    el.className = 'search-item';
    el.innerHTML = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${{n.color.background}};margin-right:6px"></span>${{n.label}} <span style="font-size:10px;color:#64748b">(${{n.arch_layer}})</span>`;
    el.onclick = () => {{
      focus3DById(n.id);
      searchResults.style.display = 'none';
      searchInput.value = '';
    }};
    searchResults.appendChild(el);
  }});
}});

document.addEventListener('click', e => {{
  if (!searchResults.contains(e.target) && e.target !== searchInput) searchResults.style.display = 'none';
}});

// Legend items
const legendEl = document.getElementById('legend');
LEGEND.slice(0, 60).forEach(c => {{
  const item = document.createElement('div');
  item.className = 'legend-item';
  item.innerHTML = `<div class="legend-dot" style="background:${{c.color}}"></div>
    <span class="legend-label">${{c.label}}</span>
    <span class="legend-count">${{c.count}} nós</span>`;
  item.onclick = () => focusCommunity(c.cid);
  legendEl.appendChild(item);
}});
</script>
</body>
</html>
"""

with open(GRAPH_3D_HTML, "w", encoding="utf-8") as f:
    f.write(html_3d)

print("graph_3d.html upgraded with Structured Community Islands & Architecture Layers!")
