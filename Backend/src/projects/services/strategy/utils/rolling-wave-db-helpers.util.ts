import { Logger } from '@nestjs/common';
import { MongoClient, ObjectId as NativeObjectId } from 'mongodb';
import { Model, Types } from 'mongoose';

export async function executeWithFreshMongoClient<T>(
  waveModel: Model<any>,
  operation: (collection: any) => Promise<T>,
  operationName: string,
  logger: Logger,
  maxAttempts = 5,
): Promise<T | null> {
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
      const collection = db.collection(waveModel.collection.name);
      const result = await operation(collection);
      return result;
    } catch (err: any) {
      logger.warn(
        `[MONGO_FRESH] ${operationName} tentativa ${attempt}/${maxAttempts} falhou: ${err?.message || err}`,
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

export async function persistWaveIncrementalChunked(
  waveModel: Model<any>,
  projectId: string,
  wave: {
    waveNumber: number;
    startDate: Date;
    endDate: Date;
    status: 'planned';
    taskIds: Types.ObjectId[];
    description?: string;
  },
  logger: Logger,
  chunkSize = 25,
): Promise<boolean> {
  const projectObjectId = new NativeObjectId(projectId);
  const safeDescription =
    typeof wave.description === 'string' ? wave.description.slice(0, 1000) : undefined;

  const metadataResult = await executeWithFreshMongoClient(
    waveModel,
    (collection) =>
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
    `chunked metadata upsert wave ${wave.waveNumber} for project ${projectId}`,
    logger,
    5,
  );

  if (metadataResult === null) {
    return false;
  }

  const nativeTaskIds = wave.taskIds
    .map((id) => String(id))
    .filter((id) => NativeObjectId.isValid(id))
    .map((id) => new NativeObjectId(id));

  for (let i = 0; i < nativeTaskIds.length; i += chunkSize) {
    const chunk = nativeTaskIds.slice(i, i + chunkSize);
    const chunkResult = await executeWithFreshMongoClient(
      waveModel,
      (collection) =>
        collection.updateOne(
          { projectId: projectObjectId, waveNumber: wave.waveNumber },
          { $addToSet: { taskIds: { $each: chunk } } },
        ),
      `chunked taskIds upsert wave ${wave.waveNumber} chunk ${Math.floor(i / chunkSize) + 1}`,
      logger,
      5,
    );

    if (chunkResult === null) {
      return false;
    }
  }

  return true;
}
