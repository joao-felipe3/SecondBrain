import { Collection, MongoClient, ObjectId as NativeObjectId } from 'mongodb';
import { FreshMongoExecuteDto, PersistWaveChunkedDto } from '../../../interfaces/rolling-wave.interface';

export async function executeWithFreshMongoClient<T>(
  options: FreshMongoExecuteDto<T>,
): Promise<T | null> {
  const { waveModel, operation, operationName, logger, maxAttempts = 5 } = options;
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    logger.warn(`[MONGO_FRESH] MONGODB_URI ausente para ${operationName}`);
    return null;
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let client: MongoClient | null = null;
    try {
      client = new MongoClient(uri, {
        maxPoolSize: 2,
        minPoolSize: 0,
        serverSelectionTimeoutMS: Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || 8000),
        connectTimeoutMS: Number(process.env.MONGODB_CONNECT_TIMEOUT_MS || 10000),
        socketTimeoutMS: Number(process.env.MONGODB_SOCKET_TIMEOUT_MS || 120000),
        retryWrites: true,
        family: 4,
      });

      await client.connect();
      const dbName = waveModel.db?.name || undefined;
      const db = dbName ? client.db(dbName) : client.db();
      const collection: Collection = db.collection(waveModel.collection.name);
      const result = await operation(collection);
      return result;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(
        `[MONGO_FRESH] ${operationName} tentativa ${attempt}/${maxAttempts} falhou: ${message}`,
      );
      if (attempt < maxAttempts) {
        const baseDelay = Math.min(8000, Math.pow(2, attempt - 1) * 1000);
        const jitter = Math.random() * baseDelay * 0.1;
        const totalDelay = baseDelay + jitter;
        await new Promise((resolve) => setTimeout(resolve, totalDelay));
      }
    } finally {
      if (client) {
        try {
          await client.close();
        } catch {
          // noop
        }
      }
    }
  }

  return null;
}

export async function persistWaveIncrementalChunked(options: PersistWaveChunkedDto): Promise<boolean> {
  const { waveModel, projectId, wave, logger, chunkSize = 25 } = options;
  const projectObjectId = new NativeObjectId(projectId);
  const safeDescription =
    typeof wave.description === 'string' ? wave.description.slice(0, 1000) : undefined;

  const metadataResult = await executeWithFreshMongoClient({
    waveModel,
    operation: (collection) =>
      collection.updateOne(
        { projectId: projectObjectId, waveNumber: wave.waveNumber },
        {
          $set: {
            projectId: projectObjectId,
            waveNumber: wave.waveNumber,
            startDate: wave.startDate,
            endDate: wave.endDate,
            status: wave.status,
            description: safeDescription,
            taskIds: [],
          },
        },
        { upsert: true },
      ),
    operationName: `chunked metadata upsert wave ${wave.waveNumber} for project ${projectId}`,
    logger,
    maxAttempts: 5,
  });

  if (metadataResult === null) {
    return false;
  }

  const nativeTaskIds = wave.taskIds
    .map((id) => String(id))
    .filter((id) => NativeObjectId.isValid(id))
    .map((id) => new NativeObjectId(id));

  for (let i = 0; i < nativeTaskIds.length; i += chunkSize) {
    const chunk = nativeTaskIds.slice(i, i + chunkSize);
    const chunkResult = await executeWithFreshMongoClient({
      waveModel,
      operation: (collection) =>
        collection.updateOne(
          { projectId: projectObjectId, waveNumber: wave.waveNumber },
          { $addToSet: { taskIds: { $each: chunk } } },
        ),
      operationName: `chunked taskIds upsert wave ${wave.waveNumber} chunk ${Math.floor(i / chunkSize) + 1}`,
      logger,
      maxAttempts: 5,
    });

    if (chunkResult === null) {
      return false;
    }
  }

  return true;
}
