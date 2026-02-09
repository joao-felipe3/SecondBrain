export class MicroTaskGenerationRun {
  id: String;
  project?: String;
  generationBatchId?: String;
  parentWbsNodeId?: String;
  wbsPath?: String;
  promptVersion?: String;
  modelName?: String;
  input?: any;
  metrics?: any;
  error?: String;
  cost?: number;
  createdAt?: Date;
}
