import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Requirement, RequirementDocument } from '../schemas/requirement.schema';
import { GeminiService } from '../gemini.service';
import { TasksService } from '../tasks.service';

export interface RTMValidation {
  isValid: boolean;
  unmappedRequirements: string[];
  risks: string[];
  coverage: number; // Percentual de requisitos mapeados
}

export interface RTMMatrixData {
  requirements: Array<{ id: string; description: string; type: string; status: string }>;
  tasks: Array<{ id: string; name: string }>;
  matrix: Map<string, Set<string>>; // req id -> set of task ids
  validation: RTMValidation;
}

@Injectable()
export class RTMService {
  private readonly logger = new Logger(RTMService.name);

  constructor(
    @InjectModel(Requirement.name)
    private requirementModel: Model<RequirementDocument>,
    private geminiService: GeminiService,
    @Inject(forwardRef(() => TasksService))
    private tasksService: TasksService,
  ) {}

  /**
   * Gera requisitos automaticamente a partir de um Smart Objective usando IA
   */
  async generateRequirements(
    smartObjective: any,
  ): Promise<Array<{ description: string; type: Requirement['type'] }>> {
    this.logger.log(`Gerando requisitos para Smart Objective...`);

    if (!smartObjective) {
      this.logger.warn('Smart Objective vazio, retornando array vazio');
      return [];
    }

    try {
      const smartText = (() => {
        try {
          return JSON.stringify(smartObjective ?? '');
        } catch {
          return String(smartObjective ?? '');
        }
      })().toLowerCase();

      // Heurística simples: quando o objetivo é de aprendizado pessoal, evite linguagem de “sistema”.
      const isPersonalLearningObjective = /\b(aprender|estudar|idioma|língua|lingua|conversação|conversacao|hs?k|certifica|vocabul|gramát|gramat|pronún|pronun|leitura|escrita|ouvir|escutar)\b/i.test(
        smartText,
      );

      const prompt = `Você é um analista de requisitos para um projeto (não necessariamente software).

Tarefa:
1) Leia o Smart Objective abaixo.
2) Gere requisitos DO PROJETO (entregáveis, resultados esperados, critérios de aceitação, atividades e restrições) que possam ser rastreados por tarefas (WBS).

Regras importantes:
- NÃO assuma que existe um sistema/software.
- NÃO use a formulação "O sistema deve...".
- Use linguagem neutra: "O projeto deve...".
${isPersonalLearningObjective ? "- Este Smart Objective parece ser de APRENDIZADO PESSOAL. Então prefira requisitos como: resultados de aprendizagem (o que a pessoa será capaz de fazer), rotina/plano de estudo, métricas de progresso, e restrições (tempo/custo/prazo)." : ""}
- Evite duplicatas. Cada requisito deve ser específico e testável.
- Gere entre 8 e 20 itens.

Smart Objective (campos):
- O: ${smartObjective.objective || ''}
- Específico: ${smartObjective.specific || ''}
- Mensurável: ${smartObjective.measurable || ''}
- Alcançável: ${smartObjective.achievable || ''}
- Relevante: ${smartObjective.relevant || ''}
- Temporal: ${smartObjective.temporal || ''}

Formato de saída:
Retorne SOMENTE um JSON array no formato:
[
  { "description": "...", "type": "functional|non_functional|constraint" }
]
Sem blocos markdown, sem texto extra.`;

      const response = await this.geminiService.generateContent(prompt, {
        responseMimeType: 'application/json',
        temperature: 0.2,
        maxOutputTokens: 2048,
      });

      // Remove markdown code blocks (```json ... ```), se vierem.
      const cleaned = response
        .replace(/```json\n?/gi, '')
        .replace(/```\n?/g, '')
        .trim();

      const tryParseArray = (text: string): unknown[] | null => {
        try {
          const parsed = JSON.parse(text);
          return Array.isArray(parsed) ? parsed : null;
        } catch {
          return null;
        }
      };

      // 1) Tenta parse direto
      let parsedArray = tryParseArray(cleaned);

      // 2) Fallback: extrai o primeiro array JSON do texto
      if (!parsedArray) {
        const match = cleaned.match(/\[[\s\S]*\]/);
        if (match?.[0]) {
          parsedArray = tryParseArray(match[0]);
        }
      }

      if (!parsedArray) {
        this.logger.warn('Resposta da IA não contém um JSON array válido');
        return [];
      }

      const normalizeType = (raw: unknown): Requirement['type'] => {
        const value = String(raw ?? '').trim().toLowerCase();
        if (value === 'functional') return 'functional';
        if (value === 'non_functional' || value === 'non-functional' || value === 'nonfunctional') {
          return 'non_functional';
        }
        if (value === 'constraint') return 'constraint';
        return 'functional';
      };

      const normalized = parsedArray
        .map((item: any) => ({
          description: String(item?.description ?? '').trim(),
          type: normalizeType(item?.type),
        }))
        .filter((r) => r.description.length > 0);

      // Dedup por descrição (case-insensitive)
      const seen = new Set<string>();
      const deduped: Array<{ description: string; type: Requirement['type'] }> = [];
      for (const r of normalized) {
        const key = r.description.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(r);
      }

      this.logger.log(`${deduped.length} requisitos extraídos com sucesso`);
      return deduped;
    } catch (error: any) {
      this.logger.error(`Erro ao gerar requisitos: ${error?.message}`);
      return [];
    }
  }

  /**
   * Mapeia um requisito para uma tarefa (rastreamento)
   */
  async mapRequirementToTask(
    projectId: string,
    requirementId: string,
    taskId: string,
  ): Promise<Requirement | null> {
    this.logger.log(`Mapeando requisito ${requirementId} → tarefa ${taskId}`);

    try {
      const requirement = await this.requirementModel.findByIdAndUpdate(
        requirementId,
        {
          $addToSet: { traceableItems: taskId },
          $set: { status: 'satisfied' },
        },
        { new: true },
      );

      if (!requirement) {
        this.logger.warn(`Requisito ${requirementId} não encontrado`);
        return null;
      }

      this.logger.log(`Requisito ${requirementId} mapeado para tarefa ${taskId}`);
      return requirement;
    } catch (error: any) {
      this.logger.error(`Erro ao mapear requisito: ${error?.message}`);
      return null;
    }
  }

  /**
   * Remove mapeamento de um requisito para uma tarefa
   */
  async unmapRequirementFromTask(
    requirementId: string,
    taskId: string,
  ): Promise<Requirement | null> {
    this.logger.log(`Removendo mapeamento: requisito ${requirementId} ← tarefa ${taskId}`);

    try {
      const requirement = await this.requirementModel.findByIdAndUpdate(
        requirementId,
        { $pull: { traceableItems: taskId } },
        { new: true },
      );

      if (!requirement) {
        this.logger.warn(`Requisito ${requirementId} não encontrado`);
        return null;
      }

      // Se não houver mais tarefas mapeadas, marcar como 'open'
      if (requirement.traceableItems.length === 0) {
        requirement.status = 'open';
        await requirement.save();
      }

      this.logger.log(`Mapeamento removido de requisito ${requirementId}`);
      return requirement;
    } catch (error: any) {
      this.logger.error(`Erro ao remover mapeamento: ${error?.message}`);
      return null;
    }
  }

  /**
   * Valida a RTM do projeto - identifica requisitos não mapeados
   */
  async validateRTM(projectId: string): Promise<RTMValidation> {
    this.logger.log(`Validando RTM para projeto ${projectId}`);

    try {
      const requirements = await this.requirementModel.find({
        projectId,
      });

      const totalRequirements = requirements.length;

      if (totalRequirements === 0) {
        return {
          isValid: false,
          unmappedRequirements: [],
          risks: ['Nenhum requisito definido para o projeto'],
          coverage: 0,
        };
      }

      const unmappedRequirements: string[] = [];
      const risks: string[] = [];

      for (const req of requirements as any[]) {
        if (!req.traceableItems || req.traceableItems.length === 0) {
          unmappedRequirements.push(String(req._id)); // Push ID, not description
        } else if (req.traceableItems.length > 1) {
          risks.push(
            `Requisito "${req.description}" mapeado para ${req.traceableItems.length} tarefas (potencial redundância)`,
          );
        }
      }

      const mappedCount = totalRequirements - unmappedRequirements.length;
      const coverage = (mappedCount / totalRequirements) * 100;

      const isValid = unmappedRequirements.length === 0;

      if (!isValid) {
        risks.push(`${unmappedRequirements.length} requisito(s) não mapeado(s)`);
      }

      this.logger.log(
        `RTM validada: ${coverage.toFixed(1)}% de cobertura, ${unmappedRequirements.length} não mapeado(s)`,
      );

      return {
        isValid,
        unmappedRequirements,
        risks,
        coverage: Math.round(coverage * 10) / 10,
      };
    } catch (error: any) {
      this.logger.error(`Erro ao validar RTM: ${error?.message}`);
      return {
        isValid: false,
        unmappedRequirements: [],
        risks: [`Erro ao validar RTM: ${error?.message}`],
        coverage: 0,
      };
    }
  }

  /**
   * Retorna a matriz de rastreabilidade completa (requisitos × tarefas)
   */
  async getRTMMatrix(
    projectId: string,
    tasks: any[], // Tarefas do projeto (passadas pelo controller)
  ): Promise<RTMMatrixData> {
    this.logger.log(`Gerando matriz RTM para projeto ${projectId}`);

    try {
      const requirements = await this.requirementModel.find({
        projectId,
      });

      const matrix = new Map<string, Set<string>>();
      for (const req of requirements as any[]) {
        const reqId = String(req._id ?? req.id ?? '');
        const traceable = Array.isArray(req.traceableItems) ? req.traceableItems : [];
        matrix.set(reqId, new Set(traceable.map(String)));
      }

      const validation = await this.validateRTM(projectId);

      const requirementsData = (requirements as any[]).map((req) => ({
        id: String(req._id ?? req.id ?? ''),
        description: req.description,
        type: req.type,
        status: req.status,
      }));

      const tasksData = (tasks as any[]).map((task) => ({
        id: String(task._id ?? task.id ?? ''),
        name: task.title || task.name || 'Task',
      }));

      this.logger.log(
        `Matriz RTM gerada: ${requirements.length} requisitos × ${tasks.length} tarefas`,
      );

      return {
        requirements: requirementsData,
        tasks: tasksData,
        matrix,
        validation,
      };
    } catch (error: any) {
      this.logger.error(`Erro ao gerar matriz RTM: ${error?.message}`);
      return {
        requirements: [],
        tasks: [],
        matrix: new Map(),
        validation: {
          isValid: false,
          unmappedRequirements: [],
          risks: [`Erro ao gerar matriz: ${error?.message}`],
          coverage: 0,
        },
      };
    }
  }

  /**
   * Salva requisitos para um projeto (bulk insert)
   */
  async saveRequirements(
    projectId: string,
    requirementsData: Array<{ description: string; type?: string; source?: string }>,
  ): Promise<RequirementDocument[]> {
    this.logger.log(`Salvando ${requirementsData.length} requisitos para projeto ${projectId}`);

    try {
      const requirements = await this.requirementModel.insertMany(
        requirementsData.map((req) => ({
          projectId,
          description: req.description,
          type: req.type || 'functional',
          source: req.source || 'manual',
          traceableItems: [],
          status: 'open',
        })),
      );

      this.logger.log(`${requirements.length} requisitos salvos com sucesso`);
      return requirements as RequirementDocument[];
    } catch (error: any) {
      this.logger.error(`Erro ao salvar requisitos: ${error?.message}`);
      return [];
    }
  }

  /**
   * Obtém todos os requisitos de um projeto
   */
  async getRequirements(projectId: string): Promise<RequirementDocument[]> {
    return this.requirementModel.find({ projectId });
  }

  /**
   * Deleta um requisito
   */
  async deleteRequirement(requirementId: string): Promise<boolean> {
    try {
      const result = await this.requirementModel.findByIdAndDelete(requirementId);
      return !!result;
    } catch (error: any) {
      this.logger.error(`Erro ao deletar requisito: ${error?.message}`);
      return false;
    }
  }

  /**
   * Deleta todos os requisitos de um projeto
   */
  async deleteAllRequirements(projectId: string): Promise<number> {
    try {
      const result = await this.requirementModel.deleteMany({ projectId });
      this.logger.log(
        `[delete-all-req] projectId=${projectId} ${result.deletedCount} requisitos deletados`,
      );
      return result.deletedCount || 0;
    } catch (error: any) {
      this.logger.error(`Erro ao deletar todos os requisitos: ${error?.message}`);
      return 0;
    }
  }

  /**
   * Auto-mapeia requisitos para tarefas usando IA + cria requisitos para tarefas órfãs
   * Atinge 100% de cobertura de tarefas
   */
  async autoMapRequirementsToTasks(
    projectId: string,
    tasks: any[],
  ): Promise<{
    mappedCount: number;
    createdRequirementsCount: number;
    coverage: number;
    validation: RTMValidation;
    message: string;
  }> {
    const startedAt = Date.now();
    this.logger.log(
      `[auto-map] projectId=${projectId} iniciando mapeamento automático de ${tasks.length} tarefas`,
    );

    try {
      // 1. Buscar requisitos atuais
      const requirements = await this.requirementModel.find({ projectId });
      if (requirements.length === 0) {
        return {
          mappedCount: 0,
          createdRequirementsCount: 0,
          coverage: 0,
          validation: {
            isValid: false,
            coverage: 0,
            unmappedRequirements: [],
            risks: ['Nenhum requisito encontrado. Gere requisitos primeiro.'],
          },
          message: 'Falha: nenhum requisito disponível para mapear.',
        };
      }

      // 1.5 Pré-processamento: identificar tarefas JÁ mapeadas para evitar redundância
      const alreadyMappedTaskIds = new Set<string>();
      for (const req of requirements) {
        const traceable = Array.isArray(req.traceableItems) ? req.traceableItems : [];
        for (const taskId of traceable) {
          alreadyMappedTaskIds.add(String(taskId));
        }
      }

      const tasksToMap = tasks.filter(
        (t) => !alreadyMappedTaskIds.has(String(t._id || t.id)),
      );

      this.logger.log(
        `[auto-map] pré-processamento: ${alreadyMappedTaskIds.size} tarefas já mapeadas, ${tasksToMap.length} tarefas para processar`,
      );

      if (tasksToMap.length === 0) {
        const validation = await this.validateRTM(projectId);
        return {
          mappedCount: 0,
          createdRequirementsCount: 0,
          coverage: validation.coverage,
          validation,
          message: 'Todas as tarefas já estão mapeadas!',
        };
      }

      // 2. Processar tarefas em lotes (max 10 por vez para não sobrecarregar Gemini)
      const batchSize = 10;
      const batches: any[][] = [];
      for (let i = 0; i < tasksToMap.length; i += batchSize) {
        batches.push(tasksToMap.slice(i, i + batchSize));
      }

      const mappings: Record<string, string[]> = {}; // reqId -> [taskIds]
      const orphanTasks: any[] = []; // Tarefas que não encaixam em nenhum requisito

      for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
        const batch = batches[batchIdx];
        this.logger.log(
          `[auto-map] processando lote ${batchIdx + 1}/${batches.length} (${batch.length} tarefas)`,
        );

        // Preparar prompt para Gemini: mapear tarefas para requisitos
        const tasksDesc = batch
          .map((t) => `- "${t.title || t.name}" (ID: ${t._id || t.id})`)
          .join('\n');

        const requirementsDesc = requirements
          .map((r) => `[ID: ${r._id}] ${r.description} (tipo: ${r.type})`)
          .join('\n');

        const prompt = `Você é um analista de rastreabilidade de requisitos.

Tarefa: Mapear cada uma das tarefas abaixo para o requisito mais relevante.
- Sempre prefira mapear a um requisito existente.
- Marque como "ORPHAN" APENAS se a tarefa for completamente desconectada (ex: não relacionada ao objetivo).
- Se houver dúvida, mapear a um requisito aproximado é melhor que marcar como ORPHAN.

REQUISITOS DISPONÍVEIS:
${requirementsDesc}

TAREFAS PARA MAPEAR:
${tasksDesc}

Retorne um JSON array com o mapeamento:
[
  { "taskId": "...", "requirementId": "...", "confidence": 0.7 }
]

Se nenhum requisito encaixa (E apenas nesse caso), use "ORPHAN".
Sem markdown, sem explicações extras, apenas JSON.`;

        try {
          const response = await this.geminiService.generateContent(prompt, {
            responseMimeType: 'application/json',
            temperature: 0.3,
            maxOutputTokens: 2048,
          });

          const cleaned = response
            .replace(/```json\n?/gi, '')
            .replace(/```\n?/g, '')
            .trim();

          const mappingArray = JSON.parse(cleaned);

          for (const mapping of mappingArray) {
            if (mapping.requirementId === 'ORPHAN') {
              orphanTasks.push(batch.find((t) => String(t._id || t.id) === mapping.taskId));
            } else {
              const reqId = String(mapping.requirementId);
              if (!mappings[reqId]) mappings[reqId] = [];
              mappings[reqId].push(String(mapping.taskId));
            }
          }
        } catch (parseError) {
          this.logger.warn(
            `[auto-map] erro ao parsear resposta do Gemini no lote ${batchIdx + 1}, usando fallback`,
          );
          // Fallback: mapear para o primeiro requisito
          for (const task of batch) {
            const firstReqId = String(requirements[0]._id);
            if (!mappings[firstReqId]) mappings[firstReqId] = [];
            mappings[firstReqId].push(String(task._id || task.id));
          }
        }
      }

      // 3. Para tarefas órfãs, criar novos requisitos (agrupadas por similaridade)
      let createdRequirementsCount = 0;
      if (orphanTasks.length > 0) {
        this.logger.log(
          `[auto-map] criando requisitos para ${orphanTasks.length} tarefas órfãs`,
        );

        // Agrupar tarefas órfãs (max 5 tarefas por requisito)
        const groupSize = Math.ceil(orphanTasks.length / 3); // Cria ~3 requisitos
        const orphanGroups: any[][] = [];
        for (let i = 0; i < orphanTasks.length; i += groupSize) {
          orphanGroups.push(orphanTasks.slice(i, i + groupSize));
        }

        // Criar um requisito para cada grupo
        for (const group of orphanGroups) {
          // Usar Gemini para gerar uma descrição inteligente para o grupo de tarefas órfãs
          const taskNames = group.map((t) => t.title || t.name).join(' | ');
          const descriptionPrompt = `Analise este conjunto de tarefas e crie um requisito único que as agrupem semanticamente:

TAREFAS:
${group.map((t) => `- ${t.title || t.name}`).join('\n')}

Retorne um JSON:
{
  "requirement": "uma descrição breve de requisito que capture o padrão/objetivo comum dessas tarefas"
}

Sem markdown, apenas JSON.`;

          let description = `Agrupar: ${taskNames.substring(0, 100)}...`;

          try {
            const descResponse = await this.geminiService.generateContent(descriptionPrompt, {
              responseMimeType: 'application/json',
              temperature: 0.3,
              maxOutputTokens: 256,
            });

            const cleaned = descResponse
              .replace(/```json\n?/gi, '')
              .replace(/```\n?/g, '')
              .trim();

            const parsed = JSON.parse(cleaned);
            if (parsed.requirement && parsed.requirement.length > 5) {
              description = parsed.requirement;
            }
          } catch (descError) {
            this.logger.warn(
              `[auto-map] erro ao gerar descrição: ${(descError as any)?.message}, usando fallback`,
            );
          }

          const newReq = await this.requirementModel.create({
            projectId,
            description,
            type: 'functional',
            source: 'auto_mapped_from_orphan_tasks',
            traceableItems: group.map((t) => String(t._id || t.id)),
            status: 'satisfied',
          });

          createdRequirementsCount++;
          this.logger.log(
            `[auto-map] requisito criado: ${newReq._id} para ${group.length} tarefas`,
          );
        }
      }

      // 4. Atualizar mapeamentos dos requisitos existentes
      let mappedCount = 0;
      for (const [reqId, taskIds] of Object.entries(mappings)) {
        if (taskIds.length > 0) {
          try {
            await this.requirementModel.updateOne(
              { _id: new Types.ObjectId(reqId) },
              {
                $addToSet: { traceableItems: { $each: taskIds } },
                status: 'satisfied',
              },
            );
            mappedCount += taskIds.length;
          } catch (updateError: any) {
            this.logger.warn(
              `[auto-map] erro ao atualizar requisito ${reqId}: ${updateError?.message}`,
            );
          }
        }
      }

      // 5. Validar RTM final
      const validation = await this.validateRTM(projectId);

      const elapsed = Date.now() - startedAt;
      this.logger.log(
        `[auto-map] projectId=${projectId} completo: ${mappedCount} tarefas mapeadas, ${createdRequirementsCount} requisitos criados, ${validation.coverage}% cobertura - ${elapsed}ms`,
      );

      return {
        mappedCount,
        createdRequirementsCount,
        coverage: validation.coverage,
        validation,
        message: `Mapeamento automático concluído: ${mappedCount} tarefas mapeadas + ${createdRequirementsCount} requisitos criados. Cobertura: ${validation.coverage}%`,
      };
    } catch (error: any) {
      this.logger.error(`[auto-map] projectId=${projectId} erro: ${error?.message}`);
      return {
        mappedCount: 0,
        createdRequirementsCount: 0,
        coverage: 0,
        validation: {
          isValid: false,
          coverage: 0,
          unmappedRequirements: [],
          risks: [`Erro ao mapear: ${error?.message}`],
        },
        message: `Erro: ${error?.message}`,
      };
    }
  }

  /**
   * Gera tarefas para requisitos que não possuem mapeamento (órfãos)
   */
  async generateTasksForUnmappedRequirements(
    projectId: string,
  ): Promise<{
    createdTasksCount: number;
    coverage: number;
    validation: RTMValidation;
    message: string;
  }> {
    const startedAt = Date.now();
    this.logger.log(`[gen-tasks] projectId=${projectId} gerando tarefas para requisitos órfãos`);

    try {
      // 1. Validar RTM para identificar requisitos órfãos
      const validation = await this.validateRTM(projectId);

      if (validation.unmappedRequirements.length === 0) {
        return {
          createdTasksCount: 0,
          coverage: validation.coverage,
          validation,
          message: 'Todos os requisitos já possuem tarefas mapeadas!',
        };
      }

      // 2. Buscar requisitos órfãos
      const orphanRequirementIds = validation.unmappedRequirements;
      const requirements = await this.requirementModel.find({
        _id: { $in: orphanRequirementIds },
      });

      this.logger.log(
        `[gen-tasks] encontrados ${requirements.length} requisitos órfãos para gerar tarefas`,
      );

      let createdTasksCount = 0;

      // 3. Para cada requisito órfão, gerar 1-2 tarefas práticas
      for (const req of requirements) {
        const prompt = `Você é um especialista em planejamento de projetos (WBS).

Requisito do projeto que precisa de tarefas:
"${req.description}"

Tarefa: Gere 1-2 tarefas CONCRETAS e PRÁTICAS que atendam este requisito. Cada tarefa deve ser uma atividade específica/acionável que a pessoa possa executar.

Retorne um JSON array:
[
  { "title": "Breve descrição da tarefa (máx 100 chars)", "description": "Descrição mais detalhada" }
]

Sem markdown, apenas JSON.`;

        try {
          const response = await this.geminiService.generateContent(prompt, {
            responseMimeType: 'application/json',
            temperature: 0.4,
            maxOutputTokens: 512,
          });

          const cleaned = response
            .replace(/```json\n?/gi, '')
            .replace(/```\n?/g, '')
            .trim();

          const tasksToCreate = JSON.parse(cleaned);

          if (!Array.isArray(tasksToCreate)) {
            this.logger.warn(
              `[gen-tasks] resposta inválida do Gemini para requisito ${req._id}`,
            );
            continue;
          }

          // 4. Criar as tarefas no banco
          const taskIds: string[] = [];
          for (const taskData of tasksToCreate) {
            try {
              const createDto: any = {
                name: String(taskData.title || 'Nova Tarefa'),
                description: String(taskData.description || ''),
                project: projectId,
                pomodorosPlanned: 3,
                deadline: new Date(),
                isConcluded: false,
                late: false,
                recurrency: 'none',
                notification: new Date(),
              };

              const newTask = await this.tasksService.create(createDto);

              taskIds.push(String(newTask._id));
              createdTasksCount++;
              this.logger.log(
                `[gen-tasks] tarefa criada: ${newTask._id} para requisito ${req._id}`,
              );
            } catch (taskError: any) {
              this.logger.warn(
                `[gen-tasks] erro ao criar tarefa: ${taskError?.message}`,
              );
            }
          }

          // 5. Mapear as novas tarefas ao requisito
          if (taskIds.length > 0) {
            await this.requirementModel.updateOne(
              { _id: new Types.ObjectId(String(req._id)) },
              {
                $addToSet: { traceableItems: { $each: taskIds } },
                status: 'satisfied',
              },
            );

            this.logger.log(
              `[gen-tasks] ${taskIds.length} tarefas mapeadas ao requisito ${req._id}`,
            );
          }
        } catch (genError: any) {
          this.logger.warn(
            `[gen-tasks] erro ao gerar tarefas para requisito ${req._id}: ${genError?.message}`,
          );
        }
      }

      // 6. Revalidar RTM final
      const finalValidation = await this.validateRTM(projectId);

      const elapsed = Date.now() - startedAt;
      this.logger.log(
        `[gen-tasks] projectId=${projectId} concluído: ${createdTasksCount} tarefas criadas, ${finalValidation.coverage}% cobertura final - ${elapsed}ms`,
      );

      return {
        createdTasksCount,
        coverage: finalValidation.coverage,
        validation: finalValidation,
        message: `${createdTasksCount} tarefas geradas para requisitos órfãos. Cobertura final: ${finalValidation.coverage}%`,
      };
    } catch (error: any) {
      this.logger.error(`[gen-tasks] projectId=${projectId} erro: ${error?.message}`);
      return {
        createdTasksCount: 0,
        coverage: 0,
        validation: {
          isValid: false,
          coverage: 0,
          unmappedRequirements: [],
          risks: [`Erro ao gerar tarefas: ${error?.message}`],
        },
        message: `Erro: ${error?.message}`,
      };
    }
  }
}
