export class Task {
  id: String; 
  name: String;
  description?: String; 
  definitionOfDone?: String;
  pomodorosDid?: number;
  pomodorosPlanned: number;
  deadline: Date;
  priority?: number; 
  difficult?: number;
  project?: String;
  parentWbsNodeId?: String;
  wbsPath?: String;
  generationBatchId?: String;
  milestoneId?: String;
  experience: number;
  isConcluded: Boolean;
  late: Boolean;
  prize: number;
  recurrency: String;
  notification: Date;
  microTaskType?: String;
  cognitiveMode?: String;
  contextTag?: String;
  themeTag?: String[];
}
    