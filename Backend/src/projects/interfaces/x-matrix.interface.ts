import { TaskDocument } from '../../tasks/schemas/task.schema';
import { ProjectWaveDocument } from '../schemas/project-wave.schema';
import { ProjectDocument } from '../schemas/project.schema';
import { XMatrixAxisItemDto, XMatrixCellDto } from '../dto/x-matrix.dto';

export interface BuildTacticalItemsOptions {
  tasks: TaskDocument[];
  waves: ProjectWaveDocument[];
  wbsLevels: Set<number>;
  maxTacticalItems: number;
}

export interface TacticalAgg {
  id: string;
  label: string;
  taskCount: number;
  descriptions: string[];
  waveNumbers: Set<number>;
}

export interface CalculateCorrelationsOptions {
  strategyGoals: XMatrixAxisItemDto[];
  annualGoals: XMatrixAxisItemDto[];
  tacticalItems: XMatrixAxisItemDto[];
  tacticalContextById: Map<string, string>;
}

export interface GenerateWarningsOptions {
  strategyGoals: XMatrixAxisItemDto[];
  annualGoals: XMatrixAxisItemDto[];
  tacticalItems: XMatrixAxisItemDto[];
  tacticalByIdSize: number;
  wavesCount: number;
  project: ProjectDocument;
}

export interface ApplyFractalFilterOptions {
  strategyGoals: XMatrixAxisItemDto[];
  annualGoals: XMatrixAxisItemDto[];
  tacticalItems: XMatrixAxisItemDto[];
  strategyToAnnual: XMatrixCellDto[];
  annualToTactical: XMatrixCellDto[];
}

export interface ActiveIds {
  activeStrategyIds: Set<string>;
  activeAnnualIds: Set<string>;
  activeTacticalIds: Set<string>;
}

export interface FilteredData {
  filteredStrategyGoals: XMatrixAxisItemDto[];
  filteredAnnualGoals: XMatrixAxisItemDto[];
  filteredTacticalItems: XMatrixAxisItemDto[];
  filteredStrategyToAnnual: XMatrixCellDto[];
  filteredAnnualToTactical: XMatrixCellDto[];
}
