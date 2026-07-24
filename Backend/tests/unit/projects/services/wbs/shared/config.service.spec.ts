import { ConfigService } from '@src/projects/services/wbs/shared/config.service';

describe('ConfigService (WBS)', () => {
  let configService: ConfigService;
  let mockNestConfig: { get: jest.Mock };

  beforeEach(() => {
    mockNestConfig = {
      get: jest.fn(),
    };
    configService = new ConfigService(mockNestConfig as any);
  });

  describe('type getters (numeric, string, boolean)', () => {
    it('should get numeric env with default fallbacks', () => {
      mockNestConfig.get.mockReturnValueOnce('42');
      expect(configService.getNumericEnv('KEY', 10)).toBe(42);

      mockNestConfig.get.mockReturnValueOnce('not-a-number');
      expect(configService.getNumericEnv('KEY', 10)).toBe(10);

      mockNestConfig.get.mockReturnValueOnce(undefined);
      expect(configService.getNumericEnv('KEY', 10)).toBe(10);
    });

    it('should get string env with fallback', () => {
      mockNestConfig.get.mockReturnValueOnce('  hello  ');
      expect(configService.getStringEnv('KEY', 'def')).toBe('hello');

      mockNestConfig.get.mockReturnValueOnce(undefined);
      expect(configService.getStringEnv('KEY', 'def')).toBe('def');
    });

    it('should get boolean env correctly', () => {
      mockNestConfig.get.mockReturnValueOnce('true');
      expect(configService.getBooleanEnv('KEY')).toBe(true);

      mockNestConfig.get.mockReturnValueOnce('1');
      expect(configService.getBooleanEnv('KEY')).toBe(true);

      mockNestConfig.get.mockReturnValueOnce('false');
      expect(configService.getBooleanEnv('KEY')).toBe(false);
    });
  });

  describe('redis url building & summary', () => {
    it('should build redis url from host and port if REDIS_URL is absent', () => {
      mockNestConfig.get.mockImplementation((key: string) => {
        if (key === 'REDIS_HOST') return 'localhost';
        if (key === 'REDIS_PORT') return '6379';
        return undefined;
      });

      expect(configService.getRedisUrl()).toBe('redis://localhost:6379');
      expect(configService.getCacheBackendName()).toBe('redis');
    });

    it('should return complete configuration summary', () => {
      const summary = configService.getSummary();
      expect(summary.generation).toBeDefined();
      expect(summary.cache).toBeDefined();
      expect(summary.sizing).toBeDefined();
      expect(summary.validation).toBeDefined();
      expect(summary.debug).toBeDefined();
    });
  });
});
