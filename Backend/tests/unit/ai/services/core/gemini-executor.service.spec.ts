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

  it('should handle rate limit retry and fallback to strong model', async () => {
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
  });

  it('should disable embedding on 404 error', async () => {
    (service as any).genAI = {
      getGenerativeModel: jest.fn().mockReturnValue({
        embedContent: jest.fn().mockRejectedValue({ status: 404, message: 'not found' }),
      }),
    };

    const embedding = await service.generateEmbedding('test text');
    expect(embedding).toEqual([]);
  });
});
