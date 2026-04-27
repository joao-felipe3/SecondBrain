export class TaskCompletionFeedback {
  id!: String;
  task!: String;
  project?: String;
  modelName?: String;
  promptVersion?: String;
  inputSnapshot?: any;
  feedback?: String;
  error?: String;
  createdAt?: Date;
}
