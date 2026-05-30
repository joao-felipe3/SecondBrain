/**
 * Helper functions for WBS task processing
 */

// Infer cognitive type from task title and description
export function inferCognitiveType(
  title?: string,
  description?: string,
): string {
  const text = `${title || ''} ${description || ''}`.toLowerCase();
  if (!text.trim()) return 'other';

  if (
    /(teste|testar|simulad|quiz|prova|avaliar|verificar|checagem)/i.test(text)
  )
    return 'test';
  if (/(revisar|review|reforç|consolidar|flashcard|recall)/i.test(text))
    return 'review';
  if (
    /(escrever|redigir|produzir|criar|implementar|codificar|construir|diagramar|desenvolver)/i.test(
      text,
    )
  ) {
    return 'deep';
  }
  if (
    /(capturar|coletar|levantar|listar|mapear|pesquisar|ler|ouvir|anotar|preparar|organizar|configurar)/i.test(
      text,
    )
  ) {
    return 'capture';
  }

  return 'other';
}

// Extract definition of done from description text
export function extractDefinitionOfDone(
  description?: string,
): string | undefined {
  if (!description) return undefined;

  const match = description.split(
    /(?:defini[cç][aã]o de pronto|pronto quando)\s*:/i,
  );
  if (match.length < 2) return undefined;
  const trimmed = (match[1] || '').trim();
  return trimmed ? trimmed : undefined;
}

// Extract checklist steps from description text
export function extractChecklistSteps(
  description?: string,
): string[] | undefined {
  if (!description) return undefined;

  const lines = description.split('\n');
  const steps: string[] = [];

  for (const line of lines) {
    // Match numbered steps: "1. ...", "2) ...", "3- ...", etc
    const match = line.match(/^\s*\d+[\.\)\-\:]?\s+(.+)$/);

    if (match && match[1]) {
      const step = match[1].trim();
      if (step.length >= 5) {
        steps.push(step);
      }
    }
  }

  if (steps.length >= 2) {
    return steps.slice(0, 8); // Max 8 steps
  }

  // Fallback: bullet points
  const bullets: string[] = [];
  for (const line of lines) {
    const match = line.match(/^\s*[\-\*\•]\s+(.+)$/);
    if (match && match[1]) {
      const step = match[1].trim();
      if (step.length >= 5) {
        bullets.push(step);
      }
    }
  }

  if (bullets.length >= 2) {
    return bullets.slice(0, 8);
  }

  return undefined;
}

// Returns all "leaf" nodes from a WBS tree,
export function getLeafNodesWithPaths(nodes: any[]): Array<{
  node: any;
  path: string;
  level: number;
}> {
  const leafNodes: Array<{ node: any; path: string; level: number }> = [];

  // Recursive function to traverse WBS nodes
  const traverse = (
    nodeList: any[],
    parentPath: string = '',
    level: number = 1,
  ) => {
    for (const node of nodeList) {
      // Build the readable path to the current node
      const nodePath = parentPath ? `${parentPath} > ${node.name}` : node.name;

      // A node is considered a leaf if it has no children or the array is empty
      const isLeaf = !node.children || node.children.length === 0;

      // Store the leaf node, or continue traversal for its children
      if (isLeaf) leafNodes.push({ node, path: nodePath, level });
      else if (node.children) traverse(node.children, nodePath, level + 1);
    }
  };

  traverse(nodes);
  return leafNodes;
}

// Compute leaf hours for audit
export function computeLeafHours(
  tasks: Array<{ pomodorosPlanned?: number }>,
): number {
  const totalPoms = tasks.reduce(
    (sum, task) => sum + (task?.pomodorosPlanned || 0),
    0,
  );
  return totalPoms * 0.5;
}

// Shrink leaf tasks to target hours by adjusting pomodoros
export function shrinkLeafTasksToTargetHours(
  tasks: Array<{ pomodorosPlanned: number }>,
  targetHours: number,
): void {
  const currentPoms = tasks.reduce((sum, t) => sum + t.pomodorosPlanned, 0);
  const currentHours = currentPoms * 0.5;

  if (currentHours <= targetHours || targetHours <= 0) return;

  const shrinkRatio = targetHours / currentHours;

  for (const t of tasks) {
    const newPom = Math.max(1, Math.round(t.pomodorosPlanned * shrinkRatio));
    t.pomodorosPlanned = newPom;
  }
}
