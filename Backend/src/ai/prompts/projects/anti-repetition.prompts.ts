import { taskTitleKey } from '../../../projects/services/wbs/utils/normalizers.util';

const DEFAULT_MAX_TITLES = 150;

function getMaxTitles(): number {
  const raw = Number(process.env.WBS_ANTI_REPEAT_MAX_TITLES);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_MAX_TITLES;
}

/**
 * Bloco "ANTI-REPETIÇÃO" dos prompts de micro-tarefas.
 *
 * Envia TODOS os títulos já usados num único bloco (títulos são curtos: ~150 cabem em poucos
 * milhares de tokens). Não faz lotes: para evitar repetição o modelo precisa ver a lista inteira
 * de uma vez, e lotes multiplicariam as chamadas sem ganho. Títulos iguais após normalização
 * contam uma vez; passando do limite, ficam os mais recentes.
 */
export function buildAntiRepetitionBlock(titles?: string[]): string {
  const seen = new Set<string>();
  const unique: string[] = [];
  // Percorre do mais recente ao mais antigo para que, ao truncar, fiquem os últimos.
  for (const raw of [...(titles || [])].reverse()) {
    const title = String(raw || '').trim();
    if (!title) continue;
    const key = taskTitleKey(title) || title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(title);
  }
  const list = unique.slice(0, getMaxTitles()).reverse();
  if (list.length === 0) return '';
  return `\n\nANTI-REPETIÇÃO (títulos já usados; NÃO repita nem gere muito similar):\n${list
    .map((t, i) => `${i + 1}. ${t}`)
    .join('\n')}\n`;
}
