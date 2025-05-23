import { Schema } from 'mongoose';

export const TaskSchema = new Schema({
  name: { type: String, required: true },
  description: { type: String },
  deadline: { type: Date, required: true },
  pomodorosPlanned: { type: Number, required: true },
  priority: { type: String },
  difficult: { type: String },
  project: { type: String },
  experience: { type: Number, required: true },
  isConcluded: { type: Boolean, required: true },
  late: { type: Boolean, required: true },
  prize: { type: Number, required: true },
  frequency: { type: String, required: true },
});
