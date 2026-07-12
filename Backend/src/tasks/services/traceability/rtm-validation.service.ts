import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Requirement as RequirementSchema,
  RequirementDocument,
  JourneyKind,
} from '../../schemas/requirement.schema';
import { Requirement } from '../../entities/requirement.entity';
import { RequirementMapper } from '../../mappers/requirement.mapper';
import { Task } from '../../entities/task.entity';
import { RTMValidation, RTMMatrixData } from '../../interfaces/rtm.interface';
import { normalizeKind, levelForKind, getLinkedActions } from './utils/rtm.utils';

// Re-export interfaces for backwards compatibility
export { RTMValidation, RTMMatrixData } from '../../interfaces/rtm.interface';

// ===========================================================================
// Helper Types
// ===========================================================================

type RTMRequirementData = {
  id: string;
  description: string;
  type: string;
  status: string;
  kind: JourneyKind;
  parentItemId?: string;
  hierarchyLevel: number;
};

type RTMTaskData = {
  id: string;
  name: string;
  wbsNodeId?: string;
  wbsNodeName: string;
};

type RequirementMaps = {
  byId: Map<string, Requirement>;
  childrenByParent: Map<string, Requirement[]>;
};

type ValidationIssues = {
  unmappedRequirements: string[];
  risks: string[];
};

@Injectable()
export class RTMValidationService {
  private readonly logger = new Logger(RTMValidationService.name);

  constructor(
    @InjectModel(RequirementSchema.name)
    private readonly requirementModel: Model<RequirementDocument>,
  ) {}

  // ===========================================================================
  // Public: RTM Validation
  // ===========================================================================

  public async validateRTM(projectId: string): Promise<RTMValidation> {
    this.logger.log(`Validating journey for project ${projectId}`);
    try {
      const requirements = await this.fetchRequirements(projectId);
      const total = requirements.length;

      if (total === 0) {
        return {
          isValid: false,
          unmappedRequirements: [],
          risks: ['Nenhum item de jornada definido para o projeto'],
          coverage: 0,
        };
      }

      const maps = this.buildRequirementMaps(requirements);
      const { unmappedRequirements, risks } = this.findValidationIssues(requirements, maps);

      return this.calculateValidationResult({ total, unmappedRequirements, risks });
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Error validating journey: ${err.message}`);
      return {
        isValid: false,
        unmappedRequirements: [],
        risks: [`Erro ao validar jornada: ${err.message}`],
        coverage: 0,
      };
    }
  }

  // ===========================================================================
  // Public: RTM Matrix Generation
  // ===========================================================================

  public async getRTMMatrix(projectId: string, tasks: Task[]): Promise<RTMMatrixData> {
    this.logger.log(`Generating journey matrix for project ${projectId}`);
    try {
      const requirements = await this.fetchSortedRequirements(projectId);
      const matrix = this.buildTraceabilityMatrix(requirements);
      const validation = await this.validateRTM(projectId);
      const requirementsData = this.mapRequirementsToDTO(requirements);
      const tasksData = this.mapTasksToDTO(tasks);

      return {
        requirements: requirementsData,
        tasks: tasksData,
        matrix,
        validation,
      };
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Error generating journey matrix: ${err.message}`);
      return {
        requirements: [],
        tasks: [],
        matrix: new Map(),
        validation: {
          isValid: false,
          unmappedRequirements: [],
          risks: [`Erro ao gerar matriz: ${err.message}`],
          coverage: 0,
        },
      };
    }
  }

  // ===========================================================================
  // Private Helpers for RTM Validation
  // ===========================================================================

  private async fetchRequirements(projectId: string): Promise<Requirement[]> {
    const docs = await this.requirementModel.find({ projectId });
    return docs.map(RequirementMapper.toDomain);
  }

  private async fetchSortedRequirements(projectId: string): Promise<Requirement[]> {
    const docs = await this.requirementModel
      .find({ projectId })
      .sort({ hierarchyLevel: 1, createdAt: 1, _id: 1 });
    return docs.map(RequirementMapper.toDomain);
  }

  private buildRequirementMaps(requirements: Requirement[]): RequirementMaps {
    const byId = new Map<string, Requirement>();
    const childrenByParent = new Map<string, Requirement[]>();

    for (const req of requirements) {
      const id = String(req.id ?? '');
      byId.set(id, req);
    }

    for (const req of requirements) {
      const parentId = req.parentItemId ? String(req.parentItemId) : undefined;
      if (!parentId) continue;

      const list = childrenByParent.get(parentId) || [];
      list.push(req);
      childrenByParent.set(parentId, list);
    }

    return { byId, childrenByParent };
  }

  private findValidationIssues(requirements: Requirement[], maps: RequirementMaps): ValidationIssues {
    const unmappedRequirements: string[] = [];
    const risks: string[] = [];

    for (const req of requirements) {
      const id = String(req.id ?? '');
      const parentId = req.parentItemId ? String(req.parentItemId) : undefined;

      if (parentId && !maps.byId.has(parentId)) {
        risks.push(`Item ${id} aponta para pai inexistente (${parentId})`);
      }

      const { risk, isUnmapped } = this.checkRequirementRules(req, maps.childrenByParent);
      if (risk) risks.push(risk);
      if (isUnmapped) unmappedRequirements.push(id);
    }

    return { unmappedRequirements, risks };
  }

  private checkRequirementRules(
    req: Requirement,
    childrenByParent: Map<string, Requirement[]>,
  ): { risk: string | null; isUnmapped: boolean } {
    const id = String(req.id ?? '');
    const description = String(req.description || 'Item');
    const kind = normalizeKind(req.kind || req.type);
    const linkedActions = getLinkedActions(req);

    const hasChildOfKind = (targetKind: JourneyKind) => {
      const children = childrenByParent.get(id) || [];
      return children.some((child) => normalizeKind(child.kind || child.type) === targetKind);
    };

    switch (kind) {
      case 'objective':
        if (!hasChildOfKind('habit')) {
          return { risk: `Objetivo sem hábito vinculado: "${description}"`, isUnmapped: true };
        }
        break;
      case 'habit':
        if (!hasChildOfKind('stage')) {
          return { risk: `Hábito sem etapa vinculada: "${description}"`, isUnmapped: true };
        }
        break;
      case 'stage':
        if (!hasChildOfKind('action')) {
          return { risk: `Etapa sem ação vinculada: "${description}"`, isUnmapped: true };
        }
        break;
      case 'action':
        if (linkedActions.length === 0) {
          return { risk: `Ação sem tarefa rastreada: "${description}"`, isUnmapped: true };
        }
        if (linkedActions.length > 3) {
          return {
            risk: `Ação "${description}" vinculada a ${linkedActions.length} tarefas (avaliar granularidade)`,
            isUnmapped: false,
          };
        }
        break;
    }
    return { risk: null, isUnmapped: false };
  }

  private calculateValidationResult(params: {
    total: number;
    unmappedRequirements: string[];
    risks: string[];
  }): RTMValidation {
    const { total, unmappedRequirements, risks } = params;
    const mapped = total - unmappedRequirements.length;
    const coverage = total > 0 ? (mapped / total) * 100 : 0;
    const isValid = unmappedRequirements.length === 0;

    if (!isValid) {
      risks.push(`${unmappedRequirements.length} item(ns) da jornada sem rastreabilidade completa`);
    }

    return {
      isValid,
      unmappedRequirements,
      risks,
      coverage: Math.round(coverage * 10) / 10,
    };
  }

  // ===========================================================================
  // Private Helpers for RTM Matrix Generation
  // ===========================================================================

  private buildTraceabilityMatrix(requirements: Requirement[]): Map<string, Set<string>> {
    const matrix = new Map<string, Set<string>>();
    for (const req of requirements) {
      const reqId = String(req.id ?? '');
      const traceable = getLinkedActions(req);
      matrix.set(reqId, new Set(traceable));
    }
    return matrix;
  }

  private mapRequirementsToDTO(requirements: Requirement[]): RTMRequirementData[] {
    return requirements.map((req) => {
      const kind = normalizeKind(req.kind || req.type);
      return {
        id: String(req.id ?? ''),
        description: req.description,
        type: req.type || kind,
        status: req.status,
        kind,
        parentItemId: req.parentItemId ? String(req.parentItemId) : undefined,
        hierarchyLevel: Number(req.hierarchyLevel ?? levelForKind(kind)),
      };
    });
  }

  private mapTasksToDTO(tasks: Task[]): RTMTaskData[] {
    const wbsNameMap = new Map<string, string>();
    return tasks.map((task) => ({
      id: String(task.id ?? ''),
      name: task.name || 'Task',
      wbsNodeId: task.parentWbsNodeId ? String(task.parentWbsNodeId) : undefined,
      wbsNodeName: this.getWbsNodeName(task, wbsNameMap),
    }));
  }

  private getWbsNodeName(task: Task, wbsNameMap: Map<string, string>): string {
    const wbsNodeId = task.parentWbsNodeId ? String(task.parentWbsNodeId) : undefined;
    if (!wbsNodeId) {
      return 'Sem WBS';
    }

    if (wbsNameMap.has(wbsNodeId)) {
      return wbsNameMap.get(wbsNodeId) || 'Sem WBS';
    }

    let wbsNodeName: string;
    if (task.wbsPath) {
      const pathParts = String(task.wbsPath)
        .split('>')
        .map((p) => p.trim())
        .filter(Boolean);
      wbsNodeName = pathParts[pathParts.length - 1] || wbsNodeId.slice(0, 12);
    } else {
      wbsNodeName = `WBS: ${wbsNodeId.slice(0, 12)}`;
    }

    wbsNameMap.set(wbsNodeId, wbsNodeName);
    return wbsNodeName;
  }
}
