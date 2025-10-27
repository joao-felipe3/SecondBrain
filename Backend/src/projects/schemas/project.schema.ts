import { Schema, Document } from 'mongoose';

export interface ProjectDocument extends Document {
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
  tasks?: Array<Schema.Types.ObjectId>;
  backlogIdeas?: Array<{ text: string; createdAt: Date }>;
  backlogIdeas2?: Array<{ text: string; createdAt: Date }>;
}

export const ProjectSchema = new Schema<ProjectDocument>({
  name: { type: String, required: true },
  description: { type: String, required: true },
  color: { type: String, required: true },
  startDate: { type: Date, required: true },
  deadline: { type: Date, required: true },
  totalHoursWorked: { type: Number, required: true, default: 0 },
  plannedHours: { type: Number, required: true },
  shortTermGoal: { type: String, required: true },
  midTermGoal: { type: String, required: true },
  longTermGoal: { type: String, required: true },
  status: { type: String, required: true },
  progressPercentage: { type: Number, required: true, default: 0 },
  experience: { type: Number, required: true },
  reward: { type: Number, required: true },
  tasks: [{ type: Schema.Types.ObjectId, ref: 'Task' }],
  backlogIdeas: [{
    text: { type: String, required: true },
    createdAt: { type: Date, required: true, default: Date.now }
  }],
  backlogIdeas2: [{
    text: { type: String, required: true },
    createdAt: { type: Date, required: true, default: Date.now }
  }],
});
