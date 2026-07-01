/**
 * Pure prompt builder functions for Task Dependency Inference.
 * Extracted from `src/tasks/services/dependencies/dependency-inference.service.ts`.
 * No NestJS decorators, no side effects — only string construction.
 */

import { InferenceTask, InferenceLeafGates } from '../../tasks/interfaces/dependency-inference.interface';
import { truncateText } from '../../tasks/services/dependencies/utils/dependency-inference.utils';

export function buildInferWithAiPrompt(params: {
  hardMaxEdges: number;
  wbsPath?: string;
  leafName?: string;
  tasks: InferenceTask[];
}): string {
  return [
    'Você é um assistente de gerenciamento de projetos. Sua tarefa é sugerir dependências entre micro-tarefas.',
    'Objetivo: construir um DAG (sem ciclos) com dependências MINIMAIS e REALISTAS, preservando PARALelismo quando possível.',
    'Regras:',
    `- Retorne no máximo ${params.hardMaxEdges} dependências.`,
    '- Evite criar uma cadeia linear com todas as tasks; só crie dependência quando houver pré-requisito claro.',
    '- Cada task deve ter 0 a 2 dependências, se possível.',
    '- Só use IDs fornecidos. Não invente tasks.',
    '- Se estiver em dúvida, não crie dependência.',
    '- Use relationship FINISH_TO_START na maioria dos casos. Só use START_TO_START/FINISH_TO_FINISH se for realmente necessário.',
    '- IMPORTANTE: Resposta deve ser JSON VÁLIDO e COMPLETO (nada de markdown, nada de texto extra).',
    '- Mantenha a resposta curta: prefira formato compacto de tuplas e omita reason/confidence.',
    '',
    `Contexto WBS (opcional): ${params.wbsPath || ''}`,
    `Leaf (opcional): ${params.leafName || ''}`,
    '',
    'Entrada (tasks):',
    JSON.stringify(
      params.tasks.map((t) => ({
        id: t.id,
        name: t.name,
        microTaskType: t.microTaskType,
        description: truncateText(t.description, 140),
      })),
    ),
    '',
    'Saída JSON estrita (formato compacto preferido):',
    '{ "dependencies": [ ["taskId", "dependsOnTaskId", "FINISH_TO_START"], ["taskId", "dependsOnTaskId"] ] }',
  ].join('\n');
}

export function buildRetryPrompt(originalPrompt: string, retryEdges: number): string {
  return [
    originalPrompt,
    '',
    'RETRY: Sua resposta anterior estava truncada ou inválida.',
    `- Agora retorne NO MÁXIMO ${retryEdges} dependências.`,
    '- Use APENAS o formato de tuplas (sem objetos) e SEM reason/confidence.',
    '- Se não conseguir inferir com segurança, retorne {"dependencies": []}.',
  ].join('\n');
}

export function buildInferInterLeafPrompt(params: {
  hardMaxEdges: number;
  projectId?: string;
  leaves: InferenceLeafGates[];
  leafTable: any[];
}): string {
  const minEdgesHint = params.leaves.length >= 6 ? 1 : 0;
  return [
    'Você é um assistente de gerenciamento de projetos. Sua tarefa é sugerir dependências ENTRE leafs (macro-ordenação).',
    'Objetivo: criar poucas dependências REALISTAS para conectar o fluxo do projeto e reduzir paralelismo global irreal.',
    'Regras importantes:',
    `- Retorne no máximo ${params.hardMaxEdges} dependências. Poucas arestas é melhor.`,
    ...(minEdgesHint
      ? [
          `- Como há muitos leafs, retorne pelo menos ${minEdgesHint} dependência se houver qualquer ordem natural do fluxo.`,
        ]
      : []),
    '- Use SOMENTE os IDs de gates fornecidos (startGateId/endGateId). Não invente IDs.',
    '- Preferência: taskId deve ser startGateId do leaf que depende, e dependsOnTaskId deve ser endGateId do leaf pré-requisito.',
    '- Evite criar uma cadeia linear com todos os leafs; conecte apenas quando houver pré-requisito claro ou ordem natural do fluxo.',
    '- Não crie ciclos. Se estiver em dúvida, não crie dependência.',
    '- Resposta deve ser JSON VÁLIDO e COMPLETO (nada de markdown, nada de texto extra).',
    '',
    `Contexto (opcional) projectId: ${params.projectId || ''}`,
    '',
    'Entrada (leafs + gates):',
    JSON.stringify(params.leafTable),
    '',
    'Saída JSON estrita (formato compacto preferido):',
    '{ "dependencies": [ ["taskId", "dependsOnTaskId", "FINISH_TO_START"], ["taskId", "dependsOnTaskId"] ] }',
  ].join('\n');
}
