import { Schema, Document } from 'mongoose';
import {
  TaskChecklistItem,
  TaskRecurringRule,
  TaskOperationalInfo,
  TaskPertMetrics,
  TaskEvmMetrics,
  TaskTraceability,
  TaskGamification,
  TaskRecurrence,
  TaskChecklistContext,
} from '../interfaces/task-contexts.interface';

export { TaskChecklistItem, TaskRecurringRule };

export type TaskContexts = TaskOperationalInfo &
  TaskPertMetrics &
  TaskEvmMetrics &
  TaskTraceability &
  TaskGamification &
  TaskRecurrence &
  TaskChecklistContext;

export interface TaskDocument extends Document, TaskContexts {}

export const TaskSchema = new Schema<TaskDocument>({
  name: { type: String, required: true },
  description: { type: String },
  definitionOfDone: { type: String },
  checklist: { type: [Schema.Types.Mixed] },
  // Required, but we provide a default to support AI-generated tasks that omit it.
  deadline: { type: Date, required: true, default: Date.now },
  pomodorosPlanned: { type: Number, required: true },
  pomodorosDid: { type: Number, default: 0 },
  pertOptimisticMinutes: { type: Number },
  pertMostLikelyMinutes: { type: Number },
  pertPessimisticMinutes: { type: Number },
  pertExpectedMinutes: { type: Number },
  pertVariance: { type: Number },
  priority: { type: Number },
  difficult: { type: Number },
  project: { type: Schema.Types.ObjectId, ref: 'Project' },
  parentTaskId: { type: Schema.Types.ObjectId, ref: 'Task' },
  parentWbsNodeId: { type: String },
  wbsPath: { type: String },
  generationBatchId: { type: String },
  milestoneId: { type: String },
  experience: { type: Number, default: 0 }, // Calculado automaticamente
  isConcluded: { type: Boolean, required: true, default: false },
  late: { type: Boolean, required: true, default: false },
  prize: { type: Number, default: 0 }, // Calculado automaticamente
  recurrency: { type: String, required: true, default: 'no-recurrence' },
  notification: { type: Date },
  microTaskType: { type: String },
  parentRecurringId: { type: Schema.Types.ObjectId, ref: 'Task' },
  isRecurringInstance: { type: Boolean, default: false },
  recurringState: {
    type: String,
    enum: ['pending', 'completed', 'skipped'],
    default: 'pending',
  },
  recurringRule: {
    type: {
      frequency: { type: String },
      interval: { type: Number },
      daysOfWeek: { type: [Number] },
      endDate: { type: Date },
      exceptions: {
        type: [
          {
            date: { type: Date, required: true },
            reason: { type: String },
          },
        ],
      },
    },
    _id: false,
  },
  cognitiveMode: { type: String },
  contextTag: { type: String },
  themeTag: { type: [String] },
  requirementIds: { type: [String] },
  journeyItemIds: { type: [String] },
  rtmRisk: { type: Boolean },
  rtmRiskReason: { type: String },
  evmProgress: { type: Number },
  evmPlannedValueMinutes: { type: Number },
  evmEarnedValueMinutes: { type: Number },
  evmSchedulePerformanceIndex: { type: Number },
  evmAlert: { type: String },
  status: {
    type: String,
    enum: ['todo', 'doing', 'review', 'done'],
    default: 'todo',
  },
  statusUpdatedAt: { type: Date, default: Date.now },
  kanbanOrder: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
});

// Indexes
TaskSchema.index({ project: 1, generationBatchId: 1 });
TaskSchema.index({ project: 1, parentWbsNodeId: 1 });
TaskSchema.index({ project: 1, themeTag: 1 });
TaskSchema.index({ project: 1, microTaskType: 1 });
TaskSchema.index({ parentTaskId: 1 });
TaskSchema.index({ parentRecurringId: 1 });
TaskSchema.index({ project: 1, status: 1, kanbanOrder: 1 });
