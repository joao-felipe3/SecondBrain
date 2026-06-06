export type InferenceTask = {
  id: string;
  name: string;
  description?: string;
  checklist?: string[];
  definitionOfDone?: string;
  microTaskType?: string;
};

export type InferredDependency = {
  taskId: string;
  dependsOnTaskId: string;
  relationship?: string;
  reason?: string;
  confidence?: number;
};

export type InferenceLeafGates = {
  leafId: string;
  wbsPath?: string;
  leafName?: string;
  startGateId: string;
  endGateId: string;
  taskCount?: number;
};
