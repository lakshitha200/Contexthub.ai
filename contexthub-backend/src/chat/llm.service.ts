import {
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';

/** An image attached to a turn, as raw base64 (no `data:` prefix). */
export interface LlmImage {
  mimeType: string;
  data: string;
}

/** One turn of a chat, in provider-neutral terms. */
export interface LlmTurn {
  role: 'user' | 'model';
  text: string;
  /** Images the user attached to this turn. User turns only. */
  images?: LlmImage[];
}

/**
 * Per-call overrides of the configured defaults. Answering wants a little
 * warmth and room; a mechanical task like rewriting a query wants neither.
 */
export interface LlmOptions {
  temperature?: number;
  maxOutputTokens?: number;
}

/**
 * Provider-agnostic chat-completion wrapper. Today it calls Google Gemini
 * (`gemini-2.5-flash`) but callers only see `generate(turns, systemInstruction)`,
 * so swapping providers later means changing only this file — exactly like
 * EmbeddingService does for embeddings.
 *
 * Turns may carry images as well as text: `gemini-2.5-flash` is multimodal, so
 * a pasted screenshot is just another part on the user turn.
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
    this.temperature = Number(
      this.config.get<string>('CHAT_TEMPERATURE', '0.2'),
    );
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
  async generate(
    turns: LlmTurn[],
    systemInstruction: string,
    options: LlmOptions = {},
  ): Promise<string> {
    try {
      const response = await this.client.models.generateContent({
        model: this.model,
        contents: turns.map((t) => ({
          role: t.role,
          // Images first: the model reads them as context for the text that
          // follows, which is the order Gemini's own guidance recommends.
          parts: [
            ...(t.images ?? []).map((img) => ({
              inlineData: { mimeType: img.mimeType, data: img.data },
            })),
            { text: t.text },
          ],
        })),
        config: {
          systemInstruction,
          temperature: options.temperature ?? this.temperature,
          maxOutputTokens: options.maxOutputTokens ?? this.maxOutputTokens,
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

  /**
   * Same call as `generate`, yielding text as it arrives instead of waiting for
   * the whole answer.
   *
   * A full answer takes 2–4 seconds to compose. Streaming does not make that
   * faster, but it moves *first output* to well under a second, which is the
   * number a reader actually feels — and it is what lets read-aloud start on
   * the first sentence rather than the last.
   *
   * Deltas are yielded raw. Trimming is the caller's job, once, at the end:
   * trimming each fragment would eat the spaces between them.
   */
  async *generateStream(
    turns: LlmTurn[],
    systemInstruction: string,
    options: LlmOptions = {},
  ): AsyncGenerator<string> {
    try {
      const stream = await this.client.models.generateContentStream({
        model: this.model,
        contents: turns.map((t) => ({
          role: t.role,
          parts: [
            ...(t.images ?? []).map((img) => ({
              inlineData: { mimeType: img.mimeType, data: img.data },
            })),
            { text: t.text },
          ],
        })),
        config: {
          systemInstruction,
          temperature: options.temperature ?? this.temperature,
          maxOutputTokens: options.maxOutputTokens ?? this.maxOutputTokens,
        },
      });

      for await (const chunk of stream) {
        const text = chunk.text;
        if (text) yield text;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Gemini stream failed: ${message}`);
      throw new InternalServerErrorException(`LLM provider error: ${message}`);
    }
  }
}
