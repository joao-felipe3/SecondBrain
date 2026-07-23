import { Test, TestingModule } from '@nestjs/testing';
import { LeafTasksBufferService } from '../../../../../src/projects/services/execution/leaf-tasks-buffer.service';

describe('LeafTasksBufferService', () => {
  let service: LeafTasksBufferService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [LeafTasksBufferService],
    }).compile();

    service = module.get<LeafTasksBufferService>(LeafTasksBufferService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('prefetch & consume', () => {
    it('deve armazenar um valor pré-carregado no buffer e consumir com sucesso', async () => {
      const key = 'leaf:p1:node1';
      const producer = jest.fn().mockResolvedValue({ tasks: ['t1', 't2'] });

      service.prefetch(key, 'p1', producer);
      const result = await service.consume<{ tasks: string[] }>(key);

      expect(result).toBeDefined();
      expect(result?.tasks).toEqual(['t1', 't2']);
      expect(service.has(key)).toBe(false); // consumido descarrega
    });

    it('deve retornar null se a chave não existir no buffer', async () => {
      const result = await service.consume('non-existent-key');
      expect(result).toBeNull();
    });
  });
});
