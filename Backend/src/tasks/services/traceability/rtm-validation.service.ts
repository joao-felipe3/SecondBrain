import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Requirement,
  RequirementDocument,
  JourneyKind,
} from '../../schemas/requirement.schema';
import { TaskDocument } from '../../schemas/task.schema';
import { RTMValidation, RTMMatrixData } from '../../interfaces/rtm.interface';
import { normalizeKind, levelForKind, getLinkedActions } from './utils/rtm.utils';

// Re-export interfaces for backwards compatibility
export { RTMValidation, RTMMatrixData } from '../../interfaces/rtm.interface';

@Injectable()
export class RTMValidationService {
  private readonly logger = new Logger(RTMValidationService.name);

  constructor(
    @InjectModel(Requirement.name)
    private readonly requirementModel: Model<RequirementDocument>,
  ) {}

  // ===========================================================================
  // 1. RTM Validation
  // ===========================================================================

  async validateRTM(projectId: string): Promise<RTMValidation> {
    this.logger.log(`Validando jornada para projeto ${projectId}`);
    try {
      const requirements = await this.requirementModel.find({ projectId });
      const total = requirements.length;

      if (total === 0) {
        return {
          isValid: false,
          unmappedRequirements: [],
          risks: ['Nenhum item de jornada definido para o projeto'],
          coverage: 0,
        };
      }

      const byId = new Map<string, RequirementDocument>();
      const childrenByParent = new Map<string, RequirementDocument[]>();
      const unmappedRequirements: string[] = [];
      const risks: string[] = [];

      for (const req of requirements) {
        const id = String(req._id ?? req.id ?? '');
        byId.set(id, req);
      }

      for (const req of requirements) {
        const id = String(req._id ?? req.id ?? '');
        const parentId = req.parentItemId ? String(req.parentItemId) : undefined;
        if (!parentId) continue;
        const list = childrenByParent.get(parentId) || [];
        list.push(req);
        childrenByParent.set(parentId, list);

        if (!byId.has(parentId)) {
          risks.push(`Item ${id} aponta para pai inexistente (${parentId})`);
        }
      }

      const hasChildOfKind = (id: string, kind: JourneyKind): boolean => {
        const children = childrenByParent.get(id) || [];
        return children.some((child) => normalizeKind(child.kind || child.type) === kind);
      };

      for (const req of requirements) {
        const id = String(req._id ?? req.id ?? '');
        const description = String(req.description || 'Item');
        const kind = normalizeKind(req.kind || req.type);
        const linkedActions = getLinkedActions(req);

        if (kind === 'objective') {
          if (!hasChildOfKind(id, 'habit')) {
            unmappedRequirements.push(id);
            risks.push(`Objetivo sem hábito vinculado: "${description}"`);
          }
          continue;
        }

        if (kind === 'habit') {
          if (!hasChildOfKind(id, 'stage')) {
            unmappedRequirements.push(id);
            risks.push(`Hábito sem etapa vinculada: "${description}"`);
          }
          continue;
        }

        if (kind === 'stage') {
          if (!hasChildOfKind(id, 'action')) {
            unmappedRequirements.push(id);
            risks.push(`Etapa sem ação vinculada: "${description}"`);
          }
          continue;
        }

        if (linkedActions.length === 0) {
          unmappedRequirements.push(id);
          risks.push(`Ação sem tarefa rastreada: "${description}"`);
        } else if (linkedActions.length > 3) {
          risks.push(
            `Ação "${description}" vinculada a ${linkedActions.length} tarefas (avaliar granularidade)`,
          );
        }
      }

      const mapped = total - unmappedRequirements.length;
      const coverage = (mapped / total) * 100;
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
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Erro ao validar jornada: ${err.message}`);
      return {
        isValid: false,
        unmappedRequirements: [],
        risks: [`Erro ao validar jornada: ${err.message}`],
        coverage: 0,
      };
    }
  }

  // ===========================================================================
  // 2. RTM Matrix Generation
  // ===========================================================================

  async getRTMMatrix(projectId: string, tasks: TaskDocument[]): Promise<RTMMatrixData> {
    this.logger.log(`Gerando matriz de jornada para projeto ${projectId}`);
    try {
      const requirements = await this.requirementModel
        .find({ projectId })
        .sort({ hierarchyLevel: 1, createdAt: 1, _id: 1 });

      const matrix = new Map<string, Set<string>>();
      for (const req of requirements) {
        const reqId = String(req._id ?? req.id ?? '');
        const traceable = getLinkedActions(req);
        matrix.set(reqId, new Set(traceable));
      }

      const validation = await this.validateRTM(projectId);

      const requirementsData = requirements.map((req) => {
        const kind = normalizeKind(req.kind || req.type);
        return {
          id: String(req._id ?? req.id ?? ''),
          description: req.description,
          type: req.type || kind,
          status: req.status,
          kind,
          parentItemId: req.parentItemId ? String(req.parentItemId) : undefined,
          hierarchyLevel: Number(req.hierarchyLevel ?? levelForKind(kind)),
        };
      });

      const wbsNameMap = new Map<string, string>();
      const tasksData = tasks.map((task) => {
        const wbsNodeId = task.parentWbsNodeId ? String(task.parentWbsNodeId) : undefined;

        let wbsNodeName = 'Sem WBS';
        if (wbsNodeId) {
          if (wbsNameMap.has(wbsNodeId)) {
            wbsNodeName = wbsNameMap.get(wbsNodeId) || 'Sem WBS';
          } else {
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
          }
        }

        return {
          id: String(task._id ?? task.id ?? ''),
          name: task.name || 'Task',
          wbsNodeId,
          wbsNodeName,
        };
      });

      return {
        requirements: requirementsData,
        tasks: tasksData,
        matrix,
        validation,
      };
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Erro ao gerar matriz de jornada: ${err.message}`);
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
}
