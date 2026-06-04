import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} from '@google/generative-ai';

@Injectable()
export class GeminiService {
  private genAI: GoogleGenerativeAI;
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
  private checklistCache = new Map<string, { value: string[]; exp: number }>();
  private readonly checklistCacheTtlSeconds = 60 * 60;
  
  // PERT Suggestions cache
  private pertCache = new Map<string, { value: any; exp: number }>();
  private readonly pertCacheTtlSeconds = 24 * 60 * 60; // 24 hours

  constructor(private readonly configService: ConfigService) {
    // Support either GEMINI_API_KEY or GOOGLE_API_KEY (backwards compatibility)
    const apiKey =
      this.configService.get<string>('GEMINI_API_KEY') ||
      this.configService.get<string>('GOOGLE_API_KEY') ||
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_API_KEY;

    if (!apiKey) {
      throw new Error('GEMINI_API_KEY or GOOGLE_API_KEY não está definida no .env');
    }

    this.genAI = new GoogleGenerativeAI(apiKey);

    // Allow selecting models via env/config.
    // NOTE: Some open/partner models (e.g. Gemma) do NOT support JSON mode.
    this.model =
      this.configService.get<string>('GEMINI_MODEL') ||
      process.env.GEMINI_MODEL ||
      'gemini-2.5-flash-lite';

    // Optional strong model for rare fallback/escalation paths.
    // Examples: gemini-2.5-flash, gemini-2.5-flash-lite, gemini-3-flash
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
    this.strongModelMaxCallsPerDay = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.floor(parsedLimit) : 3;

    // Embeddings are optional.
    // For Google AI Studio accounts, embedding models can vary; if unsupported we auto-disable.
    // You can force-disable by setting GEMINI_EMBEDDING_MODEL to empty/off/none/false.
    const embeddingRaw =
      this.configService.get<string>('GEMINI_EMBEDDING_MODEL') ??
      process.env.GEMINI_EMBEDDING_MODEL;
    const embeddingNormalized = String(embeddingRaw ?? '').trim();
    const embeddingOffValues = new Set(['0', 'false', 'off', 'none', 'disable', 'disabled']);
    if (!embeddingNormalized || embeddingOffValues.has(embeddingNormalized.toLowerCase())) {
      this.embeddingModel = undefined;
      this.embeddingDisabled = true;
    } else {
      this.embeddingModel = embeddingNormalized;
    }

    const forceJson =
      this.configService.get<string>('GEMINI_JSON_MODE') || process.env.GEMINI_JSON_MODE;

    if (forceJson !== undefined && forceJson !== null && String(forceJson).trim() !== '') {
      const v = String(forceJson).toLowerCase().trim();
      this.jsonModeForced = v === '1' || v === 'true' || v === 'yes' || v === 'on';
    } else {
      // Default heuristic: Gemini models support JSON mode; Gemma does not.
      this.jsonModeForced = null;
    }

  }

  private getChecklistCacheKey(taskName: string, microTaskType?: string): string {
    const type = String(microTaskType || 'generic').trim().toLowerCase();
    const name = String(taskName || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
    return `checklist:${type}:${name}`;
  }

  private async getChecklistCache(key: string): Promise<string[] | null> {
    const local = this.checklistCache.get(key);
    if (!local) return null;
    if (Date.now() > local.exp) {
      this.checklistCache.delete(key);
      return null;
    }
    return local.value;
  }

  private async setChecklistCache(key: string, value: string[]): Promise<void> {
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
        const value = (row as any).item;
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
      // ignore and try regex fallback
    }

    const listItems = cleaned
      .split('\n')
      .map((line) => line.replace(/^[-*\d.)\s]+/, '').trim())
      .filter(Boolean)
      .slice(0, 10);

    return listItems;
  }

  private getChecklistFallback(microTaskType?: string): string[] {
    const type = String(microTaskType || 'generic').toLowerCase();
    if (type === 'habit') {
      return ['Preparar ambiente', 'Executar habito', 'Registrar resultado'];
    }
    if (type === 'complex') {
      return ['Revisar requisitos', 'Executar tarefa principal', 'Validar resultado', 'Documentar saida'];
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

  /**
   * Gera checklist enriquecido com contexto histórico.
   * Sprint 2: Baseado em tarefas similares concluídas para melhor qualidade.
   *
   * @param taskName Nome da tarefa
   * @param description Descrição da tarefa
   * @param microTaskType Tipo de micro-tarefa
   * @param historicalContext Texto resumido de tarefas similares concluídas
   * @returns Array com itens do checklist
   */
  async generateChecklistWithHistory(
    taskName: string,
    description?: string,
    microTaskType?: string,
    historicalContext?: string,
  ): Promise<string[]> {
    // Se não há histórico, fallback para geração simples
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

  // ============= PERT Estimates Cache Methods =============

  private getPertCacheKey(taskType: string, description: string): string {
    const type = String(taskType || 'generic').trim().toLowerCase();
    const desc = String(description || '')
      .trim()
      .toLowerCase()
      .substring(0, 100) // Limita tamanho
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
        await this.checklistRedisClient.set(
          key,
          JSON.stringify(value),
          'EX',
          this.pertCacheTtlSeconds,
        );
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

  /**
   * Retorna estimativas PERT padrão por tipo de tarefa
   * Usado como fallback quando LLM não está disponível
   */
  private getPertFallback(taskType: string): { optimistic: number; likely: number; pessimistic: number } {
    const type = String(taskType || 'generic').toLowerCase();
    
    const fallbacks: Record<string, { optimistic: number; likely: number; pessimistic: number }> = {
      subtask: { optimistic: 5, likely: 15, pessimistic: 30 },
      quick: { optimistic: 5, likely: 10, pessimistic: 20 },
      complex: { optimistic: 30, likely: 60, pessimistic: 120 },
      habit: { optimistic: 3, likely: 8, pessimistic: 15 },
      generic: { optimistic: 10, likely: 20, pessimistic: 45 },
    };

    return fallbacks[type] || fallbacks['generic'];
  }

  /**
   * Calcula as métricas PERT (TE, desvio padrão) a partir de O, M, P
   */
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

  /**
   * Sugerindo estimativas PERT via Gemini
   * Sprint 3: Utiliza LLM para gerar sugestões de O, M, P em minutos
   *
   * @param taskType Tipo de tarefa: 'subtask', 'quick', 'complex', 'habit'
   * @param description Descrição da tarefa
   * @param projectContext Contexto opcional do projeto (para melhorar sugestão)
   * @returns {optimistic, likely, pessimistic, expectedTime, standardDeviation, recommendation, fromLLM}
   */
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
    // Tenta cache primeiro
    const cacheKey = this.getPertCacheKey(taskType, description);
    const cached = await this.getPertCache(cacheKey);
    if (cached) {
      return cached;
    }

    // Tenta LLM
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
      const { optimistic, likely, pessimistic } = parsed;

      // Valida valores
      if (
        typeof optimistic !== 'number' ||
        typeof likely !== 'number' ||
        typeof pessimistic !== 'number' ||
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
    } catch (error) {
      // Fallback para valores padrão
      const fallback = this.getPertFallback(taskType);
      const metrics = this.calculatePertMetrics(fallback.optimistic, fallback.likely, fallback.pessimistic);
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

  /**
   * Gera recomendação sobre a qualidade/confiança da estimativa
   */
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

  // ============= End PERT Cache Methods =============

  /**
   * Whether this service will actually request/allow JSON-mode (responseMimeType).
   * For Gemma models this is typically false.
   */
  supportsJsonMode(): boolean {
    return this.supportsJsonModeForModel(this.model);
  }

  /** For logging/diagnostics only. */
  getModelName(): string {
    return this.model;
  }

  /** Optional stronger model name used for rare fallback/escalation paths. */
  getStrongModelName(): string | undefined {
    return this.strongModel;
  }

  private todayKey(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private resetStrongBudgetIfNeeded() {
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

    // Only enforce budget for the configured strong model.
    if (this.strongModel && requestedModel === this.strongModel) {
      if (this.canUseStrongModel()) return requestedModel;
      if (!this.warnedStrongBudget) {
        this.warnedStrongBudget = true;
        console.warn(
          `[GeminiService] Strong model budget exhausted for today (${this.strongModelMaxCallsPerDay}/day). ` +
            `Falling back to model="${this.model}".`,
        );
      }
      return this.model;
    }

    return requestedModel;
  }

  private trackModelUsage(modelUsed: string) {
    if (!this.strongModel) return;
    if (modelUsed !== this.strongModel) return;
    this.resetStrongBudgetIfNeeded();
    this.strongModelCallsUsed++;
  }

  private supportsJsonModeForModel(modelName: string): boolean {
    if (this.jsonModeForced !== null) return this.jsonModeForced;
    return String(modelName || '').toLowerCase().startsWith('gemini-');
  }

  private shouldUseJsonMode(requested: string | undefined, modelName: string): string | undefined {
    if (!requested) return undefined;
    if (this.supportsJsonModeForModel(modelName)) return requested;
    if (!this.warnedJsonMode) {
      this.warnedJsonMode = true;
      console.warn(
        `[GeminiService] JSON mode desabilitado para model="${modelName}". ` +
          `A resposta será texto e o sistema fará parse/reparo de JSON quando necessário. ` +
          `Defina GEMINI_JSON_MODE=true para forçar (se o modelo suportar).`,
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

    const model = this.genAI.getGenerativeModel({ model: this.model });

    const generationConfig = {
      temperature: 0.8,
      topK: 1,
      topP: 1,
      maxOutputTokens: 2048, // menor para reduzir consumo e risco de 429
      responseMimeType: this.shouldUseJsonMode('application/json', this.model),
    };

    const safetySettings: { category: HarmCategory; threshold: HarmBlockThreshold }[] = [
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
    let lastError: any;

    while (attempt <= maxRetries) {
      try {
        const result = await model.generateContent({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig,
          safetySettings,
        });
        return result.response.text();
      } catch (err: any) {
        const status = err?.status || err?.code;
        if (status === 429 && attempt < maxRetries) {
          // Exponential backoff + jitter
          const base = 1000; // 1s base
          const delay = Math.min(base * Math.pow(2, attempt), 10000) + Math.floor(Math.random() * 300);
          console.warn(`Rate limit 429 (tentativa ${attempt + 1}/${maxRetries}). Aguardando ${delay}ms para retry.`);
          await new Promise(r => setTimeout(r, delay));
          attempt++;
          continue;
        }
        lastError = err;
        break;
      }
    }
    // Se estourou limite após todos os retries, propaga um erro com código específico
    if (lastError && (lastError.status === 429 || lastError.code === 429)) {
      const rateError: any = new Error('Gemini rate limit after retries');
      rateError.code = 'RATE_LIMIT';
      console.error('Erro ao chamar a API do Gemini (429 após retries):', lastError);
      throw rateError;
    }

    console.error('Erro ao chamar a API do Gemini:', lastError);
    throw new Error('Falha ao gerar sugestões com a IA do Gemini');
  }

  /**
   * Generic method to generate content from a prompt
   * Used by other services like PlanningService
   */
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

    const safetySettings: { category: HarmCategory; threshold: HarmBlockThreshold }[] = [
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

    const isTransientOverload = (status: any, msg: string) => {
      const s = Number(status);
      if (s === 429 || s === 500 || s === 502 || s === 503 || s === 504) return true;
      return /overloaded|service unavailable|temporarily unavailable|try again later/i.test(msg);
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
        const msg = String(err?.message || err || '');

        // Track base model attempts
        if (currentModelName === baseModelName) {
          baseModelAttempts++;
        }

        // Only failover to strong model after AT LEAST 2 failed attempts with base model
        // This reduces unnecessary strong model usage
        const minBaseAttempts = 2;
        if (
          this.strongModel &&
          currentModelName === baseModelName &&
          currentModelName !== this.strongModel &&
          isTransientOverload(status, msg) &&
          baseModelAttempts >= minBaseAttempts &&
          !triedStrongModel &&
          this.canUseStrongModel()
        ) {
          console.warn(
            `[GeminiService] Base model overloaded/unavailable após ${baseModelAttempts} tentativas (status=${status}). ` +
              `Tentando strong model="${this.strongModel}" para esta chamada.`,
          );
          currentModelName = this.strongModel;
          model = this.genAI.getGenerativeModel({ model: currentModelName });
          triedStrongModel = true;
          attempt++;
          continue;
        }

        if (status === 429 && attempt < maxRetries) {
          const base = 1000;
          const delay = Math.min(base * Math.pow(2, attempt), 10000) + Math.floor(Math.random() * 300);
          console.warn(`Rate limit 429 (tentativa ${attempt + 1}/${maxRetries}). Aguardando ${delay}ms para retry.`);
          await new Promise(r => setTimeout(r, delay));
          attempt++;
          continue;
        }

        if (isTransientOverload(status, msg) && attempt < maxRetries) {
          const base = 800;
          const delay = Math.min(base * Math.pow(2, attempt), 8000) + Math.floor(Math.random() * 300);
          console.warn(
            `Modelo indisponível/overloaded (status=${status}) (tentativa ${attempt + 1}/${maxRetries}). ` +
              `Aguardando ${delay}ms para retry.`,
          );
          await new Promise(r => setTimeout(r, delay));
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
      console.error('Erro ao chamar a API do Gemini (429 após retries):', lastError);
      throw rateError;
    }

    console.error('Erro ao chamar a API do Gemini:', lastError);
    throw new Error('Falha ao gerar conteúdo com a IA do Gemini');
  }

  async generateEmbedding(text: string): Promise<number[]> {
    if (!text || !text.trim()) return [];
    if (this.embeddingDisabled || !this.embeddingModel) return [];

    try {
      const model = this.genAI.getGenerativeModel({ model: this.embeddingModel });
      const result: any = await model.embedContent(text);
      return result?.embedding?.values || [];
    } catch (error: any) {
      const status = error?.status || error?.code;
      const msg = String(error?.message || error || '');

      // If embedding model isn't supported/available, disable to avoid spamming logs and wasting calls.
      if (status === 404 || /not found|is not supported for embedContent/i.test(msg)) {
        this.embeddingDisabled = true;
        if (!this.warnedEmbedding) {
          this.warnedEmbedding = true;
          console.warn(
            `[GeminiService] Embeddings desabilitados: model="${this.embeddingModel}" não suportado/indisponível. ` +
              `Continuando sem embeddings.`,
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

    if (shortTermGoal) {
      prompt += `Objetivo de Curto Prazo: ${shortTermGoal}\n`;
    }
    if (midTermGoal) {
      prompt += `Objetivo de Médio Prazo: ${midTermGoal}\n`;
    }
    if (longTermGoal) {
      prompt += `Objetivo de Longo Prazo: ${longTermGoal}\n`;
    }
    if (userPrompt) {
      prompt += `\nInstruções adicionais: ${userPrompt}\n`;
    }

    if (remainingHours && remainingHours > 0) {
      prompt += `Objetivo: gerar tarefas de curto, médio e longo prazo cuja soma (pomodoros * 0.5h) aproxime ${remainingHours.toFixed(1)} horas (tolerância ±1h).\n`;
    }

    // Lista de tarefas já existentes/geradas (para evitar duplicatas)
    if (existingTaskNames && existingTaskNames.length > 0) {
      prompt += `\n IMPORTANTE: As seguintes tarefas já foram geradas. NÃO repita nenhuma delas:\n`;
      existingTaskNames.forEach((name, idx) => {
        prompt += `${idx + 1}. ${name}\n`;
      });
      prompt += `\nGere tarefas DIFERENTES e complementares às já existentes.\n`;
    }

    prompt += `
FORMATO DE RESPOSTA OBRIGATÓRIO:
Retorne APENAS um array JSON válido. NÃO inclua explicações, markdown, ou texto adicional.
NÃO use aspas especiais ou caracteres unicode em strings - use apenas aspas duplas ASCII normais.

Cada objeto do array deve ter EXATAMENTE estas propriedades:
- "name": string (nome descritivo da tarefa, sem quebras de linha)
- "deadline": string (data no formato YYYY-MM-DD, considerando hoje como ${new Date().toISOString().split('T')[0]})
- "pomodoros": number (1-6, estimativa de sessões de 25min)
- "priority": number (1-4, sendo 4 mais urgente)
- "difficulty": number (1-4, sendo 4 mais difícil)
- "selected": boolean (true para tarefas importantes, false para opcionais)

Exemplo EXATO do formato esperado (copie esta estrutura):
[{"name":"Tarefa exemplo","deadline":"2026-02-01","pomodoros":2,"priority":3,"difficulty":2,"selected":true}]

Retorne de 3 a 5 tarefas relevantes. Responda APENAS com o array JSON, nada mais.`;

    return prompt;
  }

  async generateCompletionFeedback(taskName: string, taskDescription?: string): Promise<string> {
    const normalize = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim();

    const sanitizeTextFallback = (raw: string): string => {
      const text = String(raw ?? '').trim();
      if (!text) return '';

      // If the model leaked meta-structure, try to salvage only the final draft.
      const draftMatch = text.match(/\bDraft\s*:\s*([\s\S]+)$/i);
      const afterDraft = draftMatch?.[1]?.trim();
      if (afterDraft) {
        const cleaned = afterDraft
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean)
          .join(' ');
        return cleaned;
      }

      // Otherwise, drop obvious meta lines and keep last meaningful paragraph.
      const lines = text
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .filter((l) => {
          if (/^\*\s*role\s*:/i.test(l)) return false;
          if (/^\*\s*completed task\s*:/i.test(l)) return false;
          if (/^\*\s*description\s*:/i.test(l)) return false;
          if (/^\*\s*goal\s*:/i.test(l)) return false;
          if (/^\*\s*requirements\s*:/i.test(l)) return false;
          if (/^\*\s*constraints\s*:/i.test(l)) return false;
          if (/^\*\s*attempt\s*\d+/i.test(l)) return false;
          if (/^\*\s*check\s*:?/i.test(l)) return false;
          return true;
        });
      if (lines.length === 0) return text;
      return lines.slice(-3).join(' ');
    };

    const buildFinalText = (praise: string, learning: string, nextStep: string) => {
      const parts = [praise, learning, nextStep].map((p) => normalize(p)).filter(Boolean);
      // Prefer 2–3 short lines for the UI.
      return parts.slice(0, 3).join('\n');
    };

    try {
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

      // Happy path: JSON
      try {
        const parsed = JSON.parse(raw);
        const praise = normalize(parsed?.praise);
        const learning = normalize(parsed?.learning);
        const nextStep = normalize(parsed?.nextStep);
        let finalText = String(parsed?.finalText ?? '').trim();
        if (!finalText) {
          finalText = buildFinalText(praise, learning, nextStep);
        } else {
          // Ensure it stays 2-3 lines max.
          finalText = finalText
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter(Boolean)
            .slice(0, 3)
            .join('\n');
        }

        const payload = {
          praise,
          learning,
          nextStep,
          finalText,
        };

        return JSON.stringify(payload);
      } catch {
        // Fallback: plain text
        const cleaned = sanitizeTextFallback(raw);
        return JSON.stringify({
          praise: '',
          learning: '',
          nextStep: '',
          finalText: cleaned,
        });
      }
    } catch (error: any) {
      console.error('Erro ao gerar feedback de conclusão:', error?.message);
      throw error;
    }
  }
}
