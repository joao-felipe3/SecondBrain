import { GeminiExecutorService } from '@src/ai/services/core/gemini-executor.service';

describe('GeminiExecutorService', () => {
  let service: GeminiExecutorService;
  let mockConfigService: any;
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'GEMINI_API_KEY') return 'mock-api-key';
        if (key === 'GEMINI_MODEL') return 'gemma-4-31b-it';
        if (key === 'GEMINI_FALLBACK_MODEL') return 'gemini-2.5-flash-lite';
        if (key === 'GEMINI_STRONG_MODEL') return 'gemini-2.5-pro';
        if (key === 'GEMINI_STRONG_MODEL_MAX_CALLS_PER_DAY') return '2';
        if (key === 'GEMINI_EMBEDDING_MODEL') return 'text-embedding-004';
        return undefined;
      }),
    };

    service = new GeminiExecutorService(mockConfigService);
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  describe('thinkingConfigFor', () => {
    afterEach(() => {
      delete process.env.GEMINI_THINKING_LEVEL;
    });

    it('Gemini 3.x+ pensa pouco por padrão; Gemma e 2.x não recebem o campo', () => {
      expect(service.thinkingConfigFor('gemini-3.8-flash')).toEqual({
        thinkingConfig: { thinkingLevel: 'low' },
      });
      expect(service.thinkingConfigFor('gemini-3.1-pro-preview')).toEqual({
        thinkingConfig: { thinkingLevel: 'low' },
      });
      expect(service.thinkingConfigFor('gemini-2.5-flash-lite')).toEqual({});
      expect(service.thinkingConfigFor('gemma-4-31b-it')).toEqual({});
    });

    it('respeita GEMINI_THINKING_LEVEL e permite desligar', () => {
      process.env.GEMINI_THINKING_LEVEL = 'high';
      expect(service.thinkingConfigFor('gemini-3.8-flash')).toEqual({
        thinkingConfig: { thinkingLevel: 'high' },
      });
      process.env.GEMINI_THINKING_LEVEL = 'off';
      expect(service.thinkingConfigFor('gemini-3.8-flash')).toEqual({});
    });
  });

  it('should initialize correctly with API keys and models', () => {
    expect(service.getModelName()).toBe('gemma-4-31b-it');
    expect(service.getFallbackModelName()).toBe('gemini-2.5-flash-lite');
    expect(service.getStrongModelName()).toBe('gemini-2.5-pro');
    // Gemma não recebe JSON mode automático; o fallback gemini-* recebe.
    expect(service.supportsJsonMode()).toBe(false);
    expect((service as any).supportsJsonModeForModel('gemini-2.5-flash-lite')).toBe(true);
  });

  it('should throw error when no API key is provided', () => {
    const emptyConfig: any = { get: jest.fn().mockReturnValue(undefined) };
    const savedApiKey = process.env.GEMINI_API_KEY;
    const savedGoogleKey = process.env.GOOGLE_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_API_KEY;

    expect(() => new GeminiExecutorService(emptyConfig)).toThrow(
      'GEMINI_API_KEY or GOOGLE_API_KEY não está definida no .env',
    );

    if (savedApiKey) process.env.GEMINI_API_KEY = savedApiKey;
    if (savedGoogleKey) process.env.GOOGLE_API_KEY = savedGoogleKey;
  });

  it('should parse GEMINI_JSON_MODE and GEMINI_EMBEDDING_MODEL disabled', () => {
    const customConfig: any = {
      get: jest.fn((key: string) => {
        if (key === 'GEMINI_API_KEY') return 'mock-key';
        if (key === 'GEMINI_JSON_MODE') return 'false';
        if (key === 'GEMINI_EMBEDDING_MODEL') return 'none';
        return undefined;
      }),
    };

    const s = new GeminiExecutorService(customConfig);
    expect(s.supportsJsonMode()).toBe(false);
  });

  it('should fallback to base model when strong model budget is exhausted', () => {
    // Max calls is 2
    (service as any).strongModelCallsUsed = 2;
    (service as any).strongModelCallsDay = new Date().toISOString().slice(0, 10);

    const picked = (service as any).pickModel('gemini-2.5-pro');
    expect(picked).toBe('gemma-4-31b-it');
  });

  it('should throw error when NODE_ENV is test', async () => {
    process.env.NODE_ENV = 'test';
    await expect(service.generateContent('hello')).rejects.toThrow(
      'Gemini desabilitado em ambiente de teste',
    );
  });

  it('should generate content when NODE_ENV is development', async () => {
    process.env.NODE_ENV = 'development';

    const mockGenerate = jest.fn().mockResolvedValue({
      response: { text: () => 'Response text' },
    });

    (service as any).genAI = {
      getGenerativeModel: jest.fn().mockReturnValue({
        generateContent: mockGenerate,
      }),
    };

    const res = await service.generateContent('hello', {
      maxOutputTokens: 100,
      responseMimeType: 'application/json',
    });
    expect(res).toBe('Response text');
  });

  it('should switch to the fallback model immediately when the default model fails', async () => {
    process.env.NODE_ENV = 'development';

    const mockGenerate = jest
      .fn()
      .mockRejectedValueOnce({ status: 503, message: 'overloaded' })
      .mockResolvedValueOnce({
        response: { text: () => 'Fallback response' },
      });
    const getGenerativeModel = jest.fn().mockReturnValue({ generateContent: mockGenerate });

    (service as any).genAI = { getGenerativeModel };

    const res = await service.generateContent('prompt');
    expect(res).toBe('Fallback response');
    expect(getGenerativeModel.mock.calls.map((c) => c[0].model)).toEqual([
      'gemma-4-31b-it',
      'gemini-2.5-flash-lite',
    ]);
  });

  it('should not use the fallback when the caller explicitly requests another model', async () => {
    process.env.NODE_ENV = 'development';

    const mockGenerate = jest.fn().mockRejectedValue({ status: 400, message: 'Bad request' });
    const getGenerativeModel = jest.fn().mockReturnValue({ generateContent: mockGenerate });

    (service as any).genAI = { getGenerativeModel };

    await expect(service.generateContent('prompt', { model: 'gemini-2.5-pro' })).rejects.toThrow(
      'Falha ao gerar conteúdo com a IA do Gemini',
    );
    expect(getGenerativeModel.mock.calls.map((c) => c[0].model)).toEqual(['gemini-2.5-pro']);
  });

  it('should throw RATE_LIMIT error if 429 errors exhaust max retries', async () => {
    process.env.NODE_ENV = 'development';

    const mockGenerate = jest.fn().mockRejectedValue({ status: 429, message: 'Resource exhausted' });

    (service as any).genAI = {
      getGenerativeModel: jest.fn().mockReturnValue({
        generateContent: mockGenerate,
      }),
    };

    // Override setTimeout in test to avoid waiting
    jest.spyOn(global, 'setTimeout').mockImplementation((cb: any) => cb());

    await expect(service.generateContent('prompt')).rejects.toThrow('Gemini rate limit after retries');

    (global.setTimeout as any).mockRestore?.();
  });

  it('should throw general error on fatal non-transient API error', async () => {
    process.env.NODE_ENV = 'development';

    const mockGenerate = jest.fn().mockRejectedValue({ status: 400, message: 'Bad request' });

    (service as any).genAI = {
      getGenerativeModel: jest.fn().mockReturnValue({
        generateContent: mockGenerate,
      }),
    };

    await expect(service.generateContent('prompt')).rejects.toThrow(
      'Falha ao gerar conteúdo com a IA do Gemini',
    );
  });

  it('should handle embedding generation and fallback on error', async () => {
    const mockEmbed = jest.fn().mockResolvedValue({
      embedding: { values: [0.1, 0.2, 0.3] },
    });

    (service as any).genAI = {
      getGenerativeModel: jest.fn().mockReturnValue({
        embedContent: mockEmbed,
      }),
    };

    const embedding = await service.generateEmbedding('test text');
    expect(embedding).toEqual([0.1, 0.2, 0.3]);

    const empty = await service.generateEmbedding('');
    expect(empty).toEqual([]);
  });

  it('should disable embedding on 404 error or unsupported model', async () => {
    (service as any).genAI = {
      getGenerativeModel: jest.fn().mockReturnValue({
        embedContent: jest.fn().mockRejectedValue({ status: 404, message: 'not found' }),
      }),
    };

    const embedding = await service.generateEmbedding('test text');
    expect(embedding).toEqual([]);
    expect((service as any).embeddingDisabled).toBe(true);

    // Subsequent calls return [] immediately
    const next = await service.generateEmbedding('more text');
    expect(next).toEqual([]);
  });
});
