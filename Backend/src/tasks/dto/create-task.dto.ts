export class CreateTaskDto {
  name: String;
  description?: String; 
  pomodorosPlanned: number;
  deadline: Date;
  priority?: String; 
  difficult?: String;
  project?: String;
  experience: number;
  isConcluded: Boolean;
  late: Boolean;
  prize: number;
  frequency: String;
}
