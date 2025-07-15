export class CreateTaskDto {
  name: String;
  description?: String; 
  pomodorosPlanned: number;
  deadline: Date;
  priority?: number; 
  difficult?: number;
  project?: String;
  experience: number;
  isConcluded: Boolean;
  late: Boolean;
  prize: number;
  recurrency: String;
  notification: Date;
}
