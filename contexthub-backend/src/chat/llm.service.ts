import {
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';

/** One turn of a chat, in provider-neutral terms. */
export interface LlmTurn {
  role: 'user' | 'model';
  text: string;
}

/**
 * Provider-agnostic chat-completion wrapper. Today it calls Google Gemini
 * (`gemini-2.5-flash`) but callers only see `generate(turns, systemInstruction)`,
 * so swapping providers later means changing only this file — exactly like
 * EmbeddingService does for embeddings.
 */
@Injectable()
export class LlmService implements OnModuleInit {
  private readonly logger = new Logger(LlmService.name);
  private readonly model: string;
  private readonly temperature: number;
  private readonly maxOutputTokens: number;
  private client!: GoogleGenAI;

  constructor(private readonly config: ConfigService) {
    this.model = this.config.get<string>('CHAT_MODEL', 'gemini-2.5-flash');
    this.temperature = Number(this.config.get<string>('CHAT_TEMPERATURE', '0.2'));
    this.maxOutputTokens = Number(
      this.config.get<string>('CHAT_MAX_OUTPUT_TOKENS', '1024'),
    );
  }

  onModuleInit(): void {
    const apiKey = this.config.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      throw new Error(
        'GEMINI_API_KEY is not set. Add it to .env before the chat service can run.',
      );
    }
    this.client = new GoogleGenAI({ apiKey });
  }

  /**
   * Run a (multi-turn) completion. `turns` is the conversation so far, ending
   * with the current user turn; `systemInstruction` sets behaviour (grounding
   * rules, citation format). Returns the model's plain-text answer.
   */
  async generate(turns: LlmTurn[], systemInstruction: string): Promise<string> {
    try {
      const response = await this.client.models.generateContent({
        model: this.model,
        contents: turns.map((t) => ({
          role: t.role,
          parts: [{ text: t.text }],
        })),
        config: {
          systemInstruction,
          temperature: this.temperature,
          maxOutputTokens: this.maxOutputTokens,
        },
      });

      const text = response.text?.trim();
      if (!text) {
        throw new Error('Model returned an empty response');
      }
      return text;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Gemini generate failed: ${message}`);
      throw new InternalServerErrorException(`LLM provider error: ${message}`);
    }
  }
}
