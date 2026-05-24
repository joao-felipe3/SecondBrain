import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { GeminiService } from '../../../ai/gemini.service';
import { WBSNodeDto } from '../../dto/wbs.dto';
import {
  MIN_EMBEDDING_TEXT_LENGTH,
  MIN_EMBEDDING_SEGMENTS,
  MAX_EMBEDDING_CLUSTERS,
} from '../constants/wbs.constants';
import { normalizeVector, kMeansClusters, cosineSimilarity } from '../utils/metrics-calculator.util';

/**
 * Service for extracting themes from project/node descriptions
 * Uses heuristics, keyword matching, and optional embeddings
 */
@Injectable()
export class ThemeExtractionService {
  constructor(
    @Inject(forwardRef(() => GeminiService))
    private readonly geminiService: GeminiService,
  ) {}

  /**
   * Get theme suggestions using heuristics and keyword matching (fallback)
   * (Fast, no AI calls) - Private: used as fallback only
   */
  private getThemeSuggestions(params: {
    project?: any;
    node: WBSNodeDto;
  }): { category: 'vocab' | 'tech' | 'general'; themes: string[] } {
    const projectSummary = params.project?.smartObjective?.summary || params.project?.description || '';
    const text = `${params.node.name} ${params.node.description || ''} ${projectSummary}`.toLowerCase().trim();

    // Vocabulary/language learning context
    const isVocab = /vocab|vocabul|palavr|idiom|flashcard|kanji|hanzi|pinyin|词汇|词彙/i.test(text);
    const isMockOrExam = /simulad|prova|exame|mock/i.test(text);
    const isListeningCtx = /audi|oral|compreens[aã]o|escuta|listening/i.test(text);
    const isConversation =
      /restaurante|comida|culin|transport|navega|compra|negoci|social|apresenta|cumpriment|hotel|reserva|hospedagem|emerg|socorro|hospital|comunic|diálogo|conversa/i.test(
        text,
      );

    // Tech/software context
    const isTech =
      /api|backend|frontend|infra|deploy|docker|kubernetes|k8s|database|banco|sql|postgres|mysql|mongo|redis|cache|fila|queue|mensager|event|test|qa|unit|integration|e2e|observabil|monitor|log|seguran|auth|oauth|jwt|performance|latenc|ui|ux/i.test(
        text,
      );

    // Priority: more specific categories first
    if (isMockOrExam && !isVocab) {
      return {
        category: 'general' as const,
        themes: ['leitura', 'escuta', 'gramática', 'escrita', 'vocabulário', 'estratégias'],
      };
    }

    if (isListeningCtx && !isVocab) {
      return {
        category: 'general' as const,
        themes: ['diálogos curtos', 'narrativas', 'notícias', 'entrevistas', 'anúncios', 'conversas'],
      };
    }

    if (isVocab) {
      return {
        category: 'vocab',
        themes: [
          'comida',
          'casa',
          'trabalho',
          'viagem',
          'saude',
          'escola',
          'tecnologia',
          'financas',
          'tempo',
          'relacoes',
          'lazer',
          'cultura',
        ].slice(0, 6),
      };
    }

    if (isTech) {
      const prioritized = new Set<string>();
      if (/frontend|ui|ux|interface/.test(text)) prioritized.add('ui');
      if (/api|endpoint|rest|graphql/.test(text)) prioritized.add('api');
      if (/database|banco|sql|postgres|mysql|mongo/.test(text)) prioritized.add('dados');
      if (/test|qa|unit|integration|e2e/.test(text)) prioritized.add('testes');
      if (/observabil|monitor|log|trace|metric/.test(text)) prioritized.add('observabilidade');
      if (/seguran|auth|oauth|jwt/.test(text)) prioritized.add('seguranca');
      if (/deploy|docker|kubernetes|k8s|infra/.test(text)) prioritized.add('deploy');

      const defaults = [
        'setup',
        'core',
        'integracao',
        'testes',
        'observabilidade',
        'seguranca',
        'performance',
        'documentacao',
        'deploy',
      ];

      const themes = Array.from(prioritized);
      for (const t of defaults) {
        if (themes.length >= 6) break;
        if (!themes.includes(t)) themes.push(t);
      }

      return {
        category: 'tech',
        themes,
      };
    }

    if (isConversation) {
      // Context-appropriate themes for conversational/practical topics
      const contextual: Record<string, string[]> = {
        'restaurante|comida|culin': ['pedidos', 'cardápio', 'bebidas', 'conta', 'reserva', 'elogios'],
        'transport|navega': ['direções', 'metrô/ônibus', 'táxi', 'bilhetes', 'horários', 'aeroporto'],
        'compra|negoci|mercado': ['preços', 'tamanhos', 'cores', 'pagamento', 'devolução', 'pechincha'],
        'social|apresenta|cumpriment': [
          'cumprimentos',
          'apresentação',
          'profissões',
          'hobbies',
          'convites',
          'despedidas',
        ],
        'hotel|reserva|hospedagem': ['check-in', 'quarto', 'serviços', 'reclamações', 'check-out', 'locais'],
        'emerg|socorro|hospital': ['sintomas', 'farmácia', 'hospital', 'polícia', 'acidente', 'ajuda'],
      };
      for (const [pattern, cThemes] of Object.entries(contextual)) {
        if (new RegExp(pattern, 'i').test(text)) {
          return { category: 'general' as const, themes: cThemes };
        }
      }
      return {
        category: 'general' as const,
        themes: ['vocabulário prático', 'diálogos', 'expressões', 'cultura', 'pronúncia', 'revisão'],
      };
    }

    return {
      category: 'general',
      themes: ['conceitos', 'prática', 'aplicação', 'revisão', 'teste', 'consolidação'],
    };
  }

  /**
   * Get theme suggestions using embeddings and clustering
   * (Slower, requires AI calls, more accurate for complex descriptions)
   */
  async getThemeSuggestionsForLeaf(params: {
    project?: any;
    node: WBSNodeDto;
  }): Promise<{ category: 'vocab' | 'tech' | 'general' | 'embedding'; themes: string[] }> {
    const projectSummary = params.project?.smartObjective?.summary || params.project?.description || '';
    const baseText = `${params.node.name}. ${params.node.description || ''} ${projectSummary}`.trim();

    if (baseText.length < MIN_EMBEDDING_TEXT_LENGTH) {
      return this.getThemeSuggestions(params);
    }

    const segments = this.extractThemeSegments(baseText);
    if (segments.length < MIN_EMBEDDING_SEGMENTS) {
      return this.getThemeSuggestions(params);
    }

    const embeddings: { segment: string; vector: number[] }[] = [];
    for (const segment of segments) {
      const vector = await this.geminiService.generateEmbedding(segment);
      if (vector.length) embeddings.push({ segment, vector: normalizeVector(vector) });
    }

    if (embeddings.length < 2) {
      return this.getThemeSuggestions(params);
    }

    const k = Math.min(MAX_EMBEDDING_CLUSTERS, Math.max(2, Math.round(Math.sqrt(embeddings.length))));
    const { clusters, centroids } = kMeansClusters(
      embeddings.map((e) => e.vector),
      k,
    );

    const themes: string[] = [];
    clusters.forEach((cluster, idx) => {
      if (!cluster.length) return;
      let bestSegment = embeddings[cluster[0]].segment;
      let bestScore = -Infinity;
      cluster.forEach((segIdx) => {
        const score = cosineSimilarity(embeddings[segIdx].vector, centroids[idx]);
        if (score > bestScore) {
          bestScore = score;
          bestSegment = embeddings[segIdx].segment;
        }
      });
      const theme = this.summarizeThemeFromSegment(bestSegment);
      if (theme) themes.push(theme);
    });

    const uniqueThemes = Array.from(new Set(themes)).slice(0, MAX_EMBEDDING_CLUSTERS);
    if (!uniqueThemes.length) {
      return this.getThemeSuggestions(params);
    }

    return { category: 'embedding', themes: uniqueThemes };
  }

  /**
   * Extract text segments suitable for embedding
   */
  extractThemeSegments(text: string): string[] {
    if (!text) return [];
    const cleaned = text.replace(/\r/g, ' ').replace(/\t/g, ' ').replace(/\u0000/g, ' ');

    const parts = cleaned
      .split(/[\n;•]+/)
      .flatMap((p) => p.split(/[.!?]+/))
      .flatMap((p) => p.split(/\s+-\s+|\s+—\s+|\s+–\s+/))
      .map((p) => p.replace(/\s+/g, ' ').trim())
      .filter((p) => p.length >= 20);

    const unique = new Set<string>();
    for (const part of parts) {
      if (!unique.has(part)) unique.add(part);
    }
    return Array.from(unique);
  }

  /**
   * Summarize  a segment into a short theme label
   */
  summarizeThemeFromSegment(segment: string): string {
    if (!segment) return '';
    const stop = new Set([
      'de',
      'da',
      'do',
      'das',
      'dos',
      'e',
      'ou',
      'para',
      'por',
      'com',
      'em',
      'no',
      'na',
      'nos',
      'nas',
      'um',
      'uma',
      'uns',
      'umas',
      'ao',
      'aos',
      'à',
      'às',
      'se',
      'que',
      'como',
      'sobre',
      'entre',
      'mais',
      'menos',
    ]);

    const tokens = segment
      .toLowerCase()
      .replace(/[^a-z\u00c0-\u017f0-9\s]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .filter((t) => t.length > 2 && !stop.has(t));

    const title = tokens.slice(0, 4).join(' ');
    return title || segment.slice(0, 40).trim();
  }
}
