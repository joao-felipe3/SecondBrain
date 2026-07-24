import { ThemeExtractionService } from '@src/projects/services/wbs/shared/theme-extraction.service';

describe('ThemeExtractionService', () => {
  let service: ThemeExtractionService;
  let mockGeminiService: any;

  beforeEach(() => {
    mockGeminiService = {
      generateEmbedding: jest.fn(),
    };
    service = new ThemeExtractionService(mockGeminiService);
  });

  describe('extractThemeSegments & summarizeThemeFromSegment', () => {
    it('should extract text segments suitable for embedding', () => {
      const text =
        'Esta é a primeira frase bem longa sobre frontend. - Esta é a segunda frase bem longa sobre backend de software!';
      const segments = service.extractThemeSegments(text);
      expect(segments.length).toBeGreaterThanOrEqual(2);
      expect(segments[0]).toContain('primeira');
    });

    it('should summarize segments into short theme titles', () => {
      const segment = 'Desenvolvimento do módulo de autenticação e segurança da informação';
      const summary = service.summarizeThemeFromSegment(segment);
      expect(summary).toBe('desenvolvimento módulo autenticação segurança');
    });
  });

  describe('getThemeSuggestionsForLeaf', () => {
    it('should fallback to heuristic suggestions when text length is too short', async () => {
      const result = await service.getThemeSuggestionsForLeaf({
        node: { name: 'Módulo Auth API', description: 'Curto' } as any,
      });

      expect(result.category).toBe('tech');
      expect(result.themes).toContain('api');
      expect(result.themes).toContain('seguranca');
    });

    it('should generate theme suggestions using AI embeddings when text is sufficiently long', async () => {
      mockGeminiService.generateEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);

      const longDesc =
        'Primeiro segmento extremamente detalhado sobre autenticação OAuth2 e JWT na aplicação. ' +
        'Segundo segmento extremamente detalhado sobre configuração do banco de dados Postgres e migrations. ' +
        'Terceiro segmento extremamente detalhado sobre testes unitários e de integração E2E.';

      const result = await service.getThemeSuggestionsForLeaf({
        node: { name: 'Projeto Backend Completo', description: longDesc } as any,
      });

      expect(result.category).toBe('embedding');
      expect(result.themes.length).toBeGreaterThan(0);
    });
  });
});
