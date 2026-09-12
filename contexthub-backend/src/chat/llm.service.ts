import {
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI, Type, type Content } from '@google/genai';

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

/** A tool the model may call, described in provider-neutral terms. */
export interface LlmToolDefinition {
  name: string;
  description: string;
  /** Property name to its schema. Only the subset the agent actually needs. */
  parameters: Record<
    string,
    { type: 'string'; description: string; required?: boolean }
  >;
}

/** The model asking for a tool to be run. */
export interface LlmToolCall {
  name: string;
  args: Record<string, string>;
}

/**
 * One turn of a tool-using exchange.
 *
 * Kept provider-neutral for the same reason as `LlmTurn`: the agent builds a
 * transcript out of these and never sees a Gemini `Content` object, so this
 * file stays the only one that knows which provider is behind it.
 */
export type LlmAgentTurn =
  | { role: 'user'; text: string }
  | { role: 'model'; text?: string; calls?: LlmToolCall[] }
  | { role: 'tool'; name: string; result: unknown };

/** What the model did when offered tools: talked, called tools, or both. */
export interface LlmToolStep {
  text: string;
  calls: LlmToolCall[];
}

/** What a call actually cost, as reported by the provider. */
export interface LlmUsage {
  promptTokens: number;
  outputTokens: number;
  totalTokens: number;
}

/**
 * Per-call overrides of the configured defaults. Answering wants a little
 * warmth and room; a mechanical task like rewriting a query wants neither.
 */
export interface LlmOptions {
  temperature?: number;
  maxOutputTokens?: number;
  /**
   * Called once with the provider's own token counts when the call completes.
   *
   * A callback rather than a changed return type: every caller here wants the
   * text and only the metering cares about the cost, so this stays out of the
   * way of the ones that do not. Never fires on a failed call, because a
   * request the user did not get an answer to should not be billed to them.
   */
  onUsage?: (usage: LlmUsage) => void;
}

/** Provider usage metadata is entirely optional; treat every field as absent. */
interface ProviderUsage {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
  thoughtsTokenCount?: number;
}

/**
 * Normalise the provider's usage block.
 *
 * `totalTokenCount` is preferred because it is the number the provider bills,
 * and on thinking models it already includes reasoning tokens that the prompt
 * and candidate counts leave out. The sum is only a fallback for when the
 * provider omits the total.
 */
function toUsage(raw: ProviderUsage | undefined): LlmUsage | null {
  if (!raw) return null;
  const promptTokens = raw.promptTokenCount ?? 0;
  const outputTokens =
    (raw.candidatesTokenCount ?? 0) + (raw.thoughtsTokenCount ?? 0);
  const totalTokens = raw.totalTokenCount ?? promptTokens + outputTokens;
  if (totalTokens <= 0) return null;
  return { promptTokens, outputTokens, totalTokens };
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

      const usage = toUsage(response.usageMetadata);
      if (usage) options.onUsage?.(usage);

      return text;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Gemini generate failed: ${message}`);
      throw new InternalServerErrorException(`LLM provider error: ${message}`);
    }
  }

  /**
   * Offer the model a set of tools and return whatever it does next: some text,
   * some tool calls, or both.
   *
   * This runs exactly one step. Looping, deciding when enough has been gathered,
   * and enforcing a ceiling on rounds all belong to the caller, because those
   * are product decisions rather than provider ones.
   */
  async step(
    turns: LlmAgentTurn[],
    systemInstruction: string,
    tools: LlmToolDefinition[],
    options: LlmOptions = {},
  ): Promise<LlmToolStep> {
    try {
      const response = await this.client.models.generateContent({
        model: this.model,
        contents: turns.map((t) => this.toContent(t)),
        config: {
          systemInstruction,
          temperature: options.temperature ?? this.temperature,
          maxOutputTokens: options.maxOutputTokens ?? this.maxOutputTokens,
          tools: [
            {
              functionDeclarations: tools.map((tool) => ({
                name: tool.name,
                description: tool.description,
                parameters: {
                  type: Type.OBJECT,
                  properties: Object.fromEntries(
                    Object.entries(tool.parameters).map(([name, spec]) => [
                      name,
                      { type: Type.STRING, description: spec.description },
                    ]),
                  ),
                  required: Object.entries(tool.parameters)
                    .filter(([, spec]) => spec.required)
                    .map(([name]) => name),
                },
              })),
            },
          ],
        },
      });

      const usage = toUsage(response.usageMetadata);
      if (usage) options.onUsage?.(usage);

      const calls: LlmToolCall[] = (response.functionCalls ?? []).map((c) => ({
        name: c.name ?? '',
        args: Object.fromEntries(
          Object.entries(c.args ?? {}).map(([k, v]) => [k, String(v ?? '')]),
        ),
      }));

      return { text: response.text?.trim() ?? '', calls };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Gemini tool step failed: ${message}`);
      throw new InternalServerErrorException(`LLM provider error: ${message}`);
    }
  }

  /** Map one neutral agent turn onto the provider's content shape. */
  private toContent(turn: LlmAgentTurn): Content {
    if (turn.role === 'user') {
      return { role: 'user', parts: [{ text: turn.text }] };
    }

    if (turn.role === 'model') {
      return {
        role: 'model',
        parts: [
          ...(turn.text ? [{ text: turn.text }] : []),
          ...(turn.calls ?? []).map((c) => ({
            functionCall: { name: c.name, args: c.args },
          })),
        ],
      };
    }

    // A tool result. Gemini carries these on a user turn, which is why this
    // mapping exists rather than the caller writing it out.
    return {
      role: 'user',
      parts: [
        {
          functionResponse: {
            name: turn.name,
            response: { result: turn.result },
          },
        },
      ],
    };
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

      // Usage arrives on the chunks rather than up front, and the final one
      // carries the complete figure, so keep overwriting and report at the end.
      let usage: LlmUsage | null = null;

      for await (const chunk of stream) {
        const chunkUsage = toUsage(chunk.usageMetadata);
        if (chunkUsage) usage = chunkUsage;

        const text = chunk.text;
        if (text) yield text;
      }

      if (usage) options.onUsage?.(usage);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Gemini stream failed: ${message}`);
      throw new InternalServerErrorException(`LLM provider error: ${message}`);
    }
  }
}
