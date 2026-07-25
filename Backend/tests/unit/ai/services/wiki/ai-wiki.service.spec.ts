import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AiWikiService } from '../../../../../src/ai/services/wiki/ai-wiki.service';
import { WikiQueryDto } from '../../../../../src/ai/dto/wiki-query.dto';

describe('AiWikiService', () => {
  let service: AiWikiService;

  const mockConfigService = {
    get: jest.fn().mockImplementation((key: string) => {
      if (key === 'GEMINI_API_KEY') return undefined;
      return undefined;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiWikiService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<AiWikiService>(AiWikiService);
    service.onModuleInit();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should process a wiki query in offline/local mode and return structured response', async () => {
    const dto: WikiQueryDto = {
      query: 'Quais são os serviços de análise do SecondBrain?',
      topK: 3,
      maxDepth: 1,
    };

    const response = await service.queryWiki(dto);

    expect(response).toBeDefined();
    expect(response.answer).toContain('Encontradas');
    expect(Array.isArray(response.sources)).toBe(true);
    expect(Array.isArray(response.graphNodes)).toBe(true);
    expect(Array.isArray(response.graphEdges)).toBe(true);
  });
});
