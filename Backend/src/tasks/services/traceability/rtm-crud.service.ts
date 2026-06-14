import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Requirement, RequirementDocument, JourneyKind } from '../../schemas/requirement.schema';
import { normalizeKind, normalizeType, levelForKind, getLinkedActions } from './utils/rtm.utils';

@Injectable()
export class RTMCrudService {
  private readonly logger = new Logger(RTMCrudService.name);

  constructor(
    @InjectModel(Requirement.name)
    private readonly requirementModel: Model<RequirementDocument>,
  ) {}

  // ===========================================================================
  // 1. Requirements Retrieval
  // ===========================================================================

  async getRequirements(projectId: string): Promise<RequirementDocument[]> {
    return this.requirementModel.find({ projectId }).sort({ hierarchyLevel: 1, createdAt: 1, _id: 1 });
  }

  // ===========================================================================
  // 2. Requirements Persistence
  // ===========================================================================

  async saveRequirements(
    projectId: string,
    requirementsData: Array<{
      description: string;
      type?: string;
      source?: string;
      kind?: string;
      ref?: string;
      parentRef?: string;
    }>,
  ): Promise<RequirementDocument[]> {
    this.logger.log(`Salvando ${requirementsData.length} itens de jornada para projeto ${projectId}`);

    try {
      const refToId = new Map<string, string>();
      const insertedIds = new Set<string>();
      const prepared = requirementsData
        .map((item, index) => {
          const kind = normalizeKind(item.kind || item.type);
          const type = normalizeType(item.type, kind);
          const ref = String(item.ref || `${kind.slice(0, 1).toUpperCase()}${index + 1}`).trim();
          const parentRef = item.parentRef ? String(item.parentRef).trim() : undefined;
          const description = String(item.description || '').trim();
          return {
            ref,
            parentRef,
            description,
            kind,
            type,
            hierarchyLevel: levelForKind(kind),
            source: item.source || 'manual',
          };
        })
        .filter((item) => item.description.length > 0);

      const orderedByLevel = prepared.sort((a, b) => a.hierarchyLevel - b.hierarchyLevel);
      const inserted: RequirementDocument[] = [];

      for (const item of orderedByLevel) {
        const dedupKey = `${item.kind}::${item.description.toLowerCase()}`;
        if (insertedIds.has(dedupKey)) continue;

        let parentItemId: string | undefined;
        if (item.parentRef && refToId.has(item.parentRef)) {
          parentItemId = refToId.get(item.parentRef);
        }

        const created = await this.requirementModel.create({
          projectId,
          description: item.description,
          title: item.description,
          type: item.type,
          kind: item.kind,
          hierarchyLevel: item.hierarchyLevel,
          parentItemId,
          source: item.source,
          traceableItems: [],
          traceableActionItems: [],
          status: 'open',
        });

        inserted.push(created as RequirementDocument);
        refToId.set(item.ref, String(created._id));
        insertedIds.add(dedupKey);
      }

      this.logger.log(`${inserted.length} itens de jornada salvos com sucesso`);
      return inserted;
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Erro ao salvar itens de jornada: ${err.message}`);
      return [];
    }
  }

  // ===========================================================================
  // 3. Requirements Deletion
  // ===========================================================================

  async deleteRequirement(requirementId: string): Promise<boolean> {
    try {
      const result = await this.requirementModel.findByIdAndDelete(requirementId);
      return !!result;
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Erro ao deletar item de jornada: ${err.message}`);
      return false;
    }
  }

  async deleteAllRequirements(projectId: string): Promise<number> {
    try {
      const result = await this.requirementModel.deleteMany({ projectId });
      this.logger.log(
        `[delete-all-journey] projectId=${projectId} ${result.deletedCount} itens deletados`,
      );
      return result.deletedCount || 0;
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Erro ao deletar todos os itens de jornada: ${err.message}`);
      return 0;
    }
  }

  // ===========================================================================
  // 4. Task Mapping
  // ===========================================================================

  async mapRequirementToTask(
    projectId: string,
    requirementId: string,
    taskId: string,
  ): Promise<Requirement | null> {
    this.logger.log(`Mapeando item ${requirementId} -> tarefa ${taskId}`);
    try {
      const requirement = await this.requirementModel.findOneAndUpdate(
        {
          _id: new Types.ObjectId(requirementId),
          projectId,
        },
        {
          $addToSet: {
            traceableActionItems: taskId,
            traceableItems: taskId,
          },
          $set: { status: 'satisfied' },
        },
        { new: true },
      );

      if (!requirement) {
        this.logger.warn(`Item ${requirementId} não encontrado`);
        return null;
      }

      this.logger.log(`Item ${requirementId} mapeado para tarefa ${taskId}`);
      return requirement;
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Erro ao mapear item: ${err.message}`);
      return null;
    }
  }

  async unmapRequirementFromTask(requirementId: string, taskId: string): Promise<Requirement | null> {
    this.logger.log(`Removendo mapeamento: item ${requirementId} <- tarefa ${taskId}`);
    try {
      const requirement = await this.requirementModel.findByIdAndUpdate(
        requirementId,
        {
          $pull: {
            traceableActionItems: taskId,
            traceableItems: taskId,
          },
        },
        { new: true },
      );

      if (!requirement) {
        this.logger.warn(`Item ${requirementId} não encontrado`);
        return null;
      }

      if (getLinkedActions(requirement).length === 0) {
        requirement.status = 'open';
        await requirement.save();
      }

      this.logger.log(`Mapeamento removido do item ${requirementId}`);
      return requirement;
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Erro ao remover mapeamento: ${err.message}`);
      return null;
    }
  }
}
