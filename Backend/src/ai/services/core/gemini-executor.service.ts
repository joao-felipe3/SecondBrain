import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } from '@google/generative-ai';

@Injectable()
export class GeminiExecutorService {
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

  private sanitizeForLog(val: string | number | boolean | null | undefined, maxLen = 60): string {
    if (val === null || val === undefined) return '';
    const str = typeof val === 'string' ? val : String(val);
    return str
      .replace(/[\r\n\t]/g, ' ')
      .split('')
      .filter((char) => {
        const code = char.charCodeAt(0);
        return (code >= 32 && code !== 127) || code > 159;
      })
      .join('')
      .trim()
      .slice(0, maxLen);
  }

  private sanitizeModelNameForLog(modelName: string): string {
    if (!modelName) return '';
    return String(modelName)
      .replace(/[\r\n]/g, '')
      .replace(/[^a-zA-Z0-9_.:/-]/g, '')
      .slice(0, 60);
  }

  private shouldUseJsonMode(requested: string | undefined, modelName: string): string | undefined {
    if (!requested) return undefined;
    if (this.supportsJsonModeForModel(modelName)) return requested;
    if (!this.warnedJsonMode) {
      this.warnedJsonMode = true;
      const safeModel = this.sanitizeModelNameForLog(modelName);
      console.warn(
        `[GeminiService] JSON mode desabilitado para model="${safeModel}". A resposta será texto e o sistema fará parse/reparo de JSON quando necessário.`,
      );
    }
    return undefined;
  }

  async generateEmbedding(text: string): Promise<number[]> {
    if (!text || !text.trim()) return [];
    if (this.embeddingDisabled || !this.embeddingModel) return [];

    try {
      const model = this.genAI.getGenerativeModel({
        model: this.embeddingModel,
      });
      const result = await model.embedContent(text);
      return result.embedding.values || [];
    } catch (error: unknown) {
      const errObj = error as { status?: number; code?: number; message?: string };
      const status = errObj.status || errObj.code;
      const message = typeof errObj.message === 'string' ? errObj.message : String(error);
      if (status === 404 || /not found|is not supported for embedContent/i.test(message)) {
        this.embeddingDisabled = true;
        if (!this.warnedEmbedding) {
          this.warnedEmbedding = true;
          const safeEmbeddingModel = this.sanitizeModelNameForLog(this.embeddingModel || '');
          console.warn(
            `[GeminiService] Embeddings desabilitados: model="${safeEmbeddingModel}" não suportado/indisponível. Continuando sem embeddings.`,
          );
        }
        return [];
      }

      const safeMsg = this.sanitizeForLog(errObj.message || message, 120);
      console.warn('Erro ao gerar embedding com Gemini:', safeMsg);
      return [];
    }
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
    let lastError: { status?: number; code?: number; message?: string } | null = null;

    const isTransientOverload = (status: number | undefined, message: string) => {
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
      } catch (err: unknown) {
        const errObj = err as { status?: number; code?: number; message?: string };
        const status = errObj.status || errObj.code;
        const message = typeof errObj.message === 'string' ? errObj.message : String(err);

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

        lastError = errObj;
        break;
      }
    }

    if (lastError && (lastError.status === 429 || lastError.code === 429)) {
      const rateError = new Error('Gemini rate limit after retries') as Error & { code?: string };
      rateError.code = 'RATE_LIMIT';
      throw rateError;
    }

    throw new Error('Falha ao gerar conteúdo com a IA do Gemini');
  }
}
