import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AiWikiService } from '../../src/ai/services/wiki/ai-wiki.service';
import { WikiQueryDto } from '../../src/ai/dto/wiki-query.dto';

describe('AiWikiService', () => {
  let service: AiWikiService;
  const mockConfig = { get: jest.fn().mockReturnValue('dummy-key') } as unknown as ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AiWikiService, { provide: ConfigService, useValue: mockConfig }],
    }).compile();
    service = module.get<AiWikiService>(AiWikiService);
    // Inject sample data
    (service as any)['nodes'] = [
      { id: 'n1', label: 'ModuleA', type: 'module', path: 'src/moduleA.ts', content: '' },
      { id: 'n2', label: 'ServiceB', type: 'service', path: 'src/serviceB.ts', content: '' },
    ];
    (service as any)['edges'] = [{ source: 'n1', target: 'n2', relationship: 'depends_on' }];
    (service as any)['vectorItems'] = [
      { id: 'n1', path: 'src/moduleA.ts', snippet: 'module A content', embedding: [0.1, 0.2, 0.3] },
      { id: 'n2', path: 'src/serviceB.ts', snippet: 'service B content', embedding: [0.2, 0.1, 0.4] },
    ];
  });

  it('should return a response with sources and graph data', async () => {
    const dto: WikiQueryDto = { query: 'example', topK: 2, maxDepth: 1 } as any;
    const result = await service.queryWiki(dto);
    expect(result).toHaveProperty('answer');
    expect(result.sources).toBeDefined();
    expect(result.sources.length).toBeGreaterThan(0);
    expect(result.graphNodes.length).toBeGreaterThan(0);
    expect(result.graphEdges.length).toBeGreaterThan(0);
  });
});
