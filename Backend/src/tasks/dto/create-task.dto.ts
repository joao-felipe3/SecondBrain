import { Types } from 'mongoose';

export class CreateTaskDto {
  name: string;
  description?: string; 
  pomodorosPlanned: number;
  deadline: Date;
  priority?: number; 
  difficult?: number;
  project?: string | Types.ObjectId;
  experience?: number; // Calculado automaticamente: priority * 2 + difficult * 5
  isConcluded: boolean;
  late: boolean;
  prize?: number; // Calculado automaticamente: priority * 5 + difficult * 2
  recurrency: string;
  notification: Date;
}
