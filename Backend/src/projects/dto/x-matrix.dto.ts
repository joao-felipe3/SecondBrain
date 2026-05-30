export type XMatrixStrength = 'strong' | 'medium' | 'weak' | 'none';

export class CreateXMatrixDto {
  strategy3to5Years?: string[];
  annualGoals?: string[];
  taskIds?: string[];
  wbsLevels?: number[];
  maxTacticalItems?: number;
  includeCompleted?: boolean;
}

export interface XMatrixAxisItemDto {
  id: string;
  label: string;
  source?: string;
}

export interface XMatrixCellDto {
  fromId: string;
  toId: string;
  strength: XMatrixStrength;
  score: number;
  rationale: string;
}

export interface XMatrixDiagnosticsDto {
  generatedAt: string;
  strategyCount: number;
  annualCount: number;
  tacticalCount: number;
  taskCount: number;
  warnings: string[];
}

export interface XMatrixResponseDto {
  projectId: string;
  projectName: string;
  strategyGoals: XMatrixAxisItemDto[];
  annualGoals: XMatrixAxisItemDto[];
  tacticalItems: XMatrixAxisItemDto[];
  tasks: XMatrixAxisItemDto[];
  strategyToAnnual: XMatrixCellDto[];
  annualToTactical: XMatrixCellDto[];
  annualToTasks: XMatrixCellDto[];
  diagnostics: XMatrixDiagnosticsDto;
}
