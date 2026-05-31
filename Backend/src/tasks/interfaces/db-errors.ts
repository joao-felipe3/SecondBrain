import { TaskDocument } from '../schemas/task.schema';

export interface InsertManyError extends Error {
  insertedDocs?: TaskDocument[];
  writeErrors?: unknown[];
}
