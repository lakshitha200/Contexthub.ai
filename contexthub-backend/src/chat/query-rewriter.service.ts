import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MessageRole } from '../../generated/prisma/client';
import { LlmService, type LlmUsage } from './llm.service';

/** The shape of a past message this service needs. */
export interface HistoryMessage {
  role: MessageRole;
  content: string;
}

/** How much of a past message to show the rewriter. Answers get long. */
const MAX_HISTORY_CHARS = 300;
/** A rewrite longer than this is the model rambling, not a search query. */
const MAX_REWRITE_CHARS = 400;

const SYSTEM_INSTRUCTION = `You rewrite a follow-up question into a standalone search query for a document retrieval system.

You are given the recent conversation, then the user's latest question.

Rewrite the latest question so it can be understood with no conversation history: resolve pronouns and references ("it", "that report", "the second one") into the actual subject, and carry over the topic, document, period or entity the conversation established.

Rules:
- Output ONLY the rewritten query. No preamble, no quotes, no explanation.
- Keep it short — one sentence, in the user's own words wherever possible.
- Add only context that the conversation actually established. Never invent a document name, date or figure.
- If the latest question already stands on its own, output it unchanged.
- Keep the user's language.`;

/**
 * Turns a follow-up into a self-contained search query.
 *
 * Retrieval embeds one string. "What about costs?" embeds as those four words —
 * no report, no quarter, nothing to match against — so the nearest chunks are
 * whatever happens to mention costs anywhere in the workspace. The conversation
 * reaches the answering model, but never reached the search.
 *
 * This closes that gap on the way in. The user's real question is still what
 * gets stored and shown; only the vector search sees the rewrite.
 *
 * Costs one extra LLM call, so it is skipped whenever it cannot help (no
 * history) and degrades to the original question on any failure — a rewrite
 * going wrong must never fail a chat turn.
 */
@Injectable()
export class QueryRewriterService {
  private readonly logger = new Logger(QueryRewriterService.name);
  private readonly enabled: boolean;
  private readonly historyMessages: number;

  constructor(
    private readonly llm: LlmService,
    private readonly config: ConfigService,
  ) {
    this.enabled =
      this.config.get<string>('QUERY_REWRITE_ENABLED', 'true') !== 'false';
    this.historyMessages = Number(
      this.config.get<string>('QUERY_REWRITE_HISTORY_MESSAGES', '6'),
    );
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Returns the query to embed. Always returns something usable — the original
   * question when rewriting is disabled, unnecessary, or unsuccessful.
   */
  async rewrite(
    question: string,
    priorMessages: HistoryMessage[],
    onUsage?: (usage: LlmUsage) => void,
  ): Promise<string> {
    // First question in a conversation: there is nothing to resolve against.
    if (!this.enabled || priorMessages.length === 0) return question;

    const history = priorMessages
      .slice(-this.historyMessages)
      .map(
        (m) =>
          `${m.role === MessageRole.USER ? 'User' : 'Assistant'}: ${truncate(m.content)}`,
      )
      .join('\n');

    try {
      const answer = await this.llm.generate(
        [
          {
            role: 'user',
            text: `Conversation so far:\n${history}\n\nLatest question: ${question}\n\nRewritten standalone query:`,
          },
        ],
        SYSTEM_INSTRUCTION,
        // Mechanical rewriting, and the output is one short line.
        { temperature: 0, maxOutputTokens: 128, onUsage },
      );

      const rewritten = sanitize(answer);
      if (!rewritten) return question;

      if (rewritten !== question) {
        this.logger.log(`Rewrote query: "${question}" → "${rewritten}"`);
      }
      return rewritten;
    } catch (err) {
      // The answer itself is still perfectly possible without this.
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Query rewrite failed, using the original: ${message}`);
      return question;
    }
  }
}

function truncate(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > MAX_HISTORY_CHARS
    ? `${flat.slice(0, MAX_HISTORY_CHARS)}…`
    : flat;
}

/**
 * Strip what a chat model tends to wrap a one-line answer in, and reject
 * anything that doesn't look like a query. Returns null to mean "use the
 * original".
 */
function sanitize(answer: string): string | null {
  let text = answer.trim();

  // Models sometimes fence a single line, or restate the label first.
  text = text.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/, '');
  text = text.replace(/^(rewritten (standalone )?query|query)\s*:\s*/i, '');
  // A whole answer wrapped in matching quotes.
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'"))
  ) {
    text = text.slice(1, -1);
  }
  // Only ever a single line — anything past the first is commentary.
  text = text.split('\n')[0].trim();

  if (!text || text.length > MAX_REWRITE_CHARS) return null;
  return text;
}
