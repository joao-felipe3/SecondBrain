import { Injectable } from '@nestjs/common';
import { WBSNodeDto, ValidateWBSResponseDto } from '../../../dto/wbs.dto';
import { BudgetValidationSummary } from '../../../interfaces';
import { WbsAiService } from '../../../../ai/services/projects/wbs-ai.service';

// Handles WBS validation logic (8/80 rule) and decomposition suggestions
@Injectable()
export class WbsValidationService {
  constructor(private readonly wbsAiService: WbsAiService) {}

  // Validate a single WBS node against the 8/80 rule
  validateNode(node: WBSNodeDto): ValidateWBSResponseDto {
    const isLeaf = !node.children || node.children.length === 0;
    if (!isLeaf) return { valid: true };

    if (node.estimatedHours < 8) {
      return {
        valid: false,
        reason: `"${node.name}" é muito pequeno (${node.estimatedHours}h). Pacotes de trabalho devem ter no mínimo 8 horas. Combine com outras tarefas ou aumente o escopo.`,
      };
    }

    if (node.estimatedHours > 80) {
      return {
        valid: false,
        reason: `"${node.name}" é muito grande (${node.estimatedHours}h). Pacotes de trabalho devem ter no máximo 80 horas. Decomponha em sub-pacotes menores.`,
      };
    }

    return { valid: true };
  }

  // Validate all nodes in the WBS tree and return all violations
  validateTree(nodes: WBSNodeDto[]): {
    valid: boolean;
    violations: ValidateWBSResponseDto[];
  } {
    const violations: ValidateWBSResponseDto[] = [];

    const traverse = (nodeList: WBSNodeDto[]) => {
      for (const node of nodeList) {
        const result = this.validateNode(node);
        if (!result.valid) {
          violations.push(result);
        }
        if (node.children && node.children.length > 0) {
          traverse(node.children);
        }
      }
    };

    traverse(nodes);
    return { valid: violations.length === 0, violations };
  }

  validateBudget(
    nodes: WBSNodeDto[],
    budgetHours: number,
    context?: { weeklyHours?: number; weeksAvailable?: number },
  ): BudgetValidationSummary {
    const leaves = this.collectLeafNodes(nodes);
    const totalLeafHours = this.roundHours(
      leaves.reduce((sum, node) => sum + (Number(node.estimatedHours) || 0), 0),
    );
    const safeBudget =
      Number.isFinite(Number(budgetHours)) && Number(budgetHours) > 0 ? Number(budgetHours) : 0;
    const deltaHours = this.roundHours(totalLeafHours - safeBudget);
    const overBudget = safeBudget > 0 ? totalLeafHours > safeBudget : false;

    return {
      budgetHours: this.roundHours(safeBudget),
      totalLeafHours,
      overBudget,
      deltaHours,
      utilizationPct: safeBudget > 0 ? this.roundHours((totalLeafHours / safeBudget) * 100) : 0,
      ...(context?.weeklyHours ? { weeklyHours: context.weeklyHours } : {}),
      ...(context?.weeksAvailable ? { weeksAvailable: context.weeksAvailable } : {}),
    };
  }

  normalizeTreeToBudget(nodes: WBSNodeDto[], budgetHours: number): WBSNodeDto[] {
    const normalized = this.cloneNodes(nodes);
    const leaves = this.collectLeafNodes(normalized);
    const safeBudget = Number(budgetHours);

    if (!Number.isFinite(safeBudget) || safeBudget <= 0 || leaves.length === 0) return normalized;

    const currentTotal = this.sumHours(leaves);
    if (!Number.isFinite(currentTotal) || currentTotal <= 0) return normalized;

    this.scaleLeafsToBudget(leaves, safeBudget / currentTotal);
    this.iterativelyAdjustLeafs(leaves, safeBudget);

    for (const node of normalized) this.recalculateNodeHours(node);
    return normalized;
  }

  private sumHours(nodes: WBSNodeDto[]): number {
    return nodes.reduce((sum, n) => sum + (Number(n.estimatedHours) || 0), 0);
  }

  private scaleLeafsToBudget(leaves: WBSNodeDto[], scaleFactor: number): void {
    for (const leaf of leaves) {
      const scaled = (Number(leaf.estimatedHours) || 0) * scaleFactor;
      leaf.estimatedHours = this.roundHours(Math.min(80, Math.max(8, scaled)));
    }
  }

  private iterativelyAdjustLeafs(leaves: WBSNodeDto[], safeBudget: number): void {
    let adjustedTotal = this.sumHours(leaves);
    let guard = 0;

    while (Math.abs(adjustedTotal - safeBudget) > 0.1 && guard < 1000) {
      const shouldDecrease = adjustedTotal > safeBudget;
      const sorted = [...leaves].sort((a, b) =>
        shouldDecrease
          ? (Number(b.estimatedHours) || 0) - (Number(a.estimatedHours) || 0)
          : (Number(a.estimatedHours) || 0) - (Number(b.estimatedHours) || 0),
      );

      let changed = false;
      for (const leaf of sorted) {
        const step = shouldDecrease ? -0.5 : 0.5;
        const candidate = this.roundHours((Number(leaf.estimatedHours) || 0) + step);
        if (candidate < 8 || candidate > 80) continue;
        leaf.estimatedHours = candidate;
        adjustedTotal = this.roundHours(adjustedTotal + step);
        changed = true;
        if (Math.abs(adjustedTotal - safeBudget) <= 0.1) break;
      }

      if (!changed) break;
      guard += 1;
    }
  }

  private cloneNodes(nodes: WBSNodeDto[]): WBSNodeDto[] {
    return nodes.map((node) => ({
      ...node,
      estimatedHours: Number(node.estimatedHours) || 0,
      children: node.children ? this.cloneNodes(node.children) : [],
    }));
  }

  private collectLeafNodes(nodes: WBSNodeDto[]): WBSNodeDto[] {
    const leaves: WBSNodeDto[] = [];
    const traverse = (list: WBSNodeDto[]) => {
      for (const node of list) {
        if (!node.children || node.children.length === 0) {
          leaves.push(node);
          continue;
        }
        traverse(node.children);
      }
    };
    traverse(nodes);
    return leaves;
  }

  private recalculateNodeHours(node: WBSNodeDto): number {
    if (!node.children || node.children.length === 0) {
      node.estimatedHours = this.roundHours(Number(node.estimatedHours) || 0);
      return node.estimatedHours;
    }
    const total = node.children.reduce((sum, child) => sum + this.recalculateNodeHours(child), 0);
    node.estimatedHours = this.roundHours(total);
    return node.estimatedHours;
  }

  private roundHours(value: number): number {
    return Math.round(value * 10) / 10;
  }

  // Suggest how to decompose a node that violates the 8/80 rule
  async suggestDecomposition(node: {
    name: string;
    description?: string;
    estimatedHours: number;
  }): Promise<string> {
    return this.wbsAiService.suggestDecomposition(node);
  }
}
