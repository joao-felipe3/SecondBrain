import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
	Requirement,
	RequirementDocument,
	RequirementType,
	JourneyKind,
} from '../../schemas/requirement.schema';
import { GeminiService } from '../../../ai/gemini.service';
import { TasksService } from '../../tasks.service';

export interface RTMValidation {
	isValid: boolean;
	unmappedRequirements: string[];
	risks: string[];
	coverage: number;
}

export interface RTMMatrixData {
	requirements: Array<{
		id: string;
		description: string;
		type: string;
		status: string;
		kind: JourneyKind;
		parentItemId?: string;
		hierarchyLevel: number;
	}>;
	tasks: Array<{
		id: string;
		name: string;
		wbsNodeId?: string;
		wbsNodeName: string;
	}>;
	matrix: Map<string, Set<string>>;
	validation: RTMValidation;
}

type JourneyDraft = {
	ref: string;
	parentRef?: string;
	kind: JourneyKind;
	description: string;
	type?: RequirementType;
};

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

	private normalizeKind(value: unknown): JourneyKind { const raw = String(value ?? '').trim().toLowerCase(); if (raw === 'objective' || raw === 'objetivo') return 'objective'; if (raw === 'habit' || raw === 'habito' || raw === 'hábito') return 'habit'; if (raw === 'stage' || raw === 'etapa') return 'stage'; return 'action'; }
	private normalizeType(value: unknown, fallbackKind?: JourneyKind): RequirementType { const raw = String(value ?? '').trim().toLowerCase(); if (raw === 'functional') return 'functional'; if (raw === 'non_functional' || raw === 'non-functional' || raw === 'nonfunctional') { return 'non_functional'; } if (raw === 'constraint') return 'constraint'; if (raw === 'objective' || raw === 'objetivo') return 'objective'; if (raw === 'habit' || raw === 'habito' || raw === 'hábito') return 'habit'; if (raw === 'stage' || raw === 'etapa') return 'stage'; if (raw === 'action' || raw === 'acao' || raw === 'ação') return 'action'; if (fallbackKind) return fallbackKind; return 'action'; }
	private levelForKind(kind: JourneyKind): number { if (kind === 'objective') return 0; if (kind === 'habit') return 1; if (kind === 'stage') return 2; return 3; }
	private getLinkedActions(requirement: any): string[] { const modern = Array.isArray(requirement?.traceableActionItems) ? requirement.traceableActionItems.map(String) : []; if (modern.length > 0) return modern; const legacy = Array.isArray(requirement?.traceableItems) ? requirement?.traceableItems.map(String) : []; return legacy; }
	private parseJsonArray(rawResponse: string): any[] | null { const cleaned = String(rawResponse || '').replace(/```json\n?/gi, '').replace(/```\n?/g, '').trim(); const tryParse = (text: string) => { try { const parsed = JSON.parse(text); return Array.isArray(parsed) ? parsed : null; } catch { return null; } }; const direct = tryParse(cleaned); if (direct) return direct; const match = cleaned.match(/\[[\s\S]*\]/); if (match?.[0]) { return tryParse(match[0]); } return null; }

	async generateRequirements(smartObjective: any): Promise<Array<{ description: string; type: RequirementType; kind?: JourneyKind; ref?: string; parentRef?: string; }>> {
		this.logger.log('Gerando itens de jornada para Smart Objective...');
		if (!smartObjective) { this.logger.warn('Smart Objective vazio, retornando array vazio'); return []; }

		try {
			const prompt = `Você é um planejador de desenvolvimento pessoal.

Objetivo:
Gerar uma estrutura rastreável no formato objetivo -> hábito -> etapa -> ação.

Regras:
- Foque em projetos pessoais (aprendizado, rotina, hábitos, produtividade).
- Gere uma árvore prática e rastreável.
- Retorne entre 10 e 24 itens no total.
- Cada item deve ter:
	- ref: identificador curto único (ex: O1, H1, E1, A1)
	- parentRef: referência do pai (null apenas para objective)
	- kind: objective | habit | stage | action
	- description: descrição clara, específica e mensurável
- Ações devem ser executáveis (o que fazer de fato).
- Sem markdown.

Smart Objective:
- O: ${smartObjective.objective || ''}
- Específico: ${smartObjective.specific || ''}
- Mensurável: ${smartObjective.measurable || ''}
- Alcançável: ${smartObjective.achievable || ''}
- Relevante: ${smartObjective.relevant || ''}
- Temporal: ${smartObjective.temporal || ''}

Retorne SOMENTE um JSON array:
[
	{ "ref": "O1", "parentRef": null, "kind": "objective", "description": "..." },
	{ "ref": "H1", "parentRef": "O1", "kind": "habit", "description": "..." },
	{ "ref": "E1", "parentRef": "H1", "kind": "stage", "description": "..." },
	{ "ref": "A1", "parentRef": "E1", "kind": "action", "description": "..." }
]`;

			const response = await this.geminiService.generateContent(prompt, {
				responseMimeType: 'application/json',
				temperature: 0.2,
				maxOutputTokens: 3072,
			});

			const parsed = this.parseJsonArray(response);
			if (!parsed) {
				this.logger.warn('Resposta da IA não contém um JSON array válido');
				return [];
			}

			const normalized: JourneyDraft[] = parsed
				.map((item: any, index: number) => {
					const kind = this.normalizeKind(item?.kind);
					const defaultRefPrefix =
						kind === 'objective' ? 'O' : kind === 'habit' ? 'H' : kind === 'stage' ? 'E' : 'A';
					const ref = String(item?.ref ?? `${defaultRefPrefix}${index + 1}`).trim();
					const parentRef = item?.parentRef == null ? undefined : String(item.parentRef).trim();
					const description = String(item?.description ?? '').trim();

					return {
						ref,
						parentRef,
						kind,
						description,
						type: this.normalizeType(item?.type, kind),
					};
				})
				.filter((item) => item.description.length > 0);

			const deduped: JourneyDraft[] = [];
			const seen = new Set<string>();
			for (const item of normalized) {
				const key = `${item.kind}::${item.description.toLowerCase()}`;
				if (seen.has(key)) continue;
				seen.add(key);
				deduped.push(item);
			}

			this.logger.log(`${deduped.length} itens de jornada extraídos com sucesso`);
			return deduped.map((item) => ({
				description: item.description,
				type: item.type || item.kind,
				kind: item.kind,
				ref: item.ref,
				parentRef: item.parentRef,
			}));
		} catch (error: any) {
			this.logger.error(`Erro ao gerar itens de jornada: ${error?.message}`);
			return [];
		}
	}

	async mapRequirementToTask(projectId: string, requirementId: string, taskId: string): Promise<Requirement | null> {
		this.logger.log(`Mapeando item ${requirementId} -> tarefa ${taskId}`);
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
				this.logger.warn(`Item ${requirementId} não encontrado`);
				return null;
			}

			this.logger.log(`Item ${requirementId} mapeado para tarefa ${taskId}`);
			return requirement;
		} catch (error: any) {
			this.logger.error(`Erro ao mapear item: ${error?.message}`);
			return null;
		}
	}

	async unmapRequirementFromTask(requirementId: string, taskId: string): Promise<Requirement | null> {
		this.logger.log(`Removendo mapeamento: item ${requirementId} <- tarefa ${taskId}`);
		try {
			const requirement = await this.requirementModel.findByIdAndUpdate(
				requirementId,
				{
					$pull: {
						traceableActionItems: taskId,
						traceableItems: taskId,
					},
				},
				{ new: true },
			);

			if (!requirement) {
				this.logger.warn(`Item ${requirementId} não encontrado`);
				return null;
			}

			if (this.getLinkedActions(requirement).length === 0) {
				requirement.status = 'open';
				await requirement.save();
			}

			this.logger.log(`Mapeamento removido do item ${requirementId}`);
			return requirement;
		} catch (error: any) {
			this.logger.error(`Erro ao remover mapeamento: ${error?.message}`);
			return null;
		}
	}

	async validateRTM(projectId: string): Promise<RTMValidation> {
		this.logger.log(`Validando jornada para projeto ${projectId}`);
		try {
			const requirements = await this.requirementModel.find({ projectId });
			const total = requirements.length;

			if (total === 0) {
				return {
					isValid: false,
					unmappedRequirements: [],
					risks: ['Nenhum item de jornada definido para o projeto'],
					coverage: 0,
				};
			}

			const byId = new Map<string, any>();
			const childrenByParent = new Map<string, any[]>();
			const unmappedRequirements: string[] = []; const risks: string[] = [];

			for (const req of requirements as any[]) {
				const id = String(req._id ?? req.id ?? '');
				byId.set(id, req);
			}

			for (const req of requirements as any[]) {
				const id = String(req._id ?? req.id ?? '');
				const parentId = req.parentItemId ? String(req.parentItemId) : undefined;
				if (!parentId) continue;
				const list = childrenByParent.get(parentId) || [];
				list.push(req);
				childrenByParent.set(parentId, list);

				if (!byId.has(parentId)) {
					risks.push(`Item ${id} aponta para pai inexistente (${parentId})`);
				}
			}

			const hasChildOfKind = (id: string, kind: JourneyKind) => {
				const children = childrenByParent.get(id) || [];
				return children.some((child) => this.normalizeKind(child.kind || child.type) === kind);
			};

			for (const req of requirements as any[]) {
				const id = String(req._id ?? req.id ?? '');
				const description = String(req.description || 'Item');
				const kind = this.normalizeKind(req.kind || req.type);
				const linkedActions = this.getLinkedActions(req);

				if (kind === 'objective') {
					if (!hasChildOfKind(id, 'habit')) {
						unmappedRequirements.push(id);
						risks.push(`Objetivo sem hábito vinculado: "${description}"`);
					}
					continue;
				}

				if (kind === 'habit') {
					if (!hasChildOfKind(id, 'stage')) {
						unmappedRequirements.push(id);
						risks.push(`Hábito sem etapa vinculada: "${description}"`);
					}
					continue;
				}

				if (kind === 'stage') {
					if (!hasChildOfKind(id, 'action')) {
						unmappedRequirements.push(id);
						risks.push(`Etapa sem ação vinculada: "${description}"`);
					}
					continue;
				}

				if (linkedActions.length === 0) {
					unmappedRequirements.push(id);
					risks.push(`Ação sem tarefa rastreada: "${description}"`);
				} else if (linkedActions.length > 3) {
					risks.push(
						`Ação "${description}" vinculada a ${linkedActions.length} tarefas (avaliar granularidade)`,
					);
				}
			}

			const mapped = total - unmappedRequirements.length;
			const coverage = (mapped / total) * 100;
			const isValid = unmappedRequirements.length === 0;

			if (!isValid) {
				risks.push(`${unmappedRequirements.length} item(ns) da jornada sem rastreabilidade completa`);
			}

			return {
				isValid,
				unmappedRequirements,
				risks,
				coverage: Math.round(coverage * 10) / 10,
			};
		} catch (error: any) {
			this.logger.error(`Erro ao validar jornada: ${error?.message}`);
			return {
				isValid: false,
				unmappedRequirements: [],
				risks: [`Erro ao validar jornada: ${error?.message}`],
				coverage: 0,
			};
		}
	}

	async getRTMMatrix(projectId: string, tasks: any[]): Promise<RTMMatrixData> {
		this.logger.log(`Gerando matriz de jornada para projeto ${projectId}`);
		try {
			const requirements = await this.requirementModel
				.find({ projectId })
				.sort({ hierarchyLevel: 1, createdAt: 1, _id: 1 });

			const matrix = new Map<string, Set<string>>();
			for (const req of requirements as any[]) {
				const reqId = String(req._id ?? req.id ?? '');
				const traceable = this.getLinkedActions(req);
				matrix.set(reqId, new Set(traceable));
			}

			const validation = await this.validateRTM(projectId);

			const requirementsData = (requirements as any[]).map((req) => {
				const kind = this.normalizeKind(req.kind || req.type);
				return {
					id: String(req._id ?? req.id ?? ''),
					description: req.description,
					type: req.type || kind,
					status: req.status,
					kind,
					parentItemId: req.parentItemId ? String(req.parentItemId) : undefined,
					hierarchyLevel: Number(req.hierarchyLevel ?? this.levelForKind(kind)),
				};
			});

			const wbsNameMap = new Map<string, string>();
			const tasksData = tasks.map((task) => {
				const wbsNodeId = task.parentWbsNodeId ? String(task.parentWbsNodeId) : undefined;

				let wbsNodeName = 'Sem WBS';
				if (wbsNodeId) {
					if (wbsNameMap.has(wbsNodeId)) {
						wbsNodeName = wbsNameMap.get(wbsNodeId) || 'Sem WBS';
					} else {
						if (task.wbsPath) {
							const pathParts = String(task.wbsPath)
								.split('>')
								.map((p: string) => p.trim())
								.filter(Boolean);
							wbsNodeName = pathParts[pathParts.length - 1] || wbsNodeId.slice(0, 12);
						} else {
							wbsNodeName = `WBS: ${wbsNodeId.slice(0, 12)}`;
						}
						wbsNameMap.set(wbsNodeId, wbsNodeName);
					}
				}

				return {
					id: String(task._id ?? task.id ?? ''),
					name: task.title || task.name || 'Task',
					wbsNodeId,
					wbsNodeName,
				};
			});

			return {
				requirements: requirementsData,
				tasks: tasksData,
				matrix,
				validation,
			};
		} catch (error: any) {
			this.logger.error(`Erro ao gerar matriz de jornada: ${error?.message}`);
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

	async saveRequirements(
		projectId: string,
		requirementsData: Array<{
			description: string;
			type?: string;
			source?: string;
			kind?: string;
			ref?: string;
			parentRef?: string;
		}>,
	): Promise<RequirementDocument[]> {
		this.logger.log(`Salvando ${requirementsData.length} itens de jornada para projeto ${projectId}`);

		try {
			const refToId = new Map<string, string>();
			const insertedIds = new Set<string>();
			const prepared = requirementsData
				.map((item, index) => {
					const kind = this.normalizeKind(item.kind || item.type);
					const type = this.normalizeType(item.type, kind);
					const ref = String(item.ref || `${kind.slice(0, 1).toUpperCase()}${index + 1}`).trim();
					const parentRef = item.parentRef ? String(item.parentRef).trim() : undefined;
					const description = String(item.description || '').trim();
					return {
						ref,
						parentRef,
						description,
						kind,
						type,
						hierarchyLevel: this.levelForKind(kind),
						source: item.source || 'manual',
					};
				})
				.filter((item) => item.description.length > 0);

			const orderedByLevel = prepared.sort((a, b) => a.hierarchyLevel - b.hierarchyLevel);
			const inserted: RequirementDocument[] = [];

			for (const item of orderedByLevel) {
				const dedupKey = `${item.kind}::${item.description.toLowerCase()}`;
				if (insertedIds.has(dedupKey)) continue;

				let parentItemId: string | undefined;
				if (item.parentRef && refToId.has(item.parentRef)) {
					parentItemId = refToId.get(item.parentRef);
				}

				const created = await this.requirementModel.create({
					projectId,
					description: item.description,
					title: item.description,
					type: item.type,
					kind: item.kind,
					hierarchyLevel: item.hierarchyLevel,
					parentItemId,
					source: item.source,
					traceableItems: [],
					traceableActionItems: [],
					status: 'open',
				});

				inserted.push(created as RequirementDocument);
				refToId.set(item.ref, String((created as any)._id));
				insertedIds.add(dedupKey);
			}

			this.logger.log(`${inserted.length} itens de jornada salvos com sucesso`);
			return inserted;
		} catch (error: any) {
			this.logger.error(`Erro ao salvar itens de jornada: ${error?.message}`);
			return [];
		}
	}

	async getRequirements(projectId: string): Promise<RequirementDocument[]> {
		return this.requirementModel.find({ projectId }).sort({ hierarchyLevel: 1, createdAt: 1, _id: 1 });
	}

	async deleteRequirement(requirementId: string): Promise<boolean> {
		try {
			const result = await this.requirementModel.findByIdAndDelete(requirementId);
			return !!result;
		} catch (error: any) {
			this.logger.error(`Erro ao deletar item de jornada: ${error?.message}`);
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
		} catch (error: any) {
			this.logger.error(`Erro ao deletar todos os itens de jornada: ${error?.message}`);
			return 0;
		}
	}

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
			`[auto-map] projectId=${projectId} iniciando auto-vinculo de ${tasks.length} tarefas`,
		);

		try {
			const allItems = await this.requirementModel.find({ projectId });
			const actionItems = allItems.filter(
				(item: any) => this.normalizeKind(item.kind || item.type) === 'action',
			);

			if (allItems.length === 0) {
				return {
					mappedCount: 0,
					createdRequirementsCount: 0,
					coverage: 0,
					validation: {
						isValid: false,
						coverage: 0,
						unmappedRequirements: [],
						risks: ['Nenhum item de jornada encontrado. Gere a estrutura primeiro.'],
					},
					message: 'Falha: nenhum item de jornada disponível para mapear.',
				};
			}

			if (actionItems.length === 0) {
				return {
					mappedCount: 0,
					createdRequirementsCount: 0,
					coverage: 0,
					validation: {
						isValid: false,
						coverage: 0,
						unmappedRequirements: [],
						risks: ['Nenhuma ação disponível para receber tarefas.'],
					},
					message: 'Falha: não há ações na jornada para vincular tarefas.',
				};
			}

			const alreadyMappedTaskIds = new Set<string>();
			for (const item of actionItems as any[]) {
				for (const taskId of this.getLinkedActions(item)) {
					alreadyMappedTaskIds.add(String(taskId));
				}
			}

			const tasksToMap = tasks.filter((task) => !alreadyMappedTaskIds.has(String(task._id || task.id)));
			if (tasksToMap.length === 0) {
				const validation = await this.validateRTM(projectId);
				return {
					mappedCount: 0,
					createdRequirementsCount: 0,
					coverage: validation.coverage,
					validation,
					message: 'Todas as tarefas já estão vinculadas às ações da jornada.',
				};
			}

			const batchSize = 10;
			const batches: any[][] = [];
			for (let i = 0; i < tasksToMap.length; i += batchSize) {
				batches.push(tasksToMap.slice(i, i + batchSize));
			}

			const mappings: Record<string, string[]> = {};
			const orphanTasks: any[] = [];

			for (let batchIdx = 0; batchIdx < batches.length; batchIdx += 1) {
				const batch = batches[batchIdx];

				const tasksDesc = batch.map((t) => `- "${t.title || t.name}" (ID: ${t._id || t.id})`).join('\n');
				const actionsDesc = actionItems.map((a: any) => `[ID: ${a._id}] ${a.description}`).join('\n');

				const prompt = `Você é um analista de rastreabilidade para desenvolvimento pessoal.

Vincule cada tarefa à ação da jornada mais aderente.
- Prefira vincular a ações existentes.
- Use "ORPHAN" somente quando nenhuma ação fizer sentido.

ACOES DISPONIVEIS:
${actionsDesc}

TAREFAS:
${tasksDesc}

Retorne JSON array:
[
	{ "taskId": "...", "requirementId": "...", "confidence": 0.7 }
]

Sem markdown.`;

				try {
					const response = await this.geminiService.generateContent(prompt, {
						responseMimeType: 'application/json',
						temperature: 0.3,
						maxOutputTokens: 2048,
					});

					const mappingArray = this.parseJsonArray(response);
					if (!mappingArray) {
						throw new Error('Resposta JSON inválida no auto-vínculo');
					}

					for (const mapping of mappingArray) {
						const taskId = String(mapping?.taskId || '');
						if (!taskId) continue;

						if (String(mapping?.requirementId || '').toUpperCase() === 'ORPHAN') {
							const orphan = batch.find((t) => String(t._id || t.id) === taskId);
							if (orphan) orphanTasks.push(orphan);
							continue;
						}

						const reqId = String(mapping.requirementId);
						if (!mappings[reqId]) mappings[reqId] = [];
						mappings[reqId].push(taskId);
					}
				} catch {
					const fallbackAction = actionItems[0] as any;
					const fallbackActionId = String(fallbackAction._id);
					if (!mappings[fallbackActionId]) mappings[fallbackActionId] = [];
					for (const task of batch) {
						mappings[fallbackActionId].push(String(task._id || task.id));
					}
				}
			}

			let createdRequirementsCount = 0;
			if (orphanTasks.length > 0) {
				const stageItems = allItems.filter(
					(item: any) => this.normalizeKind(item.kind || item.type) === 'stage',
				);
				const fallbackParent = stageItems.length > 0 ? stageItems[0] : allItems[0];
				const fallbackParentId = fallbackParent ? String((fallbackParent as any)._id) : undefined;

				const groupSize = Math.max(1, Math.ceil(orphanTasks.length / 3));
				for (let i = 0; i < orphanTasks.length; i += groupSize) {
					const group = orphanTasks.slice(i, i + groupSize);
					const description = `Ação criada automaticamente para ${group.length} tarefa(s) órfã(s)`;

					const newAction = await this.requirementModel.create({
						projectId,
						description,
						title: description,
						type: 'action',
						kind: 'action',
						hierarchyLevel: this.levelForKind('action'),
						parentItemId: fallbackParentId,
						source: 'auto_mapped_from_orphan_tasks',
						traceableItems: group.map((task) => String(task._id || task.id)),
						traceableActionItems: group.map((task) => String(task._id || task.id)),
						status: 'satisfied',
					});

					mappings[String((newAction as any)._id)] = group.map((task) => String(task._id || task.id));
					createdRequirementsCount += 1;
				}
			}

			let mappedCount = 0;
			for (const [itemId, taskIds] of Object.entries(mappings)) {
				if (!taskIds.length) continue;
				try {
					await this.requirementModel.updateOne(
						{ _id: new Types.ObjectId(itemId) },
						{
							$addToSet: {
								traceableItems: { $each: taskIds },
								traceableActionItems: { $each: taskIds },
							},
							$set: { status: 'satisfied' },
						},
					);
					mappedCount += taskIds.length;
				} catch (updateError: any) {
					this.logger.warn(`[auto-map] erro ao atualizar item ${itemId}: ${updateError?.message}`);
				}
			}

			const validation = await this.validateRTM(projectId);
			const elapsed = Date.now() - startedAt;
			this.logger.log(
				`[auto-map] projectId=${projectId} completo: ${mappedCount} tarefas vinculadas, ${createdRequirementsCount} ações criadas, ${validation.coverage}% cobertura - ${elapsed}ms`,
			);

			return {
				mappedCount,
				createdRequirementsCount,
				coverage: validation.coverage,
				validation,
				message: `Auto-vínculo concluído: ${mappedCount} tarefa(s) vinculada(s) + ${createdRequirementsCount} ação(ões) criada(s). Cobertura: ${validation.coverage}%`,
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

	async generateTasksForUnmappedRequirements(projectId: string): Promise<{
		createdTasksCount: number;
		coverage: number;
		validation: RTMValidation;
		message: string;
	}> {
		const startedAt = Date.now();
		this.logger.log(`[gen-tasks] projectId=${projectId} gerando tarefas para ações órfãs`);

		try {
			const validation = await this.validateRTM(projectId);

			if (validation.unmappedRequirements.length === 0) {
				return {
					createdTasksCount: 0,
					coverage: validation.coverage,
					validation,
					message: 'Todos os itens da jornada já possuem rastreabilidade.',
				};
			}

			const requirements = await this.requirementModel.find({
				_id: { $in: validation.unmappedRequirements },
			});

			const actionItems = requirements.filter(
				(item: any) => this.normalizeKind(item.kind || item.type) === 'action',
			);
			if (actionItems.length === 0) {
				return {
					createdTasksCount: 0,
					coverage: validation.coverage,
					validation,
					message:
						'Não há ações órfãs; complete primeiro a hierarquia objetivo -> hábito -> etapa -> ação.',
				};
			}

			let createdTasksCount = 0;

			for (const req of actionItems as any[]) {
				const prompt = `Você é um especialista em planejamento pessoal.

Ação da jornada:
"${req.description}"

Gere 1-2 tarefas práticas e executáveis para cumprir essa ação.
Retorne JSON array:
[
	{ "title": "...", "description": "..." }
]
Sem markdown.`;

				try {
					const response = await this.geminiService.generateContent(prompt, {
						responseMimeType: 'application/json',
						temperature: 0.35,
						maxOutputTokens: 512,
					});

					const tasksToCreate = this.parseJsonArray(response);
					if (!tasksToCreate || tasksToCreate.length === 0) continue;

					const taskIds: string[] = [];
					for (const taskData of tasksToCreate) {
						try {
							const createDto: any = {
								name: String(taskData?.title || 'Nova Tarefa'),
								description: String(taskData?.description || ''),
								project: projectId,
								pomodorosPlanned: 3,
								deadline: new Date(),
								isConcluded: false,
								late: false,
								recurrency: 'none',
								notification: new Date(),
								requirementIds: [String(req._id)],
								journeyItemIds: [String(req._id)],
							};

							const newTask = await this.tasksService.create(createDto);
							taskIds.push(String((newTask as any)._id));
							createdTasksCount += 1;
						} catch (taskError: any) {
							this.logger.warn(`[gen-tasks] erro ao criar tarefa: ${taskError?.message}`);
						}
					}

					if (taskIds.length > 0) {
						await this.requirementModel.updateOne(
							{ _id: new Types.ObjectId(String(req._id)) },
							{
								$addToSet: {
									traceableItems: { $each: taskIds },
									traceableActionItems: { $each: taskIds },
								},
								$set: { status: 'satisfied' },
							},
						);
					}
				} catch (genError: any) {
					this.logger.warn(
						`[gen-tasks] erro ao gerar tarefas para ação ${req._id}: ${genError?.message}`,
					);
				}
			}

			const finalValidation = await this.validateRTM(projectId);
			const elapsed = Date.now() - startedAt;
			this.logger.log(
				`[gen-tasks] projectId=${projectId} concluído: ${createdTasksCount} tarefas criadas, ${finalValidation.coverage}% cobertura - ${elapsed}ms`,
			);

			return {
				createdTasksCount,
				coverage: finalValidation.coverage,
				validation: finalValidation,
				message: `${createdTasksCount} tarefa(s) gerada(s) para ações órfãs. Cobertura final: ${finalValidation.coverage}%`,
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
