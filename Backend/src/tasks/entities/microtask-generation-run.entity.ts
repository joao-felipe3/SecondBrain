export class MicroTaskGenerationRun {
  id: string;
  project?: string;
  generationBatchId?: string;
  parentWbsNodeId?: string;
  wbsPath?: string;
  promptVersion?: string;
  modelName?: string;
  input?: any;
  metrics?: any;
  error?: string;
  cost?: number;
  createdAt?: Date;
}
