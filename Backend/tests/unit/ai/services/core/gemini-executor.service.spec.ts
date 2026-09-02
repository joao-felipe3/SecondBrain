import { GeminiExecutorService } from '@src/ai/services/core/gemini-executor.service';

describe('GeminiExecutorService', () => {
  let service: GeminiExecutorService;
  let mockConfigService: any;
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'GEMINI_API_KEY') return 'mock-api-key';
        if (key === 'GEMINI_MODEL') return 'gemini-2.5-flash-lite';
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

  it('should initialize correctly with API keys and models', () => {
    expect(service.getModelName()).toBe('gemini-2.5-flash-lite');
    expect(service.getStrongModelName()).toBe('gemini-2.5-pro');
    expect(service.supportsJsonMode()).toBe(true);
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
    expect(picked).toBe('gemini-2.5-flash-lite');
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

  it('should handle rate limit retry and fallback to strong model on transient overload', async () => {
    process.env.NODE_ENV = 'development';

    const mockGenerate = jest
      .fn()
      .mockRejectedValueOnce({ status: 503, message: 'overloaded' })
      .mockRejectedValueOnce({ status: 503, message: 'overloaded' })
      .mockResolvedValueOnce({
        response: { text: () => 'Strong response' },
      });

    (service as any).genAI = {
      getGenerativeModel: jest.fn().mockReturnValue({
        generateContent: mockGenerate,
      }),
    };

    const res = await service.generateContent('prompt');
    expect(res).toBe('Strong response');
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
    jest.spyOn(global, 'setTimeout').mockImplementation((cb: any) => cb() as any);

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
