import { Schema, Document } from 'mongoose';

export interface SmartObjective {
  specific: string;
  measurable: string;
  achievable: string;
  relevant: string;
  temporal: string;
  summary: string;
  risks: string[];
}

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
  smartObjective?: SmartObjective;
  status: string;
  progressPercentage: number;
  experience: number;
  reward: number;
  tasks?: Array<Schema.Types.ObjectId>;
  backlogIdeas?: Array<{ text: string; createdAt: Date }>;
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
  smartObjective: {
    type: {
      specific: { type: String },
      measurable: { type: String },
      achievable: { type: String },
      relevant: { type: String },
      temporal: { type: String },
      summary: { type: String },
      risks: [{ type: String }]
    },
    required: false
  },
  status: { type: String, required: true },
  progressPercentage: { type: Number, required: true, default: 0 },
  experience: { type: Number, required: true },
  reward: { type: Number, required: true },
  tasks: [{ type: Schema.Types.ObjectId, ref: 'Task' }],
  backlogIdeas: [{
    text: { type: String, required: true },
    createdAt: { type: Date, required: true, default: Date.now }
  }],
});
