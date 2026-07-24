import { Test, TestingModule } from '@nestjs/testing';
import { LeafTasksBufferService } from '@src/projects/services/execution/leaf-tasks-buffer.service';

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
      expect(service.has(key)).toBe(false);
    });

    it('deve retornar null se a chave não existir no buffer', async () => {
      const result = await service.consume('non-existent-key');
      expect(result).toBeNull();
    });

    it('deve aguardar item em vôo (inFlight) durante o consumo', async () => {
      const key = 'leaf:p1:inflight';
      let resolveProducer: any;
      const producer = () =>
        new Promise((resolve) => {
          resolveProducer = resolve;
        });

      service.prefetch(key, 'p1', producer);
      const consumePromise = service.consume(key);

      resolveProducer({ data: 'delayed' });
      const result = await consumePromise;

      expect(result).toEqual({ data: 'delayed' });
    });

    it('deve tratar erro no produtor sem quebrar o serviço', async () => {
      process.env.WBS_PREFETCH_DEBUG = 'true';
      const key = 'leaf:p1:err';
      const producer = jest.fn().mockRejectedValue(new Error('Producer fail'));

      service.prefetch(key, 'p1', producer);
      const result = await service.consume(key);

      expect(result).toBeNull();
      delete process.env.WBS_PREFETCH_DEBUG;
    });

    it('deve descarregar entradas antigas (eviction) quando o limite por projeto for excedido', async () => {
      process.env.WBS_PREFETCH_BUFFER_SIZE = '1';
      const key1 = 'leaf:p1:k1';
      const key2 = 'leaf:p1:k2';

      service.prefetch(key1, 'p1', async () => ({ id: 1 }));
      await service.consume(key1);

      service.prefetch(key1, 'p1', async () => ({ id: 1 }));
      service.prefetch(key2, 'p1', async () => ({ id: 2 }));

      // Wait a tick for producers to fulfill
      await new Promise((res) => setTimeout(res, 50));

      expect(service.has(key2)).toBe(true);

      delete process.env.WBS_PREFETCH_BUFFER_SIZE;
    });
  });
});
