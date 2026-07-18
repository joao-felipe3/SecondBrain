/**
 * Pure prompt builder functions for the WBS Monotony Fix domain.
 * Extracted from `src/projects/services/wbs/monotony/monotony-fix.service.ts`.
 * No NestJS decorators, no side effects — only string construction.
 */

import { MicroTaskDraft } from '../../../projects/interfaces';
import { WBSNodeDto } from '../../../projects/dto/wbs.dto';
import { extractVerb, templateTitle } from '../../../projects/services/wbs/utils/normalizers.util';

export function buildFixMonotonyPrompt(params: {
  project: any;
  node: WBSNodeDto;
  currentPath: string;
  chunkMinutes: number[];
  drafts: MicroTaskDraft[];
  indices: number[];
  round: number;
}): string {
  const today = new Date().toISOString().split('T')[0];
  const projectSummary = params.project?.smartObjective?.summary || params.project?.description || '';

  const indicesText = params.indices.map((i) => i).join(', ');

  const fixedTargets = params.indices
    .map((idx) => {
      const d: any = params.drafts[idx] || {};
      const minutes = params.chunkMinutes[idx];
      return {
        chunkIndex: idx,
        targetMinutes: minutes,
        microTaskType: String(d.microTaskType || 'practice'),
        themeTag: String(d.themeTag || '').trim(),
        contextTag: String(d.contextTag || '').trim(),
        cognitiveMode: String(d.cognitiveMode || '').trim(),
        previousName: String(d.name || '').trim(),
      };
    })
    .map((o) => JSON.stringify(o))
    .join('\n');

  const keepIndices = new Set(params.indices);
  const keepVerbs = params.drafts
    .map((d, idx) => ({ idx, verb: extractVerb(d?.name) }))
    .filter((x) => !keepIndices.has(x.idx) && x.verb && x.verb !== 'unknown')
    .map((x) => x.verb);
  const avoidVerbs = Array.from(new Set(keepVerbs)).slice(0, 20);

  const keepTemplates = params.drafts
    .map((d, idx) => ({ idx, tpl: templateTitle(d?.name) }))
    .filter((x) => !keepIndices.has(x.idx) && x.tpl)
    .map((x) => x.tpl);
  const avoidTemplates = Array.from(new Set(keepTemplates)).slice(0, 25);

  const strictnessHint =
    params.round >= 1
      ? 'Esta é uma segunda tentativa: seja ainda mais diferente (mude verbo + entregável + formato).'
      : '';

  return `Você é um especialista em criar micro-tarefas executáveis e NÃO repetitivas.

Contexto do projeto: ${projectSummary || 'Sem resumo'}

WBS (nó folha):
- Nome: "${params.node.name}"
- Descrição: "${params.node.description || 'Sem descrição'}"
- Caminho: "${params.currentPath}"

Problema: algumas micro-tarefas ficaram repetitivas/monótonas ou com padrões proibidos (ex.: "Parte 1/4").

Sua tarefa: REGERAR APENAS os itens com chunkIndex em [${indicesText}] mantendo o mesmo objetivo do nó.

ALVOS (NÃO altere chunkIndex; use os metadados como guia):
${fixedTargets}

REGRAS IMPORTANTES (anti-monotonia):
1) Proibido usar frações como "1/4" no nome (inclui "Parte 1/4"). Se usar "Parte N", use apenas "Parte N" (sem "/M").
1b) Proibido usar nomes genéricos/placeholder como "entregável", "mini-simulado" ou "N palavras". O nome deve citar um ARTEFATO concreto (ex.: resumo, lista de erros, flashcards, mapa mental, simulado completo, checklist, etc.).
2) O nome deve começar com um VERBO de ação (GTD) e variar entre os itens.
3) Evite repetir verbos já usados nos outros itens: ${avoidVerbs.length ? avoidVerbs.join(', ') : 'sem lista'}.
4) Evite repetir templates (mesma ideia com palavras trocadas). Templates a evitar: ${avoidTemplates.length ? avoidTemplates.join(' | ') : 'sem lista'}.
5) O mais importante é retornar "checklist" (2-5 passos) + "definitionOfDone".
6) "description" é opcional e, se existir, deve ser breve (1-2 linhas) e NÃO duplicar checklist/DoD.
7) Mantenha a duração alvo (targetMinutes) e respeite 1-6 pomodoros.
${strictnessHint}

FORMATO DE RESPOSTA OBRIGATÓRIO:
Retorne APENAS um array JSON válido (sem markdown), com EXATAMENTE ${params.indices.length} itens.
Cada item deve ter:
- "chunkIndex": number (0-based)
- "name": string
- "checklist": string[] (2-5 itens, sem numeração)
- "definitionOfDone": string (1-2 frases)
- "pomodorosPlanned": number (1-6)
- "priority": number (1-4)
- "difficult": number (1-4)

Opcional:
- "description": string (breve)

Use hoje como ${today}.`;
}
