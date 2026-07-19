import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { WBSNodeDocument } from '../../../schemas/wbs-node.schema';
import { WBSNodeDto } from '../../../dto/wbs.dto';
import { CacheService } from '../shared/cache.service';

@Injectable()
export class WbsPersistenceService {
  constructor(
    @InjectModel('WBSNode')
    private readonly wbsNodeModel: Model<WBSNodeDocument>,
    private readonly cacheService: CacheService,
  ) {}

  // Save WBS nodes to the database
  async save(projectId: string, nodes: WBSNodeDto[]): Promise<WBSNodeDocument[]> {
    const deleteResult = await this.wbsNodeModel.deleteMany({ projectId }).exec();
    const savedNodes: WBSNodeDocument[] = [];

    // Clean _id from all nodes recursively before saving
    const cleanNodeIds = (nodeList: WBSNodeDto[]): WBSNodeDto[] => {
      return nodeList.map((node) => {
        const { _id, ...cleanNode } = node as any;
        return {
          ...cleanNode,
          children: node.children && node.children.length > 0 ? cleanNodeIds(node.children) : [],
        };
      });
    };

    const cleanedNodes = cleanNodeIds(nodes);
    const saveRecursive = async (nodeList: WBSNodeDto[], parentId: string | null = null, level = 1) => {
      for (const node of nodeList) {
        const doc = new this.wbsNodeModel({
          projectId,
          name: node.name,
          description: node.description || '',
          level,
          parentId,
          estimatedHours: node.estimatedHours,
          order: node.order || 0,
          status: 'planned',
        });

        const saved = await doc.save();
        savedNodes.push(saved);
        const savedId = String(saved._id);

        if (node.children && node.children.length > 0) {
          await saveRecursive(node.children, savedId, level + 1);
        }
      }
    };

    await saveRecursive(cleanedNodes);

    // Invalidate cached drafts for this project
    try {
      await this.cacheService.clearForProject(projectId);
    } catch (err) {
      console.warn('[WbsPersistenceService] erro ao limpar cache de rascunhos', err);
    }
    await this.recalculateEstimatedHours(projectId);

    return savedNodes;
  }

  // Get WBS for a project, reconstructed as a tree
  async get(projectId: string): Promise<WBSNodeDto[]> {
    const allNodes = await this.wbsNodeModel.find({ projectId }).sort({ level: 1, order: 1 }).exec();

    if (allNodes.length === 0) return [];

    // Build tree from flat list
    const nodeMap = new Map<string, WBSNodeDto & { _id: string }>();
    const roots: (WBSNodeDto & { _id: string })[] = [];

    // First, add all nodes to map
    for (const doc of allNodes) {
      const node: WBSNodeDto & { _id: string } = {
        _id: String(doc._id),
        name: doc.name,
        description: doc.description,
        level: doc.level,
        parentId: doc.parentId || undefined,
        estimatedHours: doc.estimatedHours,
        order: doc.order,
        children: [],
      };
      nodeMap.set(node._id, node);
    }

    // Then, build hierarchy
    for (const node of nodeMap.values()) {
      if (node.parentId) {
        const parent = nodeMap.get(node.parentId);
        if (parent) {
          parent.children!.push(node);
        } else {
          console.warn(
            `Nó órfão encontrado: "${node.name}" (level ${node.level}) - parentId não existe: ${node.parentId}`,
          );
        }
      } else {
        if (node.level === 1) {
          roots.push(node);
        } else {
          console.warn(
            `Nó inválido: "${node.name}" (level ${node.level}) sem parentId - deveria ser level 1`,
          );
        }
      }
    }

    return roots;
  }

  calculateTotalHours(nodes: WBSNodeDto[]): number {
    let total = 0;
    const traverse = (nodeList: WBSNodeDto[]) => {
      for (const node of nodeList) {
        const isLeaf = !node.children || node.children.length === 0;
        if (isLeaf) {
          total += node.estimatedHours || 0;
        } else if (node.children) {
          traverse(node.children);
        }
      }
    };
    traverse(nodes);
    return total;
  }

  private async recalculateEstimatedHours(projectId: string): Promise<void> {
    try {
      const allNodes = await this.wbsNodeModel.find({ projectId }).exec();
      if (allNodes.length === 0) return;

      // Find all parent nodes
      const parentIds = new Set(allNodes.map((n) => n.parentId).filter(Boolean));

      for (const parentId of parentIds) {
        const parent = allNodes.find((n) => String(n._id) === parentId);
        if (!parent) continue;

        // Sum all children's estimatedHours
        const children = allNodes.filter((n) => String(n.parentId) === parentId);
        const totalHours = children.reduce((sum, child) => sum + (child.estimatedHours || 0), 0);

        // Update parent
        parent.estimatedHours = totalHours;
        await parent.save();
      }
    } catch (error) {
      console.error('Erro ao recalcular estimatedHours:', error);
    }
  }
}
