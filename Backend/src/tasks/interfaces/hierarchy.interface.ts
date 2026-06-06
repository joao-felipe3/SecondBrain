import { Types } from 'mongoose';

export interface TaskLineageNode {
  _id: string | Types.ObjectId;
  name: string;
  status: string;
}

export interface TaskLineageResult {
  ancestors: TaskLineageNode[];
  children: TaskLineageNode[];
  warnings: string[];
}

export interface TaskDescendantNode {
  _id: string | Types.ObjectId;
  name: string;
  status: string;
  experience: number;
  isConcluded: boolean;
}
