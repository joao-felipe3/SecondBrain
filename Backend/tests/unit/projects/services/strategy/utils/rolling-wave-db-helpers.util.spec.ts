import { MongoClient, ObjectId as NativeObjectId } from 'mongodb';
import {
  executeWithFreshMongoClient,
  persistWaveIncrementalChunked,
} from '@src/projects/services/strategy/utils/rolling-wave-db-helpers.util';

jest.mock('mongodb', () => {
  const original = jest.requireActual('mongodb');
  return {
    ...original,
    MongoClient: jest.fn(),
  };
});

describe('rolling-wave-db-helpers.util', () => {
  let mockLogger: { warn: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    mockLogger = { warn: jest.fn() };
  });

  describe('executeWithFreshMongoClient', () => {
    it('should return null and log warning if MONGODB_URI is not set', async () => {
      const origUri = process.env.MONGODB_URI;
      delete process.env.MONGODB_URI;

      const mockWaveModel: any = { db: { name: 'testdb' }, collection: { name: 'waves' } };
      const result = await executeWithFreshMongoClient({
        waveModel: mockWaveModel,
        operation: jest.fn(),
        operationName: 'testOp',
        logger: mockLogger as any,
      });

      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('MONGODB_URI ausente'));

      process.env.MONGODB_URI = origUri;
    });

    it('should execute operation with MongoClient when connection succeeds', async () => {
      process.env.MONGODB_URI = 'mongodb://localhost:27017/test';

      const mockCollection = { updateOne: jest.fn().mockResolvedValue({ acknowledged: true }) };
      const mockDb = { collection: jest.fn().mockReturnValue(mockCollection) };
      const mockClientInstance = {
        connect: jest.fn().mockResolvedValue(undefined),
        db: jest.fn().mockReturnValue(mockDb),
        close: jest.fn().mockResolvedValue(undefined),
      };

      (MongoClient as unknown as jest.Mock).mockImplementation(() => mockClientInstance);

      const mockWaveModel: any = { db: { name: 'testdb' }, collection: { name: 'waves' } };
      const result = await executeWithFreshMongoClient({
        waveModel: mockWaveModel,
        operation: async (col) => col.updateOne({}, {}),
        operationName: 'testOp',
        logger: mockLogger as any,
      });

      expect(result).toEqual({ acknowledged: true });
      expect(mockClientInstance.connect).toHaveBeenCalled();
      expect(mockClientInstance.close).toHaveBeenCalled();
    });

    it('should retry on failure up to maxAttempts and return null if all fail', async () => {
      process.env.MONGODB_URI = 'mongodb://localhost:27017/test';

      const mockClientInstance = {
        connect: jest.fn().mockRejectedValue(new Error('Connection error')),
        close: jest.fn().mockResolvedValue(undefined),
      };
      (MongoClient as unknown as jest.Mock).mockImplementation(() => mockClientInstance);

      const mockWaveModel: any = { collection: { name: 'waves' } };
      const result = await executeWithFreshMongoClient({
        waveModel: mockWaveModel,
        operation: jest.fn(),
        operationName: 'testOp',
        logger: mockLogger as any,
        maxAttempts: 2,
      });

      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledTimes(2);
    });
  });

  describe('persistWaveIncrementalChunked', () => {
    it('should return false if metadata upsert fails', async () => {
      delete process.env.MONGODB_URI; // Force executeWithFreshMongoClient to return null

      const validProjectId = new NativeObjectId().toHexString();
      const mockWaveModel: any = { collection: { name: 'waves' } };

      const success = await persistWaveIncrementalChunked({
        waveModel: mockWaveModel,
        projectId: validProjectId,
        wave: {
          waveNumber: 1,
          startDate: new Date(),
          endDate: new Date(),
          status: 'PLANNED',
          description: 'Wave test',
          taskIds: [],
        } as any,
        logger: mockLogger as any,
      });

      expect(success).toBe(false);
    });

    it('should persist metadata and chunk taskIds successfully when MongoClient succeeds', async () => {
      process.env.MONGODB_URI = 'mongodb://localhost:27017/test';

      const mockCollection = {
        updateOne: jest.fn().mockResolvedValue({ acknowledged: true, modifiedCount: 1 }),
      };
      const mockDb = { collection: jest.fn().mockReturnValue(mockCollection) };
      const mockClientInstance = {
        connect: jest.fn().mockResolvedValue(undefined),
        db: jest.fn().mockReturnValue(mockDb),
        close: jest.fn().mockResolvedValue(undefined),
      };
      (MongoClient as unknown as jest.Mock).mockImplementation(() => mockClientInstance);

      const validProjectId = new NativeObjectId().toHexString();
      const task1 = new NativeObjectId().toHexString();
      const task2 = new NativeObjectId().toHexString();

      const mockWaveModel: any = { db: { name: 'test' }, collection: { name: 'waves' } };

      const success = await persistWaveIncrementalChunked({
        waveModel: mockWaveModel,
        projectId: validProjectId,
        wave: {
          waveNumber: 1,
          startDate: new Date(),
          endDate: new Date(),
          status: 'PLANNED',
          description: 'Wave desc',
          taskIds: [task1, task2],
        } as any,
        logger: mockLogger as any,
        chunkSize: 1,
      });

      expect(success).toBe(true);
      expect(mockCollection.updateOne).toHaveBeenCalledTimes(3); // 1 metadata + 2 task chunks
    });
  });
});
