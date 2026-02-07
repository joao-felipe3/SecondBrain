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
  private readonly model = 'gemma-3-12b-it';
  private readonly embeddingModel = 'text-embedding-004';

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
      responseMimeType: 'application/json',
    } as const;

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
      responseMimeType?: string;
      maxOutputTokens?: number;
      temperature?: number;
      topK?: number;
      topP?: number;
    },
  ): Promise<string> {
    const model = this.genAI.getGenerativeModel({ model: this.model });

    const generationConfig = {
      temperature: options?.temperature ?? 0.8,
      topK: options?.topK ?? 1,
      topP: options?.topP ?? 1,
      maxOutputTokens: options?.maxOutputTokens ?? 2048,
      responseMimeType: options?.responseMimeType,
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
          const base = 1000;
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

    try {
      const model = this.genAI.getGenerativeModel({ model: this.embeddingModel });
      const result: any = await model.embedContent(text);
      return result?.embedding?.values || [];
    } catch (error: any) {
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
}
