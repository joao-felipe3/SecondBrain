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
  private readonly model = 'gemini-2.0-flash-lite';

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
  ): Promise<string> {
    const prompt = this.buildPrompt(
      projectName,
      shortTermGoal,
      midTermGoal,
      longTermGoal,
      userPrompt,
    );

    try {
      const model = this.genAI.getGenerativeModel({ model: this.model });

      const generationConfig = {
        temperature: 0.9,
        topK: 1,
        topP: 1,
        maxOutputTokens: 8192,
        responseMimeType: 'application/json',
      };

      const safetySettings = [
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

      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig,
        safetySettings,
      });

      const response = result.response;
      return response.text();
    } catch (error) {
      console.error('Erro ao chamar a API do Gemini:', error);
      throw new Error('Falha ao gerar sugestões com a IA do Gemini');
    }
  }

  private buildPrompt(
    projectName: string,
    shortTermGoal?: string,
    midTermGoal?: string,
    longTermGoal?: string,
    userPrompt?: string,
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

    prompt += `\nRetorne APENAS um array JSON válido com sugestões de tarefas. Cada tarefa deve ter:
- name: string (nome descritivo da tarefa)
- deadline: string (data no formato YYYY-MM-DD, considerando hoje como ${
      new Date().toISOString().split('T')[0]
    })
- pomodoros: number (1-6, estimativa de sessões de 25min)
- priority: number (1-4, sendo 4 mais urgente)
- difficulty: number (1-4, sendo 4 mais difícil)
- selected: boolean (true para tarefas importantes, false para opcionais)

Exemplo do formato esperado:
[
  {
    "name": "Pesquisar sobre arquitetura do projeto",
    "deadline": "2025-11-15",
    "pomodoros": 2,
    "priority": 3,
    "difficulty": 2,
    "selected": true
  }
]

Retorne de 3 a 5 tarefas relevantes.`;

    return prompt;
  }
}
