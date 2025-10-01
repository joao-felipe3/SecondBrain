export class CreateProjectDto {
  name: String;
  description: String;
  color: String;
  startDate: Date;
  deadline: Date;
  totalHoursWorked: number;
  plannedHours: number;
  shortTermGoal: String;
  midTermGoal: String;
  longTermGoal: String;
  status: String;
  progressPercentage: number;
  experience: number;
  reward: number;
}
