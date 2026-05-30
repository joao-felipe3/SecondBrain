import { Task } from '../../tasks/entities/task.entity';

export class Project {
  id: string;
  name: string;
  description: string;
  color: string;
  startDate: Date;
  deadline: Date;
  totalHoursWorked: number;
  plannedHours: number;
  shortTermGoal: string;
  midTermGoal: string;
  longTermGoal: string;
  status: string;
  progressPercentage: number;
  experience: number;
  reward: number;
  tasks?: Task[];
}
