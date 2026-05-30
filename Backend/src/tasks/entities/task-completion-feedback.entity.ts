export class TaskCompletionFeedback {
  id!: string;
  task!: string;
  project?: string;
  modelName?: string;
  promptVersion?: string;
  inputSnapshot?: any;
  feedback?: string;
  error?: string;
  createdAt?: Date;
}
