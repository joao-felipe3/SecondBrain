import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { GeminiService } from '../../tasks/gemini.service';
import { WBSNodeDocument } from '../schemas/wbs-node.schema';
import { WBSNodeDto, ValidateWBSResponseDto } from '../dto/wbs.dto';

export interface ValidationResult {
  valid: boolean;
  reason?: string;
  suggestion?: string;
}

@Injectable()
export class WBSService {
  constructor(
    @Inject(forwardRef(() => GeminiService))
    private readonly geminiService: GeminiService,
    @InjectModel('WBSNode')
    private readonly wbsNodeModel: Model<WBSNodeDocument>,
  ) {}

  // Micro-task sizing philosophy:
  // Prefer smaller “daily” tasks (1–3 pomodoros) and only use 6 pomodoros (150min)
  // when strictly necessary to avoid generating an excessive number of tasks.
  private readonly microTaskMinMinutes = 25;
  private readonly microTaskPreferredMinutes = 50; // ~2 pomodoros
  private readonly microTaskSoftMaxMinutes = 60; // ~2-3 pomodoros
  private readonly microTaskHardMaxMinutes = 150; // 6 pomodoros (only if needed)
  private readonly microTaskMaxPerLeaf = 40;

  /**
   * Generate a WBS from a SMART objective using Gemini
   */
  async generateWBS(smartObjective: {
    specific: string;
    measurable: string;
    achievable: string;
    relevant: string;
    temporal: string;
    summary?: string;
  }): Promise<WBSNodeDto[]> {
    const prompt = `Você é um consultor de gestão de projetos especializado em WBS (Work Breakdown Structure) segundo PMBOK.

Baseado no objetivo SMART abaixo, gere uma WBS hierárquica CONCISA para o projeto.

Objetivo SMART:
- Específico: ${smartObjective.specific}
- Mensurável: ${smartObjective.measurable}
- Atingível: ${smartObjective.achievable}
- Relevante: ${smartObjective.relevant}
- Temporal: ${smartObjective.temporal}
${smartObjective.summary ? `- Resumo: ${smartObjective.summary}` : ''}

REGRAS IMPORTANTES:
1. A WBS deve ter MÁXIMO 3 níveis de profundidade
2. Inclua APENAS 3-4 entregas principais (nível 1)
3. Cada entrega deve ter 2-4 pacotes de trabalho (nível 2)
4. Evite nível 3 sempre que possível
5. Cada pacote de trabalho (nó folha) deve ter entre 8 e 80 horas estimadas (regra 8/80)
6. Nós intermediários: estimatedHours = soma dos filhos
7. Use nomes claros e descritivos mas CURTOS
8. Descrições BREVES (máximo 1 linha)

Retorne APENAS um array JSON válido e completo, sem texto adicional:
[
  {
    "name": "Nome da Entrega Principal",
    "description": "Descrição breve",
    "level": 1,
    "estimatedHours": 120,
    "order": 1,
    "children": [
      {
        "name": "Pacote de Trabalho",
        "description": "Descrição",
        "level": 2,
        "estimatedHours": 40,
        "order": 1,
        "children": [
          {
            "name": "Sub-pacote",
            "description": "Descrição",
            "level": 3,
            "estimatedHours": 20,
            "order": 1,
            "children": []
          }
        ]
      }
    ]
  }
]`;

    try {
      const response = await this.geminiService.generateContent(prompt);
      return this.parseWBSFromResponse(response);
    } catch (error) {
      console.error('Erro ao gerar WBS:', error);
      throw new Error('Não foi possível gerar a WBS com IA');
    }
  }

  /**
   * Validate a single WBS node against the 8/80 rule
   */
  validateWBSNode(node: WBSNodeDto): ValidateWBSResponseDto {
    // Only validate leaf nodes (no children or empty children)
    const isLeaf = !node.children || node.children.length === 0;

    if (!isLeaf) {
      // Intermediate nodes: just check total consistency
      return { valid: true };
    }

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

  /**
   * Validate all nodes in the WBS tree and return all violations
   */
  validateWBS(nodes: WBSNodeDto[]): { valid: boolean; violations: ValidateWBSResponseDto[] } {
    const violations: ValidateWBSResponseDto[] = [];

    const traverse = (nodeList: WBSNodeDto[]) => {
      for (const node of nodeList) {
        const result = this.validateWBSNode(node);
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

  /**
   * Suggest how to decompose a node that violates the 8/80 rule
   */
  async suggestDecomposition(node: {
    name: string;
    description?: string;
    estimatedHours: number;
  }): Promise<string> {
    const prompt = `Você é um consultor de gestão de projetos especializado em WBS (Work Breakdown Structure).

O seguinte pacote de trabalho viola a regra 8/80 (deve ter entre 8 e 80 horas):

Nome: "${node.name}"
Descrição: "${node.description || 'Sem descrição'}"
Horas Estimadas: ${node.estimatedHours}h

${node.estimatedHours > 80
  ? `Este pacote é MUITO GRANDE (${node.estimatedHours}h > 80h). Sugira como decompor em sub-pacotes menores, cada um entre 8-80 horas.`
  : `Este pacote é MUITO PEQUENO (${node.estimatedHours}h < 8h). Sugira como combinar com outras atividades ou expandir o escopo para atingir pelo menos 8 horas.`
}

Retorne APENAS um array JSON com os sub-pacotes sugeridos:
[
  {
    "name": "Nome do sub-pacote",
    "description": "Descrição",
    "estimatedHours": 20,
    "level": 3,
    "order": 1,
    "children": []
  }
]`;

    try {
      const response = await this.geminiService.generateContent(prompt);
      return response;
    } catch (error) {
      console.error('Erro ao gerar sugestão de decomposição:', error);
      throw new Error('Não foi possível gerar sugestão de decomposição');
    }
  }

  /**
   * Convert WBS leaf nodes into tasks for the project (legacy - kept for compatibility)
   */
  convertWBSToTasks(
    nodes: WBSNodeDto[],
    projectId: string,
  ): Array<{
    name: string;
    description: string;
    projectId: string;
    estimatedMinutes: number;
    priority: number;
    pomodorosPlanned: number;
  }> {
    const tasks: Array<{
      name: string;
      description: string;
      projectId: string;
      estimatedMinutes: number;
      priority: number;
      pomodorosPlanned: number;
    }> = [];

    let priorityCounter = 1;
    const maxMinutesPerMicroTask = this.microTaskHardMaxMinutes;

    const traverse = (nodeList: WBSNodeDto[], parentPath: string = '') => {
      for (const node of nodeList) {
        const currentPath = parentPath ? `${parentPath} > ${node.name}` : node.name;

        if (!node.children || node.children.length === 0) {
          const totalMinutes = Math.max(0, Math.round((node.estimatedHours || 0) * 60));
          const chunkMinutes = this.computeChunkMinutes(totalMinutes);
          const chunks = chunkMinutes.length;

          for (let chunkIndex = 0; chunkIndex < chunks; chunkIndex++) {
            const estimatedMinutes = chunkMinutes[chunkIndex];

            const pomodorosPlanned = Math.max(1, Math.ceil(estimatedMinutes / 25));
            const suffix = chunks > 1 ? ` (${chunkIndex + 1}/${chunks})` : '';

            tasks.push({
              name: `${node.name}${suffix}`,
              description: node.description
                ? `${node.description}\n\nOrigem WBS (pacote 8/80): ${currentPath}\nMicro-tarefa: ${chunkIndex + 1}/${chunks} (~${estimatedMinutes}min)`
                : `Origem WBS (pacote 8/80): ${currentPath}\nMicro-tarefa: ${chunkIndex + 1}/${chunks} (~${estimatedMinutes}min)`,
              projectId,
              estimatedMinutes,
              priority: priorityCounter++,
              pomodorosPlanned,
            });
          }
        } else {
          traverse(node.children, currentPath);
        }
      }
    };

    traverse(nodes);
    return tasks;
  }

  /**
   * Convert WBS to tasks using TasksService.create() with AI enrichment
   * This creates more detailed and contextualized tasks with proper reward/experience calculation
   */
  async convertWBSToTasksWithAI(
    nodes: WBSNodeDto[],
    projectId: string,
    project: any,
    tasksService: { create: (dto: any) => Promise<any> },
  ): Promise<any[]> {
    const createdTasks: any[] = [];
    const maxMinutesPerMicroTask = this.microTaskHardMaxMinutes;

    // Guardrails: avoid accidental explosions (e.g. thousands of tasks)
    const estimatedTotalTasks = this.estimateMicroTaskCount(nodes);
    const maxTasksToCreate = 1000;
    if (estimatedTotalTasks > maxTasksToCreate) {
      throw new Error(
        `Conversão abortada: a WBS geraria ~${estimatedTotalTasks} micro-tarefas (limite ${maxTasksToCreate}). ` +
          `Reduza a granularidade da WBS ou converta por partes.`,
      );
    }

    // Calcular deadline base (distribuir tarefas ao longo do prazo do projeto)
    const projectDeadline = project.deadline ? new Date(project.deadline) : new Date();
    const today = new Date();
    const daysUntilDeadline = Math.max(7, Math.ceil((projectDeadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));

    let taskCounter = 0;
    let aiLeafCalls = 0;
    const maxAiLeafCalls = 30;

    const traverse = async (nodeList: WBSNodeDto[], parentPath: string = '', level: number = 1) => {
      for (const node of nodeList) {
        const currentPath = parentPath ? `${parentPath} > ${node.name}` : node.name;

        if (!node.children || node.children.length === 0) {
          // Leaf node - criar micro-tarefas
          const totalMinutes = Math.max(0, Math.round((node.estimatedHours || 0) * 60));
          const chunkMinutes: number[] = this.computeChunkMinutes(totalMinutes);
          const chunks = chunkMinutes.length;

          // Prefer AI-generated, non-generic microtasks (batched per leaf).
          // Fallback to heuristic templates if AI fails or if we already hit a safety limit.
          let drafts:
            | Array<{ name: string; description?: string; pomodorosPlanned?: number; priority?: number; difficult?: number }>
            | null = null;

          if (aiLeafCalls < maxAiLeafCalls) {
            try {
              drafts = await this.generateMicroTasksDraftsForLeaf(
                {
                  project,
                  node,
                  currentPath,
                  level,
                },
                chunkMinutes,
              );
              aiLeafCalls++;
            } catch (err: any) {
              console.warn(`⚠️ IA falhou para "${node.name}". Usando fallback. Motivo: ${err?.message || err}`);
              drafts = null;
            }
          }

          if (!drafts || drafts.length !== chunks) {
            drafts = this.fallbackMicroTasksDraftsForLeaf({ node, currentPath, level }, chunkMinutes);
          }

          for (let chunkIndex = 0; chunkIndex < chunks; chunkIndex++) {
            const estimatedMinutes = chunkMinutes[chunkIndex];
            const suffix = chunks > 1 ? ` (${chunkIndex + 1}/${chunks})` : '';

            const draft = drafts[chunkIndex] || ({} as any);
            // Prefer smaller pomodoro counts; let AI choose, otherwise derive from minutes.
            const derivedPomodoros = Math.ceil(estimatedMinutes / 25);
            const pomodorosPlanned = Math.max(
              1,
              Math.min(6, Number(draft.pomodorosPlanned) || derivedPomodoros),
            );

            // Deadline distribuído ao longo do prazo do projeto
            const progressRatio = estimatedTotalTasks <= 1 ? 0 : taskCounter / (estimatedTotalTasks - 1);
            const taskDaysOffset = Math.floor(progressRatio * daysUntilDeadline * 0.8);
            const taskDeadline = new Date(today);
            taskDeadline.setDate(taskDeadline.getDate() + taskDaysOffset);

            // Prioridade baseada na hierarquia WBS (níveis mais altos = mais urgente)
            const basePriority = Math.max(1, Math.min(4, 5 - level));
            const priority = Math.max(1, Math.min(4, Number(draft.priority) || basePriority));

            // Dificuldade: tenta IA, senão estima pela duração/escopo
            const estimatedDifficulty = estimatedMinutes >= 120 ? 3 : estimatedMinutes >= 60 ? 2 : 1;
            const difficult = Math.max(1, Math.min(4, Number(draft.difficult) || estimatedDifficulty));

            // Sempre adiciona contexto e critérios (evita descrições “genéricas”)
            const finalDescription = (draft.description || node.description || '').trim();

            const name = String(draft.name || `${node.name}${suffix}`).trim();

            try {
              const createdTask = await tasksService.create({
                name,
                description: finalDescription,
                project: projectId,
                pomodorosPlanned,
                deadline: taskDeadline,
                priority,
                difficult,
                isConcluded: false,
                late: false,
                recurrency: 'no',
                notification: taskDeadline,
              });

              createdTasks.push(createdTask);
              taskCounter++;
              console.log(
                `  ✅ Task ${taskCounter}: "${createdTask.name}" (${pomodorosPlanned} pomodoros, prioridade ${priority}, dificuldade ${difficult})`,
              );
            } catch (error: any) {
              console.error(`  ❌ Erro ao criar task "${name}":`, error?.message || error);
            }
          }
        } else {
          // Intermediate node - processar filhos
          await traverse(node.children, currentPath, level + 1);
        }
      }
    };

    await traverse(nodes);
    
    console.log(`\n📊 Resumo da conversão:`);
    console.log(`   • Total de tasks: ${createdTasks.length}`);
    console.log(`   • Total de pomodoros: ${createdTasks.reduce((sum, t) => sum + (t.pomodorosPlanned || 0), 0)}`);
    console.log(`   • Horas estimadas: ${(createdTasks.reduce((sum, t) => sum + (t.pomodorosPlanned || 0), 0) * 0.5).toFixed(1)}h`);
    
    return createdTasks;
  }


  private estimateMicroTaskCount(nodes: WBSNodeDto[]): number {
    let count = 0;
    const traverse = (list: WBSNodeDto[]) => {
      for (const node of list) {
        if (!node.children || node.children.length === 0) {
          const totalMinutes = Math.max(0, Math.round((node.estimatedHours || 0) * 60));
          count += this.computeChunkMinutes(totalMinutes).length;
        } else {
          traverse(node.children);
        }
      }
    };
    traverse(nodes);
    return count;
  }

  private computeChunkMinutes(totalMinutes: number): number[] {
    const minutes = Math.max(1, Math.round(totalMinutes));
    const minM = this.microTaskMinMinutes;
    const preferredM = this.microTaskPreferredMinutes;
    const softMaxM = this.microTaskSoftMaxMinutes;
    const hardMaxM = this.microTaskHardMaxMinutes;

    // Minimum chunks needed to respect hard max
    const minChunks = Math.max(1, Math.ceil(minutes / hardMaxM));
    // Prefer smaller chunks (roughly 1–3 pomodoros)
    const preferredChunks = Math.max(1, Math.ceil(minutes / preferredM));
    // Avoid too many chunks per leaf unless required by hard max
    let chunks = Math.min(preferredChunks, this.microTaskMaxPerLeaf);
    chunks = Math.max(chunks, minChunks);

    // Also do not create chunks smaller than the minimum size
    const maxChunksByMin = Math.max(1, Math.floor(minutes / minM));
    chunks = Math.min(chunks, maxChunksByMin);
    chunks = Math.max(chunks, minChunks);

    // Distribute minutes as evenly as possible
    let base = Math.floor(minutes / chunks);
    let remainder = minutes % chunks;

    // If the base is still too large (can happen with caps), increase chunks as needed
    while (base > hardMaxM) {
      chunks++;
      base = Math.floor(minutes / chunks);
      remainder = minutes % chunks;
    }

    const chunkMinutes: number[] = [];
    for (let i = 0; i < chunks; i++) {
      const m = base + (i < remainder ? 1 : 0);
      chunkMinutes.push(m);
    }

    // If chunks are still very large, try to split down towards the soft max.
    // (but never exceed the max-per-leaf cap unless needed)
    const average = minutes / chunkMinutes.length;
    if (average > softMaxM) {
      const targetChunks = Math.min(
        Math.max(minChunks, Math.ceil(minutes / softMaxM)),
        Math.max(minChunks, this.microTaskMaxPerLeaf),
      );
      if (targetChunks > chunkMinutes.length) {
        const newBase = Math.floor(minutes / targetChunks);
        const newRemainder = minutes % targetChunks;
        const next: number[] = [];
        for (let i = 0; i < targetChunks; i++) {
          next.push(newBase + (i < newRemainder ? 1 : 0));
        }
        return next;
      }
    }

    return chunkMinutes;
  }

  private extractJsonArray<T = any>(response: string): T[] {
    if (!response || typeof response !== 'string') {
      throw new Error('Resposta da IA vazia');
    }

    let cleaned = response.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    }

    // Try to isolate the array
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (match) cleaned = match[0];

    const tryParse = (text: string): any => {
      return JSON.parse(text);
    };

    try {
      const parsed = tryParse(cleaned);
      if (!Array.isArray(parsed)) throw new Error('IA não retornou um array JSON');
      return parsed as T[];
    } catch {
      // Common cleanups: remove trailing commas & control chars
      let repaired = cleaned.replace(/,\s*([\}\]])/g, '$1');
      repaired = repaired.replace(/[\x00-\x1F\x7F]/g, ' ');
      const parsed = tryParse(repaired);
      if (!Array.isArray(parsed)) {
        throw new Error('IA não retornou um array JSON');
      }
      return parsed as T[];
    }
  }

  private buildMicroTasksPrompt(params: {
    project: any;
    node: WBSNodeDto;
    currentPath: string;
    level: number;
    chunkMinutes: number[];
  }): string {
    const today = new Date().toISOString().split('T')[0];
    const projectSummary = params.project?.smartObjective?.summary || params.project?.description || '';

    const minutesList = params.chunkMinutes.map((m, i) => `${i + 1}: ${m}min`).join(', ');

    return `Você é um especialista em criar micro-tarefas de execução (25 a 150 minutos) a partir de uma WBS.

Objetivo do projeto (contexto): ${projectSummary || 'Sem resumo'}

Pacote de trabalho WBS (nó folha, regra 8/80):
- Nome: "${params.node.name}"
- Descrição: "${params.node.description || 'Sem descrição'}"
- Caminho WBS: "${params.currentPath}"
- Horas estimadas do pacote: ${params.node.estimatedHours}h

Preciso que você gere EXATAMENTE ${params.chunkMinutes.length} micro-tarefas, uma para cada parte com duração alvo:
${minutesList}

REGRAS IMPORTANTES (para não ficar genérico):
1) Cada micro-tarefa deve ter um RESULTADO verificável (entregável), não apenas "estudar".
2) A descrição deve incluir:
   - Passos objetivos (2-5 itens)
   - Definição de pronto (como saber que terminou)
   - Qualquer recurso/entrada necessário (se aplicável)
3) Evite frases vagas como "pesquisar" ou "estudar" sem critério.
4) Use linguagem direta e prática.
5) Prefira micro-tarefas pequenas (1-3 pomodoros). Use 4-6 apenas se a parte exigir.

FORMATO DE RESPOSTA OBRIGATÓRIO:
Retorne APENAS um array JSON válido (sem markdown). Cada item deve ter EXATAMENTE:
- "name": string
- "description": string
- "pomodorosPlanned": number (1-6)
- "priority": number (1-4)
- "difficult": number (1-4)

Use hoje como ${today}.`;
  }

  private async generateMicroTasksDraftsForLeaf(
    params: { project: any; node: WBSNodeDto; currentPath: string; level: number },
    chunkMinutes: number[],
  ): Promise<Array<{ name: string; description: string; pomodorosPlanned: number; priority: number; difficult: number }>> {
    const prompt = this.buildMicroTasksPrompt({
      ...params,
      chunkMinutes,
    });

    const response = await this.geminiService.generateContent(prompt);
    const drafts = this.extractJsonArray<any>(response);

    if (drafts.length !== chunkMinutes.length) {
      throw new Error(`IA retornou ${drafts.length} itens; esperado ${chunkMinutes.length}`);
    }

    // Normalize
    return drafts.map((d: any, idx: number) => {
      const targetMinutes = chunkMinutes[idx];
      const fallbackPomodoros = Math.max(1, Math.min(6, Math.ceil(targetMinutes / 25)));
      return {
        name: String(d?.name || `${params.node.name} (${idx + 1}/${chunkMinutes.length})`).trim(),
        description: String(d?.description || '').trim(),
        pomodorosPlanned: Math.max(1, Math.min(6, Number(d?.pomodorosPlanned) || fallbackPomodoros)),
        priority: Math.max(1, Math.min(4, Number(d?.priority) || Math.max(1, Math.min(4, 5 - params.level)))),
        difficult: Math.max(1, Math.min(4, Number(d?.difficult) || 2)),
      };
    });
  }

  private fallbackMicroTasksDraftsForLeaf(
    params: { node: WBSNodeDto; currentPath: string; level: number },
    chunkMinutes: number[],
  ): Array<{ name: string; description: string; pomodorosPlanned: number; priority: number; difficult: number }> {
    const nameLower = (params.node.name || '').toLowerCase();
    const isVocab = /vocab|vocabul|hsk/.test(nameLower);
    const isGrammar = /gram[aá]t/.test(nameLower);
    const isListening = /audi|oral|compreens[aã]o/.test(nameLower);
    const isMock = /simulad|prova|revis/.test(nameLower);

    const basePriority = Math.max(1, Math.min(4, 5 - params.level));

    return chunkMinutes.map((minutes, idx) => {
      const pomodorosPlanned = Math.max(1, Math.min(6, Math.ceil(minutes / 25)));
      const difficult = minutes >= 120 ? 3 : minutes >= 60 ? 2 : 1;

      if (isVocab) {
        const words = Math.max(15, Math.round(minutes / 3));
        return {
          name: `Criar e treinar ${words} palavras (recall ativo) (${idx + 1}/${chunkMinutes.length})`,
          description:
            `Passos:\n` +
            `- Selecione ~${words} palavras do conjunto "${params.node.name}"\n` +
            `- Crie flashcards (frente: PT/EN, verso: 汉字 + pinyin + significado + 1 frase exemplo)\n` +
            `- Faça 2 rodadas de recall ativo (sem olhar resposta)\n` +
            `\nDefinição de pronto:\n- ${words} flashcards criados + 1 rodada de acertos registrada (>=70% ideal)\n` +
            `\nDica: foque nas mais difíceis e marque para revisão.`,
          pomodorosPlanned,
          priority: basePriority,
          difficult,
        };
      }

      if (isGrammar) {
        return {
          name: `Aplicar padrão gramatical em exercícios (${idx + 1}/${chunkMinutes.length})`,
          description:
            `Passos:\n` +
            `- Escolha 1-2 tópicos de "${params.node.name}"\n` +
            `- Escreva 8-12 frases originais usando o padrão\n` +
            `- Valide com exemplos de referência e corrija 3 erros comuns\n` +
            `\nDefinição de pronto:\n- 8-12 frases revisadas + lista de 3 erros e correções.`,
          pomodorosPlanned,
          priority: basePriority,
          difficult,
        };
      }

      if (isListening) {
        return {
          name: `Treino de escuta + shadowing (${idx + 1}/${chunkMinutes.length})`,
          description:
            `Passos:\n` +
            `- Escolha 1 áudio curto relacionado a "${params.node.name}"\n` +
            `- Ouça 2x sem legenda e anote palavras-chave\n` +
            `- Ouça 1x com legenda/transcrição e corrija\n` +
            `- Faça 5 minutos de shadowing (repetição em voz alta)\n` +
            `\nDefinição de pronto:\n- Anotações + 5 frases/transcrições curtas validadas.`,
          pomodorosPlanned,
          priority: basePriority,
          difficult,
        };
      }

      if (isMock) {
        return {
          name: `Mini-simulado + análise de erros (${idx + 1}/${chunkMinutes.length})`,
          description:
            `Passos:\n` +
            `- Resolva 10-20 questões relacionadas a "${params.node.name}"\n` +
            `- Registre tempo e acertos\n` +
            `- Analise 3 erros e escreva a regra/razão do erro\n` +
            `\nDefinição de pronto:\n- Resultado do mini-simulado + lista de 3 aprendizados acionáveis.`,
          pomodorosPlanned,
          priority: basePriority,
          difficult,
        };
      }

      // Generic fallback (still non-generic: includes deliverable + DoD)
      return {
        name: `Executar tarefa com entregável (${idx + 1}/${chunkMinutes.length})`,
        description:
          `Passos:\n` +
          `- Defina o resultado específico para "${params.node.name}" (1 frase)\n` +
          `- Faça uma lista de verificação (3-6 itens)\n` +
          `- Execute e registre o que foi feito\n` +
          `\nDefinição de pronto:\n- Checklist concluído + evidência do entregável (texto/link/arquivo).`,
        pomodorosPlanned,
        priority: basePriority,
        difficult,
      };
    });
  }

  /**
   * Save WBS nodes to the database
   */
  async saveWBS(projectId: string, nodes: WBSNodeDto[]): Promise<WBSNodeDocument[]> {
    console.log(`🗑️  Deletando WBS antiga do projeto ${projectId}...`);
    const deleteResult = await this.wbsNodeModel.deleteMany({ projectId }).exec();
    console.log(`✅ ${deleteResult.deletedCount} nós deletados`);

    const savedNodes: WBSNodeDocument[] = [];

    // Limpar _id de todos os nós recursivamente antes de salvar
    const cleanNodeIds = (nodeList: WBSNodeDto[]): WBSNodeDto[] => {
      return nodeList.map(node => {
        const { _id, ...cleanNode } = node as any;
        return {
          ...cleanNode,
          children: node.children && node.children.length > 0 
            ? cleanNodeIds(node.children)
            : []
        };
      });
    };

    const cleanedNodes = cleanNodeIds(nodes);
    console.log(`🧹 IDs antigos removidos, salvando ${cleanedNodes.length} nós raiz`);

    const saveRecursive = async (
      nodeList: WBSNodeDto[],
      parentId: string | null = null,
      level = 1,
    ) => {
      for (const node of nodeList) {
        const doc = new this.wbsNodeModel({
          projectId,
          name: node.name,
          description: node.description || '',
          level: level, // ✅ Usa o level da recursão, não do node
          parentId,
          estimatedHours: node.estimatedHours,
          order: node.order || 0,
          status: 'planned',
        });

        const saved = await doc.save();
        savedNodes.push(saved);
        
        const savedId = String(saved._id);
        console.log(`  ${'  '.repeat(level - 1)}✅ Salvo level ${level}: "${node.name}" (ID: ${savedId}) parentId: ${parentId || 'null'}`);

        if (node.children && node.children.length > 0) {
          await saveRecursive(node.children, savedId, level + 1);
        }
      }
    };

    await saveRecursive(cleanedNodes);
    console.log(`💾 ${savedNodes.length} nós salvos no banco de dados`);
    return savedNodes;
  }

  /**
   * Get WBS for a project, reconstructed as a tree
   */
  async getWBS(projectId: string): Promise<WBSNodeDto[]> {
    const allNodes = await this.wbsNodeModel
      .find({ projectId })
      .sort({ level: 1, order: 1 })
      .exec();

    console.log(`🔍 Encontrados ${allNodes.length} nós no banco para projeto ${projectId}`);

    if (allNodes.length === 0) return [];

    // Build tree from flat list
    const nodeMap = new Map<string, WBSNodeDto & { _id: string }>();
    const roots: (WBSNodeDto & { _id: string })[] = [];

    // Primeiro, adiciona todos os nós ao mapa
    for (const doc of allNodes) {
      const node: WBSNodeDto & { _id: string } = {
        _id: String(doc._id), // ✅ Converte ObjectId para string
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

    // Depois, constrói a hierarquia
    for (const node of nodeMap.values()) {
      if (node.parentId) {
        // Tem pai - adiciona como filho
        const parent = nodeMap.get(node.parentId);
        if (parent) {
          parent.children!.push(node);
        } else {
          console.warn(`⚠️ Nó órfão encontrado: "${node.name}" (level ${node.level}) - parentId não existe: ${node.parentId}`);
          // Nós órfãos são ignorados - não devem aparecer como raiz
        }
      } else {
        // Não tem pai - deve ser raiz (level 1)
        if (node.level === 1) {
          roots.push(node);
        } else {
          console.warn(`⚠️ Nó inválido: "${node.name}" (level ${node.level}) sem parentId - deveria ser level 1`);
        }
      }
    }

    console.log(`🌳 Reconstruídos ${roots.length} nós raiz válidos`);
    return roots;
  }

  /**
   * Parse WBS JSON from Gemini response (handling markdown code blocks)
   */
  private parseWBSFromResponse(response: string): WBSNodeDto[] {
    try {
      let cleanResponse = response.trim();

      // Remove markdown code blocks
      if (cleanResponse.startsWith('```')) {
        cleanResponse = cleanResponse
          .replace(/^```(?:json)?\s*/, '')
          .replace(/```\s*$/, '');
      }

      cleanResponse = cleanResponse.trim();
      
      // Check if response looks truncated (incomplete JSON)
      if (!cleanResponse.endsWith(']') && !cleanResponse.endsWith('}')) {
        console.warn('Response appears truncated:', cleanResponse.substring(cleanResponse.length - 100));
        throw new Error('Resposta da IA foi truncada. Tente simplificar o objetivo SMART ou divida em etapas menores.');
      }

      const parsed = JSON.parse(cleanResponse);

      if (!Array.isArray(parsed)) {
        throw new Error('WBS response is not an array');
      }

      return this.normalizeWBSNodes(parsed, 1);
    } catch (error) {
      console.error('Erro ao fazer parse da WBS:', error);
      console.error('Resposta recebida (primeiros 500 chars):', response.substring(0, 500));
      console.error('Resposta recebida (últimos 200 chars):', response.substring(Math.max(0, response.length - 200)));
      
      if (error.message && error.message.includes('truncada')) {
        throw error;
      }
      throw new Error('Não foi possível processar a WBS gerada pela IA. A resposta pode estar incompleta ou mal formatada.');
    }
  }

  /**
   * Normalize and validate parsed WBS nodes
   */
  private normalizeWBSNodes(nodes: any[], level: number): WBSNodeDto[] {
    return nodes.map((node, index) => ({
      name: node.name || `Entrega ${index + 1}`,
      description: node.description || '',
      level,
      estimatedHours: typeof node.estimatedHours === 'number' ? node.estimatedHours : 0,
      order: node.order || index + 1,
      children: node.children && Array.isArray(node.children)
        ? this.normalizeWBSNodes(node.children, level + 1)
        : [],
    }));
  }
}
