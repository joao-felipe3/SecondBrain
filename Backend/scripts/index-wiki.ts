import * as fs from 'fs';
import * as path from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';

interface GraphNode {
  id: string;
  label: string;
  type: 'module' | 'service' | 'controller' | 'document' | 'concept';
  path: string;
  content: string;
}

interface GraphEdge {
  source: string;
  target: string;
  relationship: 'imports' | 'references' | 'documents' | 'depends_on';
}

interface VectorItem {
  id: string;
  path: string;
  snippet: string;
  embedding: number[];
}

const ROOT_DIR = path.resolve(__dirname, '../..');
const OUTPUT_DIR = path.resolve(__dirname, '../src/ai/data');

const IGNORED_PATHS = [
  'node_modules',
  'dist',
  '.git',
  '.nuxt',
  'coverage',
  '.husky',
];

function getFilesRecursively(dir: string, extensions: string[]): string[] {
  let results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  const list = fs.readdirSync(dir);
  for (const file of list) {
    if (IGNORED_PATHS.some((ignored) => file.includes(ignored))) continue;

    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat && stat.isDirectory()) {
      results = results.concat(getFilesRecursively(fullPath, extensions));
    } else {
      if (extensions.some((ext) => fullPath.endsWith(ext))) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

function parseTsFile(filePath: string, relativePath: string): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const content = fs.readFileSync(filePath, 'utf8');
  const filename = path.basename(filePath);
  const nodeId = relativePath.replace(/\\/g, '/');

  let type: GraphNode['type'] = 'service';
  if (filename.endsWith('.module.ts')) type = 'module';
  else if (filename.endsWith('.controller.ts')) type = 'controller';

  const node: GraphNode = {
    id: nodeId,
    label: filename,
    type,
    path: relativePath,
    content: content.slice(0, 1000),
  };

  const edges: GraphEdge[] = [];
  const importRegex = /import\s+[\s\S]*?from\s+['"](.*?)['"]/g;
  let match: RegExpExecArray | null;

  while ((match = importRegex.exec(content)) !== null) {
    const importPath = match[1];
    if (importPath.startsWith('.')) {
      const resolvedDir = path.dirname(filePath);
      const resolvedPath = path.normalize(path.join(resolvedDir, importPath));
      let relTarget = path.relative(ROOT_DIR, resolvedPath).replace(/\\/g, '/');
      if (!relTarget.endsWith('.ts') && !relTarget.endsWith('.js')) {
        if (fs.existsSync(resolvedPath + '.ts')) {
          relTarget += '.ts';
        } else if (fs.existsSync(path.join(resolvedPath, 'index.ts'))) {
          relTarget += '/index.ts';
        }
      }
      edges.push({
        source: nodeId,
        target: relTarget,
        relationship: 'imports',
      });
    }
  }

  return { nodes: [node], edges };
}

function parseMdFile(filePath: string, relativePath: string): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const content = fs.readFileSync(filePath, 'utf8');
  const filename = path.basename(filePath);
  const nodeId = relativePath.replace(/\\/g, '/');

  const node: GraphNode = {
    id: nodeId,
    label: filename,
    type: 'document',
    path: relativePath,
    content: content.slice(0, 1500),
  };

  const edges: GraphEdge[] = [];
  const linkRegex = /\[.*?\]\((.*?)\)/g;
  let match: RegExpExecArray | null;

  while ((match = linkRegex.exec(content)) !== null) {
    const targetLink = match[1];
    if (!targetLink.startsWith('http')) {
      edges.push({
        source: nodeId,
        target: targetLink,
        relationship: 'references',
      });
    }
  }

  return { nodes: [node], edges };
}

function generateSimpleEmbedding(text: string, dim = 64): number[] {
  const embedding = new Array(dim).fill(0);
  const clean = text.toLowerCase().replace(/[^a-z0-9]/g, ' ');
  const words = clean.split(/\s+/).filter(Boolean);

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    for (let j = 0; j < word.length; j++) {
      const charCode = word.charCodeAt(j);
      const idx = (charCode * (j + 1) + i) % dim;
      embedding[idx] += 1;
    }
  }

  const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0)) || 1;
  return embedding.map((val) => val / norm);
}

async function main() {
  console.log('🚀 Starting Knowledge Graph & Vector Indexing...');

  const mdFiles = getFilesRecursively(path.join(ROOT_DIR, 'Project'), ['.md'])
    .concat(getFilesRecursively(path.join(ROOT_DIR, 'docs'), ['.md']))
    .concat(getFilesRecursively(path.join(ROOT_DIR, 'Backend/llm-wiki'), ['.md']))
    .concat(getFilesRecursively(path.join(ROOT_DIR, 'Backend/src'), ['.md']));

  const tsFiles = getFilesRecursively(path.join(ROOT_DIR, 'Backend/src'), ['.ts'])
    .filter((f) => !f.endsWith('.spec.ts'));

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const vectorItems: VectorItem[] = [];

  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  let genAI: GoogleGenerativeAI | null = null;
  if (apiKey) {
    genAI = new GoogleGenerativeAI(apiKey);
  }

  for (const file of mdFiles) {
    const relPath = path.relative(ROOT_DIR, file).replace(/\\/g, '/');
    const parsed = parseMdFile(file, relPath);
    nodes.push(...parsed.nodes);
    edges.push(...parsed.edges);
  }

  for (const file of tsFiles) {
    const relPath = path.relative(ROOT_DIR, file).replace(/\\/g, '/');
    const parsed = parseTsFile(file, relPath);
    nodes.push(...parsed.nodes);
    edges.push(...parsed.edges);
  }

  console.log(`📦 Found ${nodes.length} nodes and ${edges.length} edges.`);

  for (const node of nodes) {
    let embedding: number[] = [];
    if (genAI) {
      try {
        const model = genAI.getGenerativeModel({ model: 'text-embedding-004' });
        const result = await model.embedContent(node.content);
        embedding = result.embedding.values;
      } catch {
        embedding = generateSimpleEmbedding(node.content);
      }
    } else {
      embedding = generateSimpleEmbedding(node.content);
    }

    vectorItems.push({
      id: node.id,
      path: node.path,
      snippet: node.content.slice(0, 300),
      embedding,
    });
  }

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'knowledge-graph.json'),
    JSON.stringify({ nodes, edges }, null, 2),
  );

  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'vector-index.json'),
    JSON.stringify(vectorItems, null, 2),
  );

  console.log('✅ Knowledge Graph & Vector Index generated successfully in Backend/src/ai/data/');
}

main().catch((err) => {
  console.error('❌ Error during indexing:', err);
  process.exit(1);
});
