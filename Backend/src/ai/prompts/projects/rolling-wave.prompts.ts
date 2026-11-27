/**
 * Pure prompt builder functions for Rolling Wave planning domain.
 * No NestJS decorators, no side effects — only string construction.
 */

export interface SliceGoalsPromptPackage {
  id: string;
  path: string;
  name: string;
  description?: string;
  /** Horas de cada fatia, em ordem. */
  sliceHours: number[];
}

/**
 * Pede à IA só o objetivo de cada fatia dos pacotes. Horas e ondas já foram decididas
 * de forma determinística; a IA descreve o escopo concreto de cada parte, em progressão.
 */
export function buildSliceGoalsPrompt(params: {
  projectName: string;
  projectSummary?: string;
  packages: SliceGoalsPromptPackage[];
}): string {
  const list = params.packages
    .map((p) => {
      const desc = String(p.description || '').trim();
      return [
        `- id: "${p.id}"`,
        `  pacote: "${p.name}"`,
        `  caminho: "${p.path}"`,
        desc ? `  descrição: "${desc.replace(/\s+/g, ' ').slice(0, 400)}"` : '',
        `  fatias: ${p.sliceHours.length} (horas: ${p.sliceHours.join(', ')})`,
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n');

  return `Você é um planejador de projetos (Rolling Wave). Pacotes grandes da WBS foram divididos em fatias sequenciais que serão executadas em momentos diferentes.

PROJETO: ${params.projectName}
${params.projectSummary ? `OBJETIVO: ${params.projectSummary}\n` : ''}
Para cada pacote abaixo, escreva o OBJETIVO de cada fatia: o recorte concreto do escopo que aquela fatia entrega.

PACOTES:
${list}

REGRAS:
1. Exatamente uma frase por fatia, na mesma quantidade de fatias do pacote.
2. As fatias juntas cobrem o pacote inteiro, sem sobreposição, em progressão lógica (fundamentos → prática → integração/revisão).
3. Seja específico ao conteúdo (ex.: "Decks dos capítulos 1 a 3 e revisão espaçada diária"), nunca genérico ("Parte 1", "Continuar o pacote").
4. Proporcione o escopo às horas da fatia.
5. Escreva em português, até 140 caracteres por objetivo.

Retorne APENAS JSON válido, sem markdown:
{"packages":[{"id":"<id do pacote>","goals":["objetivo da fatia 1","objetivo da fatia 2"]}]}`;
}
