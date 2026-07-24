import { GeminiExecutorService } from '@src/ai/services/core/gemini-executor.service';

describe('GeminiExecutorService', () => {
  let service: GeminiExecutorService;
  let mockConfigService: any;

  beforeEach(() => {
    mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'GEMINI_API_KEY') return 'fake-api-key';
        if (key === 'GEMINI_MODEL') return 'gemini-2.5-flash-lite';
        return undefined;
      }),
    };

    service = new GeminiExecutorService(mockConfigService);
  });

  it('should initialize correctly with valid API key and default model', () => {
    expect(service.getModelName()).toBe('gemini-2.5-flash-lite');
    expect(service.supportsJsonMode()).toBe(true);
  });

  it('should throw error when instantiated without API key', () => {
    const emptyConfig: any = { get: jest.fn().mockReturnValue(undefined) };
    const origKey = process.env.GEMINI_API_KEY;
    const origKey2 = process.env.GOOGLE_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_API_KEY;

    expect(() => new GeminiExecutorService(emptyConfig)).toThrow('GEMINI_API_KEY');

    process.env.GEMINI_API_KEY = origKey;
    process.env.GOOGLE_API_KEY = origKey2;
  });

  it('should return empty embedding when text is empty or embedding disabled', async () => {
    const embedding = await service.generateEmbedding('');
    expect(embedding).toEqual([]);
  });

  it('should throw error when generateContent is called in test environment without mock', async () => {
    process.env.NODE_ENV = 'test';
    await expect(service.generateContent('test prompt')).rejects.toThrow(
      'Gemini desabilitado em ambiente de teste',
    );
  });
});
