import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as fs from 'fs';
import * as path from 'path';
import {
  GraphEdgeDto,
  GraphNodeDto,
  WikiQueryDto,
  WikiQueryResponseDto,
  WikiSourceDto,
} from '../../dto/wiki-query.dto';

interface GraphNodeData {
  id: string;
  label: string;
  type: string;
  path: string;
  content: string;
}

interface GraphEdgeData {
  source: string;
  target: string;
  relationship: string;
}

interface VectorItemData {
  id: string;
  path: string;
  snippet: string;
  embedding: number[];
}

@Injectable()
export class AiWikiService implements OnModuleInit {
  private readonly logger = new Logger(AiWikiService.name);
  private nodes: GraphNodeData[] = [];
  private edges: GraphEdgeData[] = [];
  private vectorItems: VectorItemData[] = [];
  private genAI: GoogleGenerativeAI | null = null;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    this.loadData();
    const apiKey =
      this.configService.get<string>('GEMINI_API_KEY') ||
      this.configService.get<string>('GOOGLE_API_KEY');
    if (apiKey) {
      this.genAI = new GoogleGenerativeAI(apiKey);
    }
  }

  public loadData() {
    const dataDir = path.resolve(__dirname, '../../../ai/data');
    const graphPath = path.join(dataDir, 'knowledge-graph.json');
    const vectorPath = path.join(dataDir, 'vector-index.json');

    if (fs.existsSync(graphPath)) {
      try {
        const rawGraph = JSON.parse(fs.readFileSync(graphPath, 'utf8')) as Partial<{
          nodes: GraphNodeData[];
          edges: GraphEdgeData[];
        }>;
        this.nodes = rawGraph.nodes || [];
        this.edges = rawGraph.edges || [];
      } catch (err) {
        this.logger.warn(`Falha ao ler knowledge-graph.json: ${String(err)}`);
      }
    }

    if (fs.existsSync(vectorPath)) {
      try {
        const rawVector = JSON.parse(fs.readFileSync(vectorPath, 'utf8')) as VectorItemData[];
        this.vectorItems = Array.isArray(rawVector) ? rawVector : [];
      } catch (err) {
        this.logger.warn(`Falha ao ler vector-index.json: ${String(err)}`);
      }
    }

    this.logger.log(
      `Wiki data carregada: ${this.nodes.length} nós, ${this.edges.length} arestas, ${this.vectorItems.length} vetores.`,
    );
  }

  private computeCosineSimilarity(a: number[], b: number[]): number {
    if (!a || !b || a.length === 0 || b.length === 0) return 0;
    const minLen = Math.min(a.length, b.length);
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < minLen; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
  }

  private generateQueryEmbedding(query: string, dim = 64): number[] {
    const embedding = new Array(dim).fill(0);
    const clean = query.toLowerCase().replace(/[^a-z0-9]/g, ' ');
    const words = clean.split(/\s+/).filter(Boolean);

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      for (let j = 0; j < word.length; j++) {
        const charCode = word.charCodeAt(j);
        const idx = (charCode * (j + 1) + i) % dim;
        embedding[idx] += 1;
      }
    }

    const norm =
      Math.sqrt(embedding.reduce((sum: number, val: number) => sum + Number(val) * Number(val), 0)) || 1;
    return (embedding as number[]).map((val: number): number => val / norm);
  }

  async queryWiki(dto: WikiQueryDto): Promise<WikiQueryResponseDto> {
    const topK = dto.topK || 5;
    const maxDepth = dto.maxDepth || 2;
    const query = String(dto.query).trim();

    let queryEmbedding: number[] = [];
    if (this.genAI) {
      try {
        const model = this.genAI.getGenerativeModel({ model: 'text-embedding-004' });
        const res = await model.embedContent(query);
        queryEmbedding = res.embedding.values;
      } catch {
        queryEmbedding = this.generateQueryEmbedding(query);
      }
    } else {
      queryEmbedding = this.generateQueryEmbedding(query);
    }

    const scored = this.vectorItems.map((item) => ({
      item,
      score: this.computeCosineSimilarity(queryEmbedding, item.embedding || []),
    }));

    scored.sort((a, b) => b.score - a.score);
    const topMatches = scored.slice(0, topK);

    const sources: WikiSourceDto[] = topMatches.map((m) => ({
      path: m.item.path,
      score: Math.round(m.score * 100) / 100,
      snippet: m.item.snippet,
    }));

    const matchedNodeIds = new Set(topMatches.map((m) => m.item.id));
    const resultNodeIds = new Set<string>(matchedNodeIds);

    for (let depth = 0; depth < maxDepth; depth++) {
      const currentIds = Array.from(resultNodeIds);
      for (const edge of this.edges) {
        if (currentIds.includes(edge.source)) {
          resultNodeIds.add(edge.target);
        }
        if (currentIds.includes(edge.target)) {
          resultNodeIds.add(edge.source);
        }
      }
    }

    const graphNodes: GraphNodeDto[] = this.nodes
      .filter((n) => resultNodeIds.has(n.id))
      .map((n) => ({ id: n.id, label: n.label, type: n.type }));

    const graphEdges: GraphEdgeDto[] = this.edges
      .filter((e) => resultNodeIds.has(e.source) && resultNodeIds.has(e.target))
      .map((e) => ({ source: e.source, target: e.target, relationship: e.relationship }));

    const contextSnippet = sources
      .map((s) => `[Fonte: ${s.path} (Score: ${s.score})]\n${s.snippet}`)
      .join('\n\n');

    let answer = '';
    if (this.genAI) {
      try {
        const model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
        const prompt = `Você é um assistente técnico do projeto SecondBrain. Responda à pergunta do usuário utilizando o contexto da documentação e arquitetura fornecido abaixo.

Contexto:
${contextSnippet}

Pergunta: ${query}
`;
        const res = await model.generateContent(prompt);
        answer = res.response.text();
      } catch {
        answer = `Com base na busca local (Score de relevância top fontes: ${sources.map((s) => s.path).join(', ')}), encontrei ${sources.length} referências principais.`;
      }
    } else {
      answer = `[Modo Offline/Busca Local] Encontradas ${sources.length} fontes relevantes para a consulta "${query}". Principais fontes: ${sources
        .slice(0, 3)
        .map((s) => s.path)
        .join(', ')}.`;
    }

    return {
      answer,
      sources,
      graphNodes,
      graphEdges,
    };
  }
}
