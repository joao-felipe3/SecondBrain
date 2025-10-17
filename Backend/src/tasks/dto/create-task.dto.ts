import { Types } from 'mongoose';

export class CreateTaskDto {
  name: string;
  description?: string; 
  pomodorosPlanned: number;
  deadline: Date;
  priority?: number; 
  difficult?: number;
  project?: string | Types.ObjectId;
  experience: number;
  isConcluded: boolean;
  late: boolean;
  prize: number;
  recurrency: string;
  notification: Date;
}
