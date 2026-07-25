import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Requirement as RequirementSchema, RequirementDocument } from '../../schemas/requirement.schema';
import { Requirement } from '../../entities/requirement.entity';
import { RequirementMapper } from '../../mappers/requirement.mapper';
import {
  MapRequirementToTaskDto,
  SaveRequirementDto,
  PreparedRequirementDataDto,
  ProcessSingleRequirementDto,
} from '../../dto';
import { normalizeKind, normalizeType, levelForKind, getLinkedActions } from './utils/rtm.utils';

@Injectable()
export class RTMCrudService {
  private readonly logger = new Logger(RTMCrudService.name);

  constructor(
    @InjectModel(RequirementSchema.name)
    private readonly requirementModel: Model<RequirementDocument>,
  ) {}

  // ===========================================================================
  // 1. Requirements Retrieval
  // ===========================================================================

  async getRequirements(projectId: string): Promise<Requirement[]> {
    try {
      const docs = await this.requirementModel
        .find({ projectId })
        .sort({ hierarchyLevel: 1, createdAt: 1, _id: 1 });
      return docs.map((doc) => RequirementMapper.toDomain(doc));
    } catch (error: unknown) {
      this.logger.error(
        `Erro ao buscar requisitos para o projeto ${projectId}: ${(error as Error).message}`,
      );
      return [];
    }
  }

  // ===========================================================================
  // 2. Requirements Persistence
  // ===========================================================================

  async saveRequirements(
    projectId: string,
    requirementsData: SaveRequirementDto[],
  ): Promise<Requirement[]> {
    this.logger.log(
      `Iniciando salvamento de ${requirementsData.length} itens de jornada para projeto ${projectId}`,
    );

    try {
      const preparedItems = this._prepareAndFilterRequirements(requirementsData);
      const orderedItems = this._sortRequirementsByHierarchy(preparedItems);

      const refToId = new Map<string, string>();
      const insertedDedupKeys = new Set<string>();
      const insertedRequirements: Requirement[] = [];

      for (const item of orderedItems) {
        const createdRequirement = await this._processAndCreateSingleRequirement({
          projectId,
          item,
          refToId,
          insertedDedupKeys,
        });
        if (createdRequirement) {
          insertedRequirements.push(createdRequirement);
        }
      }

      this.logger.log(`${insertedRequirements.length} itens de jornada salvos com sucesso`);
      return insertedRequirements;
    } catch (error: unknown) {
      this.logger.error(`Erro ao salvar itens de jornada: ${(error as Error).message}`);
      return [];
    }
  }

  private _prepareAndFilterRequirements(
    requirementsData: SaveRequirementDto[],
  ): PreparedRequirementDataDto[] {
    return requirementsData
      .map((item, index) => this._prepareSingleRequirementItem(item, index))
      .filter((item) => item.description.length > 0);
  }

  private _prepareSingleRequirementItem(
    item: SaveRequirementDto,
    index: number,
  ): PreparedRequirementDataDto {
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
  }

  private _sortRequirementsByHierarchy(
    preparedItems: PreparedRequirementDataDto[],
  ): PreparedRequirementDataDto[] {
    return preparedItems.sort((a, b) => a.hierarchyLevel - b.hierarchyLevel);
  }

  private async _processAndCreateSingleRequirement(
    params: ProcessSingleRequirementDto,
  ): Promise<Requirement | null> {
    const { projectId, item, refToId, insertedDedupKeys } = params;
    const { ref, parentRef, ...restOfItem } = item;
    const dedupKey = `${item.kind}::${item.description.toLowerCase()}`;
    if (insertedDedupKeys.has(dedupKey)) {
      this.logger.warn(`Item duplicado detectado e ignorado: ${item.description}`);
      return null;
    }

    let parentItemId: string | undefined;
    if (parentRef) {
      parentItemId = refToId.get(parentRef);
      if (!parentItemId) {
        this.logger.warn(
          `ParentRef ${parentRef} para item ${ref} não encontrado. Item será criado sem pai.`,
        );
      }
    }

    try {
      const created = await this.requirementModel.create({
        projectId,
        ...restOfItem,
        title: item.description,
        parentItemId,
        traceableItems: [],
        traceableActionItems: [],
        status: 'open',
      });

      refToId.set(ref, String(created._id));
      insertedDedupKeys.add(dedupKey);
      return RequirementMapper.toDomain(created);
    } catch (error: unknown) {
      this.logger.error(`Erro ao criar requisito ${ref}: ${(error as Error).message}`);
      return null;
    }
  }

  // ===========================================================================
  // 3. Requirements Deletion
  // ===========================================================================

  async deleteRequirement(requirementId: string): Promise<boolean> {
    try {
      const result = await this.requirementModel.findByIdAndDelete(requirementId);
      if (result) {
        this.logger.log(`Item de jornada ${requirementId} deletado com sucesso.`);
      } else {
        this.logger.warn(`Item de jornada ${requirementId} não encontrado para deleção.`);
      }
      return !!result;
    } catch (error: unknown) {
      this.logger.error(`Erro ao deletar item de jornada ${requirementId}: ${(error as Error).message}`);
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
      this.logger.error(
        `Erro ao deletar todos os itens de jornada para o projeto ${projectId}: ${(error as Error).message}`,
      );
      return 0;
    }
  }

  // ===========================================================================
  // 4. Task Mapping
  // ===========================================================================

  async mapRequirementToTask(dto: MapRequirementToTaskDto): Promise<Requirement | null> {
    const { projectId, requirementId, taskId } = dto;
    this.logger.log(`Iniciando mapeamento: item ${requirementId} -> tarefa ${taskId}`);
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
        this.logger.warn(`Item ${requirementId} não encontrado para mapeamento.`);
        return null;
      }

      this.logger.log(`Item ${requirementId} mapeado para tarefa ${taskId} com sucesso.`);
      return RequirementMapper.toDomain(requirement);
    } catch (error: unknown) {
      this.logger.error(
        `Erro ao mapear item ${requirementId} para tarefa ${taskId}: ${(error as Error).message}`,
      );
      return null;
    }
  }

  async unmapRequirementFromTask(requirementId: string, taskId: string): Promise<Requirement | null> {
    this.logger.log(`Iniciando remoção de mapeamento: item ${requirementId} <- tarefa ${taskId}`);
    try {
      const requirement = await this.requirementModel.findByIdAndUpdate(
        String(requirementId),
        {
          $pull: {
            traceableActionItems: String(taskId),
            traceableItems: String(taskId),
          },
        },
        { new: true },
      );

      if (!requirement) {
        this.logger.warn(`Item ${requirementId} não encontrado para remover mapeamento.`);
        return null;
      }

      await this._updateRequirementStatusIfNoLinkedActions(requirement);

      this.logger.log(`Mapeamento removido do item ${requirementId} com sucesso.`);
      return RequirementMapper.toDomain(requirement);
    } catch (error: unknown) {
      this.logger.error(
        `Erro ao remover mapeamento do item ${requirementId} da tarefa ${taskId}: ${(error as Error).message}`,
      );
      return null;
    }
  }

  private async _updateRequirementStatusIfNoLinkedActions(
    requirement: RequirementDocument,
  ): Promise<void> {
    if (getLinkedActions(requirement).length === 0 && requirement.status !== 'open') {
      this.logger.log(
        `Item ${String(requirement._id)} não possui mais ações vinculadas. Atualizando status para 'open'.`,
      );
      requirement.status = 'open';
      await requirement.save();
    }
  }
}
