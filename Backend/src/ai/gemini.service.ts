import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } from '@google/generative-ai';
import { z } from 'zod';
import { extractJsonObject } from '../projects/services/wbs/utils/json-parser.util';

@Injectable()
export class GeminiService {
  private readonly genAI: GoogleGenerativeAI;
  private readonly model: string;
  private readonly strongModel?: string;
  private readonly strongModelMaxCallsPerDay: number;
  private strongModelCallsDay = '';
  private strongModelCallsUsed = 0;
  private warnedStrongBudget = false;
  private readonly embeddingModel?: string;
  private readonly jsonModeForced: boolean | null;
  private embeddingDisabled = false;
  private warnedEmbedding = false;
  private warnedJsonMode = false;
  private readonly checklistCache = new Map<string, { value: string[]; exp: number }>();
  private checklistRedisClient: any = null;
  private readonly checklistCacheTtlSeconds = 60 * 60;
  private readonly pertCache = new Map<string, { value: any; exp: number }>();
  private readonly pertCacheTtlSeconds = 24 * 60 * 60;

  constructor(private readonly configService: ConfigService) {
    const apiKey =
      this.configService.get<string>('GEMINI_API_KEY') ||
      this.configService.get<string>('GOOGLE_API_KEY') ||
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_API_KEY;

    if (!apiKey) {
      throw new Error('GEMINI_API_KEY or GOOGLE_API_KEY não está definida no .env');
    }

    this.genAI = new GoogleGenerativeAI(apiKey);

    this.model =
      this.configService.get<string>('GEMINI_MODEL') ||
      process.env.GEMINI_MODEL ||
      'gemini-2.5-flash-lite';

    const strongRaw =
      this.configService.get<string>('GEMINI_STRONG_MODEL') ||
      this.configService.get<string>('GEMINI_FALLBACK_MODEL') ||
      process.env.GEMINI_STRONG_MODEL ||
      process.env.GEMINI_FALLBACK_MODEL;
    const strongNormalized = String(strongRaw ?? '').trim();
    this.strongModel = strongNormalized || undefined;

    const strongLimitRaw =
      this.configService.get<string>('GEMINI_STRONG_MODEL_MAX_CALLS_PER_DAY') ||
      process.env.GEMINI_STRONG_MODEL_MAX_CALLS_PER_DAY;
    const parsedLimit = Number(strongLimitRaw);
    this.strongModelMaxCallsPerDay =
      Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.floor(parsedLimit) : 3;

    const embeddingRaw =
      this.configService.get<string>('GEMINI_EMBEDDING_MODEL') ?? process.env.GEMINI_EMBEDDING_MODEL;
    const embeddingNormalized = String(embeddingRaw ?? '').trim();
    const embeddingOffValues = new Set(['0', 'false', 'off', 'none', 'disable', 'disabled']);
    if (!embeddingNormalized || embeddingOffValues.has(embeddingNormalized.toLowerCase())) {
      this.embeddingModel = undefined;
      this.embeddingDisabled = true;
    } else {
      this.embeddingModel = embeddingNormalized;
    }

    const forceJson = this.configService.get<string>('GEMINI_JSON_MODE') || process.env.GEMINI_JSON_MODE;
    if (forceJson !== undefined && forceJson !== null && String(forceJson).trim() !== '') {
      const normalized = String(forceJson).toLowerCase().trim();
      this.jsonModeForced =
        normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
    } else {
      this.jsonModeForced = null;
    }

    this.initializeChecklistRedis();
  }

  private initializeChecklistRedis(): void {
    try {
      const redisUrl = this.configService.get<string>('REDIS_URL') || process.env.REDIS_URL;
      if (!redisUrl) return;

      const IORedis = require('ioredis');
      const redisClient = new IORedis(redisUrl, {
        lazyConnect: true,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
        connectTimeout: 2000,
      });

      const disableRedis = (): void => {
        if (this.checklistRedisClient !== redisClient) return;
        this.checklistRedisClient = null;
        try {
          redisClient.removeAllListeners();
          redisClient.disconnect();
        } catch {
          // Keep in-memory fallback active.
        }
      };

      redisClient.on('error', disableRedis);
      redisClient.on('close', disableRedis);
      redisClient.on('end', disableRedis);

      this.checklistRedisClient = redisClient;
      void redisClient.connect().catch(() => disableRedis());
    } catch {
      this.checklistRedisClient = null;
    }
  }

  private getChecklistCacheKey(taskName: string, microTaskType?: string): string {
    const type = String(microTaskType || 'generic')
      .trim()
      .toLowerCase();
    const name = String(taskName || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
    return `checklist:${type}:${name}`;
  }

  private async getChecklistCache(key: string): Promise<string[] | null> {
    try {
      if (this.checklistRedisClient) {
        const raw = await this.checklistRedisClient.get(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : null;
      }
    } catch {
      // fallback to memory
    }

    const local = this.checklistCache.get(key);
    if (!local) return null;
    if (Date.now() > local.exp) {
      this.checklistCache.delete(key);
      return null;
    }
    return local.value;
  }

  private async setChecklistCache(key: string, value: string[]): Promise<void> {
    try {
      if (this.checklistRedisClient) {
        await this.checklistRedisClient.set(
          key,
          JSON.stringify(value),
          'EX',
          this.checklistCacheTtlSeconds,
        );
        return;
      }
    } catch {
      // fallback to memory
    }

    this.checklistCache.set(key, {
      value,
      exp: Date.now() + this.checklistCacheTtlSeconds * 1000,
    });
  }

  private normalizeChecklistItems(input: unknown): string[] {
    if (!Array.isArray(input)) return [];

    const unique = new Set<string>();
    for (const row of input) {
      if (typeof row === 'string') {
        const clean = row.trim();
        if (clean) unique.add(clean);
        continue;
      }

      if (row && typeof row === 'object') {
        const value = row.item;
        if (typeof value === 'string' && value.trim()) {
          unique.add(value.trim());
        }
      }
    }

    return Array.from(unique).slice(0, 10);
  }

  private parseChecklistResponse(raw: string): string[] {
    if (!raw || typeof raw !== 'string') return [];

    const cleaned = raw
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    try {
      const parsed = JSON.parse(cleaned);
      const items = this.normalizeChecklistItems(parsed);
      if (items.length > 0) return items;
    } catch {
      // ignore and try fallback
    }

    return cleaned
      .split('\n')
      .map((line) => line.replace(/^[-*\d.)\s]+/, '').trim())
      .filter(Boolean)
      .slice(0, 10);
  }

  private getChecklistFallback(microTaskType?: string): string[] {
    const type = String(microTaskType || 'generic').toLowerCase();
    if (type === 'habit') {
      return ['Preparar ambiente', 'Executar habito', 'Registrar resultado'];
    }
    if (type === 'complex') {
      return [
        'Revisar requisitos',
        'Executar tarefa principal',
        'Validar resultado',
        'Documentar saida',
      ];
    }
    return ['Preparar contexto', 'Executar tarefa', 'Validar entrega'];
  }

  async generateChecklistForTask(
    taskName: string,
    description?: string,
    microTaskType?: string,
  ): Promise<string[]> {
    const key = this.getChecklistCacheKey(taskName, microTaskType);
    const cached = await this.getChecklistCache(key);
    if (cached && cached.length > 0) return cached;

    const prompt = [
      'Gere um checklist objetivo para uma micro-tarefa.',
      `Tipo: ${microTaskType || 'generic'}`,
      `Nome: ${taskName}`,
      `Descricao: ${description || ''}`,
      'Retorne APENAS um JSON array de strings com 3 a 8 itens, sem texto adicional.',
    ].join('\n');

    try {
      const response = await this.generateContent(prompt, {
        responseMimeType: 'application/json',
        maxOutputTokens: 500,
        temperature: 0.3,
      });

      const parsed = this.parseChecklistResponse(response);
      const finalChecklist = parsed.length >= 3 ? parsed : this.getChecklistFallback(microTaskType);
      await this.setChecklistCache(key, finalChecklist);
      return finalChecklist;
    } catch {
      const fallback = this.getChecklistFallback(microTaskType);
      await this.setChecklistCache(key, fallback);
      return fallback;
    }
  }

  async generateChecklistWithHistory(
    taskName: string,
    description?: string,
    microTaskType?: string,
    historicalContext?: string,
  ): Promise<string[]> {
    if (!historicalContext || historicalContext.trim() === '') {
      return this.generateChecklistForTask(taskName, description, microTaskType);
    }

    const key = this.getChecklistCacheKey(taskName, microTaskType);
    const cached = await this.getChecklistCache(key);
    if (cached && cached.length > 0) return cached;

    const prompt = [
      'Gere um checklist objetivo para uma micro-tarefa, baseado no histórico de tarefas similares.',
      `Tipo: ${microTaskType || 'generic'}`,
      `Nome: ${taskName}`,
      `Descricao: ${description || ''}`,
      historicalContext,
      'Use o histórico para criar um checklist mais preciso. Retorne APENAS um JSON array de strings com 3 a 8 itens.',
    ].join('\n');

    try {
      const response = await this.generateContent(prompt, {
        responseMimeType: 'application/json',
        maxOutputTokens: 500,
        temperature: 0.3,
      });

      const parsed = this.parseChecklistResponse(response);
      const finalChecklist = parsed.length >= 3 ? parsed : this.getChecklistFallback(microTaskType);
      await this.setChecklistCache(key, finalChecklist);
      return finalChecklist;
    } catch {
      const fallback = this.getChecklistFallback(microTaskType);
      await this.setChecklistCache(key, fallback);
      return fallback;
    }
  }

  private getPertCacheKey(taskType: string, description: string): string {
    const type = String(taskType || 'generic')
      .trim()
      .toLowerCase();
    const desc = String(description || '')
      .trim()
      .toLowerCase()
      .substring(0, 100)
      .replace(/\s+/g, ' ');
    return `pert:${type}:${desc}`;
  }

  private async getPertCache(key: string): Promise<any | null> {
    try {
      if (this.checklistRedisClient) {
        const raw = await this.checklistRedisClient.get(key);
        if (!raw) return null;
        return JSON.parse(raw);
      }
    } catch {
      // fallback to memory
    }

    const local = this.pertCache.get(key);
    if (!local) return null;
    if (Date.now() > local.exp) {
      this.pertCache.delete(key);
      return null;
    }
    return local.value;
  }

  private async setPertCache(key: string, value: any): Promise<void> {
    try {
      if (this.checklistRedisClient) {
        await this.checklistRedisClient.set(key, JSON.stringify(value), 'EX', this.pertCacheTtlSeconds);
        return;
      }
    } catch {
      // fallback to memory
    }

    this.pertCache.set(key, {
      value,
      exp: Date.now() + this.pertCacheTtlSeconds * 1000,
    });
  }

  private getPertFallback(taskType: string): {
    optimistic: number;
    likely: number;
    pessimistic: number;
  } {
    const type = String(taskType || 'generic').toLowerCase();
    const fallbacks: Record<string, { optimistic: number; likely: number; pessimistic: number }> = {
      subtask: { optimistic: 5, likely: 15, pessimistic: 30 },
      quick: { optimistic: 5, likely: 10, pessimistic: 20 },
      complex: { optimistic: 30, likely: 60, pessimistic: 120 },
      habit: { optimistic: 3, likely: 8, pessimistic: 15 },
      generic: { optimistic: 10, likely: 20, pessimistic: 45 },
    };

    return fallbacks[type] || fallbacks.generic;
  }

  private calculatePertMetrics(optimistic: number, likely: number, pessimistic: number) {
    const expectedTime = (optimistic + 4 * likely + pessimistic) / 6;
    const range = pessimistic - optimistic;
    const variance = Math.pow(range / 6, 2);
    const standardDeviation = Math.sqrt(variance);

    return {
      expectedTime: Math.round(expectedTime * 100) / 100,
      variance: Math.round(variance * 100) / 100,
      standardDeviation: Math.round(standardDeviation * 100) / 100,
    };
  }

  async suggestPertEstimates(
    taskType: string,
    description: string,
    projectContext?: string,
  ): Promise<{
    optimistic: number;
    likely: number;
    pessimistic: number;
    expectedTime: number;
    standardDeviation: number;
    recommendation: string;
    fromLLM: boolean;
  }> {
    const cacheKey = this.getPertCacheKey(taskType, description);
    const cached = await this.getPertCache(cacheKey);
    if (cached) return cached;

    const prompt = [
      'Você é um especialista em estimativas de software usando técnica PERT.',
      `Tarefa: ${description}`,
      `Tipo: ${taskType}`,
      projectContext ? `Contexto: ${projectContext}` : '',
      '',
      'Estime APENAS 3 valores em minutos (inteiros positivos):',
      '- O (Otimista): melhor caso, sem atrasos',
      '- M (Mais Provável): caso normal, alguns atrasos esperados',
      '- P (Pessimista): pior caso, muitos atrasos',
      '',
      'Validação: O <= M <= P (obrigatório)',
      'Retorne APENAS um JSON válido, sem explicações:',
      '{"optimistic": número, "likely": número, "pessimistic": número}',
    ]
      .filter(Boolean)
      .join('\n');

    try {
      const response = await this.generateContent(prompt, {
        responseMimeType: 'application/json',
        maxOutputTokens: 200,
        temperature: 0.3,
      });

      const parsed = JSON.parse(response);
      const optimistic = Number(parsed?.optimistic);
      const likely = Number(parsed?.likely);
      const pessimistic = Number(parsed?.pessimistic);

      if (
        !Number.isFinite(optimistic) ||
        !Number.isFinite(likely) ||
        !Number.isFinite(pessimistic) ||
        optimistic <= 0 ||
        likely <= 0 ||
        pessimistic <= 0 ||
        optimistic > likely ||
        likely > pessimistic
      ) {
        throw new Error('Valores PERT inválidos');
      }

      const metrics = this.calculatePertMetrics(optimistic, likely, pessimistic);
      const recommendation = this.getPertRecommendation(metrics.standardDeviation, metrics.expectedTime);
      const result = {
        optimistic,
        likely,
        pessimistic,
        expectedTime: metrics.expectedTime,
        standardDeviation: metrics.standardDeviation,
        recommendation,
        fromLLM: true,
      };

      await this.setPertCache(cacheKey, result);
      return result;
    } catch {
      const fallback = this.getPertFallback(taskType);
      const metrics = this.calculatePertMetrics(
        fallback.optimistic,
        fallback.likely,
        fallback.pessimistic,
      );
      const recommendation = this.getPertRecommendation(metrics.standardDeviation, metrics.expectedTime);
      const result = {
        optimistic: fallback.optimistic,
        likely: fallback.likely,
        pessimistic: fallback.pessimistic,
        expectedTime: metrics.expectedTime,
        standardDeviation: metrics.standardDeviation,
        recommendation,
        fromLLM: false,
      };

      await this.setPertCache(cacheKey, result);
      return result;
    }
  }

  private getPertRecommendation(standardDeviation: number, expectedTime: number): string {
    const coefficientOfVariation = standardDeviation / expectedTime;

    if (coefficientOfVariation > 0.5) {
      return '⚠️ Alta incerteza. Considere decompor esta tarefa em sub-tarefas menores.';
    }
    if (coefficientOfVariation > 0.3) {
      return '⚡ Incerteza moderada. Monitore o progresso de perto e ajuste o plano conforme necessário.';
    }
    return '✅ Incerteza baixa. Estimativa confiável.';
  }

  supportsJsonMode(): boolean {
    return this.supportsJsonModeForModel(this.model);
  }

  getModelName(): string {
    return this.model;
  }

  getStrongModelName(): string | undefined {
    return this.strongModel;
  }

  private todayKey(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private resetStrongBudgetIfNeeded(): void {
    const today = this.todayKey();
    if (this.strongModelCallsDay !== today) {
      this.strongModelCallsDay = today;
      this.strongModelCallsUsed = 0;
      this.warnedStrongBudget = false;
    }
  }

  private canUseStrongModel(): boolean {
    if (!this.strongModel) return false;
    this.resetStrongBudgetIfNeeded();
    return this.strongModelCallsUsed < this.strongModelMaxCallsPerDay;
  }

  private pickModel(requestedModel?: string): string {
    if (!requestedModel) return this.model;

    if (this.strongModel && requestedModel === this.strongModel) {
      if (this.canUseStrongModel()) return requestedModel;
      if (!this.warnedStrongBudget) {
        this.warnedStrongBudget = true;
        console.warn(
          `[GeminiService] Strong model budget exhausted for today (${this.strongModelMaxCallsPerDay}/day). Falling back to model="${this.model}".`,
        );
      }
      return this.model;
    }

    return requestedModel;
  }

  private trackModelUsage(modelUsed: string): void {
    if (!this.strongModel) return;
    if (modelUsed !== this.strongModel) return;
    this.resetStrongBudgetIfNeeded();
    this.strongModelCallsUsed++;
  }

  private supportsJsonModeForModel(modelName: string): boolean {
    if (this.jsonModeForced !== null) return this.jsonModeForced;
    return String(modelName || '')
      .toLowerCase()
      .startsWith('gemini-');
  }

  private shouldUseJsonMode(requested: string | undefined, modelName: string): string | undefined {
    if (!requested) return undefined;
    if (this.supportsJsonModeForModel(modelName)) return requested;
    if (!this.warnedJsonMode) {
      this.warnedJsonMode = true;
      console.warn(
        `[GeminiService] JSON mode desabilitado para model="${modelName}". A resposta será texto e o sistema fará parse/reparo de JSON quando necessário.`,
      );
    }
    return undefined;
  }

  async generateTaskSuggestions(
    projectName: string,
    shortTermGoal?: string,
    midTermGoal?: string,
    longTermGoal?: string,
    userPrompt?: string,
    existingTaskNames?: string[],
    remainingHours?: number,
  ): Promise<string> {
    const prompt = this.buildPrompt(
      projectName,
      shortTermGoal,
      midTermGoal,
      longTermGoal,
      userPrompt,
      existingTaskNames,
      remainingHours,
    );

    return this.generateContent(prompt, {
      temperature: 0.8,
      topK: 1,
      topP: 1,
      maxOutputTokens: 2048,
      responseMimeType: 'application/json',
    });
  }

  async generateCompletionFeedback(taskName: string, taskDescription?: string): Promise<string> {
    const normalize = (value: unknown): string =>
      String(value ?? '')
        .replace(/\s+/g, ' ')
        .trim();

    const prompt = [
      'Você é um mentor de produtividade e aprendizado.',
      '',
      'Contexto: uma pessoa acabou de concluir uma tarefa.',
      `Nome da tarefa: ${normalize(taskName)}`,
      taskDescription ? `Descrição: ${normalize(taskDescription)}` : '',
      '',
      'TAREFA:',
      'Gere um feedback curto e útil em Português (Brasil), amigável mas profissional.',
      'Sem emojis. Sem exageros. Não repita o contexto.',
      '',
      'FORMATO OBRIGATÓRIO:',
      'Responda APENAS com um JSON válido (sem markdown, sem texto fora do JSON).',
      'O JSON deve conter EXATAMENTE estas chaves (todas strings):',
      '- "praise": reconhecimento do esforço/progresso (1 frase curta)',
      '- "learning": aprendizado/padrão observado (1 frase curta)',
      '- "nextStep": sugestão leve do próximo passo (1 frase curta)',
      '- "finalText": versão final em 2-3 linhas, usando as 3 frases acima',
      '',
      'Regras:',
      '- finalText deve ter quebras de linha (\\n) entre as frases.',
      '- Não inclua listas, bullets, tentativas, rascunhos, checagens, nem as palavras "Role", "Attempt", "Draft".',
    ]
      .filter(Boolean)
      .join('\n');

    const raw = await this.generateContent(prompt, {
      responseMimeType: 'application/json',
      temperature: 0.4,
      topK: 1,
      topP: 1,
      maxOutputTokens: 512,
    });

    try {
      const parsed = JSON.parse(raw);
      const payload = {
        praise: normalize(parsed?.praise),
        learning: normalize(parsed?.learning),
        nextStep: normalize(parsed?.nextStep),
        finalText: String(parsed?.finalText ?? '').trim(),
      };

      return JSON.stringify(payload);
    } catch {
      return JSON.stringify({
        praise: '',
        learning: '',
        nextStep: '',
        finalText: String(raw ?? '').trim(),
      });
    }
  }

  async generateEmbedding(text: string): Promise<number[]> {
    if (!text || !text.trim()) return [];
    if (this.embeddingDisabled || !this.embeddingModel) return [];

    try {
      const model = this.genAI.getGenerativeModel({
        model: this.embeddingModel,
      });
      const result: any = await model.embedContent(text);
      return result?.embedding?.values || [];
    } catch (error: any) {
      const status = error?.status || error?.code;
      const message = String(error?.message || error || '');
      if (status === 404 || /not found|is not supported for embedContent/i.test(message)) {
        this.embeddingDisabled = true;
        if (!this.warnedEmbedding) {
          this.warnedEmbedding = true;
          console.warn(
            `[GeminiService] Embeddings desabilitados: model="${this.embeddingModel}" não suportado/indisponível. Continuando sem embeddings.`,
          );
        }
        return [];
      }

      console.warn('Erro ao gerar embedding com Gemini:', error?.message || error);
      return [];
    }
  }

  private buildPrompt(
    projectName: string,
    shortTermGoal?: string,
    midTermGoal?: string,
    longTermGoal?: string,
    userPrompt?: string,
    existingTaskNames?: string[],
    remainingHours?: number,
  ): string {
    let prompt = `Gere sugestões de tarefas para o projeto "${projectName}".\n\n`;

    if (shortTermGoal) prompt += `Objetivo de Curto Prazo: ${shortTermGoal}\n`;
    if (midTermGoal) prompt += `Objetivo de Médio Prazo: ${midTermGoal}\n`;
    if (longTermGoal) prompt += `Objetivo de Longo Prazo: ${longTermGoal}\n`;
    if (userPrompt) prompt += `\nInstruções adicionais: ${userPrompt}\n`;

    if (remainingHours && remainingHours > 0) {
      prompt += `\nObjetivo: gerar tarefas de curto, médio e longo prazo cuja soma (pomodoros * 0.5h) aproxime ${remainingHours.toFixed(1)} horas (tolerância ±1h).\n`;
    }

    if (existingTaskNames && existingTaskNames.length > 0) {
      prompt += `\nIMPORTANTE: As seguintes tarefas já foram geradas. NÃO repita nenhuma delas:\n`;
      existingTaskNames.forEach((name, index) => {
        prompt += `${index + 1}. ${name}\n`;
      });
      prompt += `\nGere tarefas DIFERENTES e complementares às já existentes.\n`;
    }

    prompt += `\nFORMATO DE RESPOSTA OBRIGATÓRIO:\nRetorne APENAS um array JSON válido. NÃO inclua explicações, markdown, ou texto adicional.\nNÃO use aspas especiais ou caracteres unicode em strings - use apenas aspas duplas ASCII normais.\n\nCada objeto do array deve ter EXATAMENTE estas propriedades:\n- "name": string\n- "deadline": string no formato YYYY-MM-DD\n- "pomodoros": number (1-6)\n- "priority": number (1-4)\n- "difficulty": number (1-4)\n- "selected": boolean\n\nRetorne de 3 a 5 tarefas relevantes. Responda APENAS com o array JSON, nada mais.`;

    return prompt;
  }

  async generateContent(
    prompt: string,
    options?: {
      model?: string;
      responseMimeType?: string;
      maxOutputTokens?: number;
      temperature?: number;
      topK?: number;
      topP?: number;
    },
  ): Promise<string> {
    if (process.env.NODE_ENV === 'test') {
      throw new Error('Gemini desabilitado em ambiente de teste');
    }

    const baseModelName = this.pickModel(options?.model);
    let currentModelName = baseModelName;
    let model = this.genAI.getGenerativeModel({ model: currentModelName });

    const buildGenerationConfig = (modelName: string) => ({
      temperature: options?.temperature ?? 0.8,
      topK: options?.topK ?? 1,
      topP: options?.topP ?? 1,
      maxOutputTokens: options?.maxOutputTokens ?? 4096,
      responseMimeType: this.shouldUseJsonMode(options?.responseMimeType, modelName),
    });

    const safetySettings: {
      category: HarmCategory;
      threshold: HarmBlockThreshold;
    }[] = [
      {
        category: HarmCategory.HARM_CATEGORY_HARASSMENT,
        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
      },
      {
        category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
      },
      {
        category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
      },
      {
        category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
      },
    ];

    const maxRetries = 4;
    let attempt = 0;
    let baseModelAttempts = 0;
    let triedStrongModel = false;
    let lastError: any;

    const isTransientOverload = (status: any, message: string) => {
      const numericStatus = Number(status);
      if ([429, 500, 502, 503, 504].includes(numericStatus)) return true;
      return /overloaded|service unavailable|temporarily unavailable|try again later/i.test(message);
    };

    while (attempt <= maxRetries) {
      try {
        const generationConfig = buildGenerationConfig(currentModelName);
        const result = await model.generateContent({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig,
          safetySettings,
        });
        this.trackModelUsage(currentModelName);
        return result.response.text();
      } catch (err: any) {
        const status = err?.status || err?.code;
        const message = String(err?.message || err || '');

        if (currentModelName === baseModelName) {
          baseModelAttempts++;
        }

        const minBaseAttempts = 2;
        if (
          this.strongModel &&
          currentModelName === baseModelName &&
          currentModelName !== this.strongModel &&
          isTransientOverload(status, message) &&
          baseModelAttempts >= minBaseAttempts &&
          !triedStrongModel &&
          this.canUseStrongModel()
        ) {
          currentModelName = this.strongModel;
          model = this.genAI.getGenerativeModel({ model: currentModelName });
          triedStrongModel = true;
          attempt++;
          continue;
        }

        if (status === 429 && attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 10000) + Math.floor(Math.random() * 300);
          await new Promise((resolve) => setTimeout(resolve, delay));
          attempt++;
          continue;
        }

        if (isTransientOverload(status, message) && attempt < maxRetries) {
          const delay = Math.min(800 * Math.pow(2, attempt), 8000) + Math.floor(Math.random() * 300);
          await new Promise((resolve) => setTimeout(resolve, delay));
          attempt++;
          continue;
        }

        lastError = err;
        break;
      }
    }

    if (lastError && (lastError.status === 429 || lastError.code === 429)) {
      const rateError: any = new Error('Gemini rate limit after retries');
      rateError.code = 'RATE_LIMIT';
      throw rateError;
    }

    throw new Error('Falha ao gerar conteúdo com a IA do Gemini');
  }

  // ===========================================================================
  // Domain Specific Structured AI methods (Task suggestions, dependencies, etc.)
  // ===========================================================================

  async inferDependencies(params: {
    prompt: string;
    maxOutputTokens: number;
    model?: string;
  }): Promise<any[]> {
    const { prompt, maxOutputTokens, model } = params;
    const response = await this.generateContent(prompt, {
      model,
      responseMimeType: 'application/json',
      maxOutputTokens,
      temperature: 0.2,
    });

    const dependencyObjectSchema = z.object({
      taskId: z.string().min(1),
      dependsOnTaskId: z.string().min(1),
      relationship: z.string().optional(),
      reason: z.string().optional(),
      confidence: z.number().min(0).max(1).optional(),
    });

    const dependencyTupleSchema = z.tuple([
      z.string().min(1),
      z.string().min(1),
      z.string().min(1).optional(),
    ]);

    const schema = z
      .object({
        dependencies: z.array(z.union([dependencyObjectSchema, dependencyTupleSchema])).default([]),
      })
      .passthrough();

    const parsed = extractJsonObject<Record<string, unknown>>(response);
    const validated = schema.parse(parsed);

    // Normalize logic
    const rawDeps = validated.dependencies || [];
    return rawDeps.map((dep) => {
      if (Array.isArray(dep)) {
        return {
          taskId: String(dep[0] || '').trim(),
          dependsOnTaskId: String(dep[1] || '').trim(),
          relationship: String(dep[2] || 'FINISH_TO_START').trim(),
        };
      }
      return {
        taskId: String(dep.taskId || '').trim(),
        dependsOnTaskId: String(dep.dependsOnTaskId || '').trim(),
        relationship: String(dep.relationship || 'FINISH_TO_START').trim(),
        reason: dep.reason ? String(dep.reason).trim() : undefined,
        confidence: typeof dep.confidence === 'number' ? dep.confidence : undefined,
      };
    });
  }

  async getTaskSuggestions(params: {
    projectName: string;
    shortTermGoal?: string;
    midTermGoal?: string;
    longTermGoal?: string;
    userPrompt?: string;
    existingTaskNames?: string[];
    chunkHours?: number;
  }): Promise<{ suggestions: any[]; isFallback: boolean }> {
    const {
      projectName,
      shortTermGoal,
      midTermGoal,
      longTermGoal,
      userPrompt,
      existingTaskNames,
      chunkHours,
    } = params;

    try {
      const aiResponse = await this.generateTaskSuggestions(
        projectName,
        shortTermGoal,
        midTermGoal,
        longTermGoal,
        userPrompt,
        existingTaskNames,
        chunkHours,
      );

      const parsed = this.safeParseJson(aiResponse);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        return {
          suggestions: this.generateMockSuggestions(projectName),
          isFallback: true,
        };
      }

      const suggestions = parsed.map((item: any) => {
        const anyItem = item as Record<string, unknown>;
        return {
          name: String(anyItem.name || ''),
          deadline: anyItem.deadline ? String(anyItem.deadline) : undefined,
          pomodoros: Number.isFinite(anyItem.pomodoros) ? Number(anyItem.pomodoros) : 0,
          priority: Number.isFinite(anyItem.priority) ? Number(anyItem.priority) : 0,
          difficulty: Number.isFinite(anyItem.difficulty) ? Number(anyItem.difficulty) : 0,
          selected: Boolean(anyItem.selected),
        };
      });

      return { suggestions, isFallback: false };
    } catch {
      return {
        suggestions: this.generateMockSuggestions(projectName),
        isFallback: true,
      };
    }
  }

  generateMockSuggestions(projectName: string): any[] {
    const baseName = String(projectName || 'Projeto').trim();
    const today = new Date();

    return [
      {
        name: `${baseName} - Planejar próximos passos`,
        deadline: new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString(),
        pomodoros: 2,
        priority: 3,
        difficulty: 2,
        selected: false,
      },
      {
        name: `${baseName} - Executar tarefa principal`,
        deadline: new Date(today.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString(),
        pomodoros: 4,
        priority: 2,
        difficulty: 3,
        selected: false,
      },
      {
        name: `${baseName} - Revisar e ajustar`,
        deadline: new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        pomodoros: 1,
        priority: 2,
        difficulty: 1,
        selected: false,
      },
    ];
  }

  async generateCompletionFeedbackStructured(prompt: string): Promise<{
    celebration: string;
    validation: string;
    question: string;
    suggestion: string;
  }> {
    const raw = await this.generateContent(prompt, {
      responseMimeType: this.supportsJsonMode() ? 'application/json' : undefined,
      temperature: 0.3,
      maxOutputTokens: 400,
    });

    const parsed = this.safeParseJson(raw) || {};
    return {
      celebration: String(parsed.celebration || parsed.praise || '').trim(),
      validation: String(parsed.validation || parsed.learning || '').trim(),
      question: String(parsed.question || parsed.nextStep || '').trim(),
      suggestion: String(parsed.suggestion || parsed.finalText || '').trim(),
    };
  }

  async generateNextSteps(
    taskName: string,
    feedback: any,
  ): Promise<Array<{ title: string; description: string }>> {
    // Next steps prompt builder:
    const prompt = [
      'Você é um assistente de produtividade e mentor de execução.',
      'Com base na tarefa recém-concluída e no feedback do usuário, sugira de 2 a 3 ações futuras ou próximas tarefas lógicas.',
      '',
      `Tarefa Concluída: "${taskName}"`,
      `Feedback/Reflexão: "${typeof feedback === 'string' ? feedback : JSON.stringify(feedback)}"`,
      '',
      'FORMATO DE RETORNO:',
      'Responda APENAS com um array JSON válido de objetos.',
      'Sem markdown, sem explicações.',
      '',
      'Estrutura do JSON:',
      '[',
      '  { "title": "Nome da ação sugerida", "description": "Explicação breve de por que fazer isso e como começar" }',
      ']',
    ].join('\n');

    try {
      const raw = await this.generateContent(prompt, {
        responseMimeType: this.supportsJsonMode() ? 'application/json' : undefined,
        temperature: 0.4,
        maxOutputTokens: 600,
      });

      const parsed = this.safeParseJson(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed
          .map((item: any) => ({
            title: String(item.title || '').trim(),
            description: String(item.description || '').trim(),
          }))
          .filter((it) => it.title);
      }
    } catch {
      // Ignored: fallback handled below
    }

    return [
      {
        title: `Próximo passo para: ${taskName}`,
        description: 'Dar continuidade ao trabalho avaliando os resultados obtidos.',
      },
    ];
  }

  private safeParseJson(str: string): any {
    if (!str) return null;
    try {
      return JSON.parse(str);
    } catch {
      const extracted = extractJsonObject<any>(str);
      if (extracted) return extracted;
      // Last resort: regex match for array/object
      try {
        const match = str.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
        if (match) return JSON.parse(match[0]);
      } catch {
        // Fallback
      }
      return null;
    }
  }
}
