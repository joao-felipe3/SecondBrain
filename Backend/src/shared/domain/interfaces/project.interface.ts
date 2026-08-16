export interface ISmartObjective {
  title?: string;
  specific?: string;
  measurable?: string;
  achievable?: string;
  relevant?: string;
  timeBound?: string;
  weeklyHours?: number;
}

export interface IProjectDomain {
  id?: string;
  name: string;
  description?: string;
  deadline?: Date;
  plannedHours?: number;
  totalHoursWorked?: number;
  progressPercentage?: number;
  smartObjective?: ISmartObjective;
  experience?: number;
  reward?: number;
  createdAt?: Date;
  updatedAt?: Date;
}
