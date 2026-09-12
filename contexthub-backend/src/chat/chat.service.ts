import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ChunkKind,
  MessageRole,
  Prisma,
  type Conversation,
  type Message,
} from '../../generated/prisma/client';
import { CollectionService } from '../collection/collection.service';
import { PrismaService } from '../prisma/prisma.service';
import { QuotaService } from '../quota/quota.service';
import { ConversationService } from './conversation.service';
import { AgentService, type AgentProgress } from './agent.service';
import { AskDto } from './dto/ask.dto';
import { LlmService, type LlmImage, type LlmTurn } from './llm.service';
import { QueryRewriterService } from './query-rewriter.service';
import { RetrievalService, type RetrievedChunk } from './retrieval.service';

/** What `ask` returns, and what a stream's final `done` event carries. */
export interface AskResult {
  message: Message;
  citations: Citation[];
}

/**
 * One frame of a streamed answer.
 *
 * `delta` carries raw text as the model writes it. `done` arrives once, after
 * the answer is persisted, and is the authoritative version — it carries the
 * real message id and the citations, neither of which exist until generation
 * has finished.
 */
export type AskStreamEvent =
  | { type: 'delta'; text: string }
  // Deep search takes several seconds before a single word is written, so it
  // reports what it is doing. Without this the user watches a spinner and
  // assumes it has hung.
  | { type: 'status'; stage: AgentProgress['type']; detail?: string }
  | ({ type: 'done' } & AskResult);

/** Everything `prepare()` works out before the model is called. */
interface PreparedTurn {
  conversation: Conversation;
  priorMessages: Array<{ role: MessageRole; content: string }>;
  question: string;
  chunks: RetrievedChunk[];
  turns: LlmTurn[];
}

/** Nothing to report: the non-streaming path has nowhere to put progress. */
const IGNORE_PROGRESS = () => {};

/**
 * A queue that can be pushed to from a callback and read as an async iterable.
 *
 * The agent reports progress by calling back while it works, but a generator
 * can only yield from its own body, so those reports have nowhere to go. Simply
 * collecting them in an array and emitting afterwards would compile and be
 * useless: the whole point is telling the user what is happening *during* the
 * several seconds of searching, not listing it once the wait is over.
 *
 * So pushes land here and the generator drains them as they arrive, parking on
 * a promise whenever the queue runs dry.
 */
function createEventPump<T>() {
  const queue: T[] = [];
  let wake: (() => void) | null = null;
  let closed = false;

  return {
    push(item: T) {
      queue.push(item);
      wake?.();
    },
    close() {
      closed = true;
      wake?.();
    },
    async *drain(): AsyncGenerator<T> {
      for (;;) {
        while (queue.length) yield queue.shift() as T;
        if (closed) return;
        await new Promise<void>((resolve) => {
          wake = () => {
            wake = null;
            resolve();
          };
        });
      }
    },
  };
}

/** A source reference attached to an assistant answer. */
export interface Citation {
  index: number;
  chunkId: string;
  documentId: string;
  filename: string;
  pageNumber: number | null;
  /** TEXT | TABLE | IMAGE | OCR — what the passage was extracted from. */
  kind: ChunkKind;
  /** Storage key of the source chart/image, for IMAGE citations only. */
  imageKey: string | null;
  score: number;
  snippet: string;
}

const SYSTEM_INSTRUCTION = `You are ContextHub, a helpful AI assistant for a team's knowledge workspace.

You are given numbered context passages retrieved from the user's documents (there may be none, or they may be irrelevant to the question). Passages are labelled with what they came from: document text, a table, a transcribed scanned page, or a description of a chart or image.

The user may also attach one or more images directly to their question (for example a screenshot). Those images are NOT from the knowledge base — they are part of the question itself.

How to answer:
- If the passages are relevant, answer using ONLY them and cite each fact inline with its number in square brackets, e.g. [1] or [2][3].
- If the user attached an image, read it carefully and use it to answer. Do not cite an attached image with [n] — citation numbers refer only to the retrieved passages. When the question asks you to compare an attached image against the documents, describe what the image shows and cite the document side with [n].
- If the question is a greeting, small talk, or a general-knowledge / how-to-use-this-assistant question that the passages don't cover, just answer briefly and helpfully from your own knowledge. In that case do NOT add any [n] citation markers, and don't claim the answer came from the user's documents.
- If the question clearly asks about the user's documents but the passages don't contain the answer, say you couldn't find it in the documents and suggest uploading or rephrasing. Never invent facts about the user's documents.
- A passage describing a chart was written by reading the image, so it may describe a trend without exact figures. Report only the numbers the passage actually states — never estimate a value it does not give.
- Be concise, direct, and friendly.`;

// How many past turns of the conversation to send back to the model.
const MAX_HISTORY_MESSAGES = 10;

/**
 * Collects what a turn cost so it can be written once, after the answer is
 * safely persisted.
 *
 * Recording used to be fired off unawaited from inside the provider callback,
 * which put an upsert on the wire at the exact moment `finalize` wanted a
 * connection for its own write. On a small pool against a remote database that
 * is a race the answer can lose, and losing it means the user paid for an
 * answer that was never saved. Metering can always wait; the answer cannot.
 */
function createUsageTally() {
  let total = 0;
  return {
    add: (usage: { totalTokens: number }) => {
      total += usage.totalTokens;
    },
    get total() {
      return total;
    },
  };
}
// Max characters of a chunk surfaced as a citation snippet.
const SNIPPET_LEN = 300;

/**
 * The RAG orchestration: question in → grounded, cited answer out.
 *
 *   persist USER msg → rewrite query → embed+retrieve chunks → build prompt
 *   → call LLM → persist ASSISTANT msg (+citations)
 *
 * The rewrite step exists because retrieval sees one string while the model
 * sees the whole conversation: "what about costs?" has to become "what did the
 * Q3 report say about costs?" before it is embedded, or the search has nothing
 * to go on. Only the search sees it — the stored question stays as typed.
 *
 * Retrieval is scoped by the conversation's workspace and (optional) collection,
 * so an answer can only ever draw on documents the user already has access to.
 */
@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly conversations: ConversationService,
    private readonly rewriter: QueryRewriterService,
    private readonly retrieval: RetrievalService,
    private readonly agent: AgentService,
    private readonly llm: LlmService,
    private readonly quota: QuotaService,
    private readonly collections: CollectionService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Ask and wait for the whole answer. */
  async ask(
    workspaceId: string,
    userId: string,
    conversationId: string,
    dto: AskDto,
  ): Promise<AskResult> {
    const tally = createUsageTally();
    const turn = await this.prepare(
      workspaceId,
      userId,
      conversationId,
      dto,
      tally,
    );

    // Hybrid: always let the LLM answer. It grounds + cites when the passages
    // are relevant, and answers greetings / general questions conversationally
    // otherwise. We then attach ONLY the sources the answer actually cited, so
    // small talk shows no citations and document answers stay grounded.
    try {
      const answer = await this.llm.generate(turn.turns, SYSTEM_INSTRUCTION, {
        onUsage: tally.add,
      });

      return await this.finalize(
        workspaceId,
        userId,
        conversationId,
        turn,
        answer,
      );
    } finally {
      // Last, so metering never competes with saving the answer, and in a
      // `finally` because the provider charged for those tokens whether or not
      // we managed to persist the result. Skipping the write on failure would
      // let a repeatedly failing request spend the API key for free.
      await this.quota.record(userId, tally.total);
    }
  }

  /**
   * Ask and emit the answer as it is written.
   *
   * Identical to `ask` up to generation — same rewrite, same retrieval, same
   * prompt — and identical after it: the answer is persisted with the same
   * citation filtering. The only difference is that the caller sees the text
   * arrive instead of waiting for it.
   *
   * The generator always runs to completion once generation starts, even if the
   * client has disconnected, so a paid-for answer is never lost: the user finds
   * it waiting when they reload.
   */
  async *askStream(
    workspaceId: string,
    userId: string,
    conversationId: string,
    dto: AskDto,
  ): AsyncGenerator<AskStreamEvent> {
    const tally = createUsageTally();
    const turn = await this.prepare(
      workspaceId,
      userId,
      conversationId,
      dto,
      tally,
    );

    try {
      let answer = '';
      for await (const delta of this.llm.generateStream(
        turn.turns,
        SYSTEM_INSTRUCTION,
        { onUsage: tally.add },
      )) {
        answer += delta;
        yield { type: 'delta', text: delta };
      }

      // Trim once, at the end: trimming each delta would eat the spaces
      // between them.
      const complete = answer.trim();
      if (!complete) {
        throw new InternalServerErrorException(
          'LLM provider error: model returned an empty response',
        );
      }

      const result = await this.finalize(
        workspaceId,
        userId,
        conversationId,
        turn,
        complete,
      );
      yield { type: 'done', ...result };
    } finally {
      // Last, so metering never competes with saving the answer, and in a
      // `finally` because the provider charged for those tokens whether or not
      // we managed to persist the result. Skipping the write on failure would
      // let a repeatedly failing request spend the API key for free.
      await this.quota.record(userId, tally.total);
    }
  }

  /**
   * Everything before generation: ownership, history, the persisted question,
   * scope, the rewritten search query, retrieval, and the assembled prompt.
   * Shared verbatim by both `ask` and `askStream`.
   */
  private async prepare(
    workspaceId: string,
    userId: string,
    conversationId: string,
    dto: AskDto,
    tally: ReturnType<typeof createUsageTally>,
    onProgress: (progress: AgentProgress) => void = IGNORE_PROGRESS,
  ): Promise<PreparedTurn> {
    const conversation = await this.conversations.getOwnedOrThrow(
      workspaceId,
      userId,
      conversationId,
    );

    // Ownership first, then the allowance: someone else's conversation should
    // read as 404 regardless of how much quota the caller has left.
    //
    // Checked here, before the question is persisted, so a refused turn leaves
    // no orphan user message sitting in the thread with no answer under it.
    await this.quota.assertWithinQuota(userId);

    // Deep search is rationed by run, so it is checked and counted before any
    // work starts. Counted on start rather than on success: a run that fails
    // halfway has still spent most of its model calls, and refunding it would
    // let a failing request be looped for unlimited searching.
    const deepSearch = dto.deepSearch === true;
    if (deepSearch) {
      await this.quota.assertAgentRunAvailable(userId);
      await this.quota.recordAgentRun(userId);
    }

    // History BEFORE this turn (so the new question isn't duplicated below).
    const priorMessages = await this.conversations.listMessages(
      workspaceId,
      userId,
      conversationId,
    );

    const question = dto.content.trim();
    // Attached images are used for THIS turn only — they are not embedded and
    // not persisted, so a follow-up question must re-attach them.
    const images = dto.images ?? [];
    await this.conversations.addMessage(
      conversationId,
      MessageRole.USER,
      images.length
        ? `${question}\n\n[${images.length} image(s) attached]`
        : question,
    );

    // Resolve the search scope. Precedence: per-question filter (dto) overrides
    // the conversation's default collection; omitting both = whole workspace.
    // Workspace is always passed separately so tenant isolation is never lost.
    const collectionId = dto.collectionId ?? conversation.collectionId ?? null;
    const documentId = dto.documentId ?? null;
    await this.validateScope(workspaceId, collectionId, documentId);

    // Gather the evidence. Deep search runs its own searches and decides when
    // it has enough; the ordinary path embeds the question once and keeps the
    // top few. Either way what comes out is a list of chunks, so everything
    // downstream (prompt, citations, persistence) is identical.
    const chunks = deepSearch
      ? (
          await this.agent.gather(
            workspaceId,
            question,
            { collectionId, documentId },
            tally.add,
            onProgress,
          )
        ).chunks
      : await this.retrieval.retrieve(
          workspaceId,
          { collectionId, documentId },
          // Resolve follow-ups before searching. Returns the question untouched
          // on the first turn, when disabled, or on failure. The agent does its
          // own reformulation, so this is only for the one-shot path.
          await this.rewriter.rewrite(question, priorMessages, tally.add),
          this.topKValue(),
        );

    return {
      conversation,
      priorMessages,
      question,
      chunks,
      turns: this.buildTurns(priorMessages, question, chunks, images),
    };
  }

  /** Everything after generation: citations, persistence, auto-title. */
  private async finalize(
    workspaceId: string,
    userId: string,
    conversationId: string,
    turn: PreparedTurn,
    answer: string,
  ): Promise<AskResult> {
    const cited = extractCitedIndices(answer);
    const citations: Citation[] = turn.chunks.length
      ? this.toCitations(turn.chunks).filter((c) => cited.has(c.index))
      : [];

    const assistant = await this.conversations.addMessage(
      conversationId,
      MessageRole.ASSISTANT,
      answer,
      // Citation[] is a concrete shape; widen to Prisma's structural JSON type.
      citations as unknown as Prisma.InputJsonValue,
    );

    // Auto-title a brand-new conversation from its first question.
    if (
      turn.priorMessages.length === 0 &&
      turn.conversation.title === 'New conversation'
    ) {
      await this.conversations.update(workspaceId, userId, conversationId, {
        title: turn.question.slice(0, 80),
      });
    }

    this.logger.log(
      `Answered conversation ${conversationId}: ${turn.chunks.length} chunks retrieved`,
    );

    return { message: assistant, citations };
  }

  /** Build the multi-turn prompt: prior turns + a context-laden final question. */
  private buildTurns(
    priorMessages: Array<{ role: MessageRole; content: string }>,
    question: string,
    chunks: RetrievedChunk[],
    images: LlmImage[],
  ): LlmTurn[] {
    const history: LlmTurn[] = priorMessages
      .slice(-MAX_HISTORY_MESSAGES)
      .map((m) => ({
        role: m.role === MessageRole.USER ? 'user' : 'model',
        text: m.content,
      }));

    const context = chunks.length
      ? chunks
          .map((c, i) => `[${i + 1}] (${describeSource(c)})\n${c.content}`)
          .join('\n\n')
      : '(No relevant document passages were found for this question.)';

    const attached = images.length
      ? `\n\nThe user attached ${images.length} image(s) to this question. They are shown above and are not part of the knowledge base.`
      : '';

    const finalTurn: LlmTurn = {
      role: 'user',
      text: `Context passages:\n\n${context}${attached}\n\n---\nQuestion: ${question}`,
      images: images.length ? images : undefined,
    };

    return [...history, finalTurn];
  }

  private toCitations(chunks: RetrievedChunk[]): Citation[] {
    return chunks.map((c, i) => ({
      index: i + 1,
      chunkId: c.chunkId,
      documentId: c.documentId,
      filename: c.filename,
      pageNumber: c.pageNumber,
      kind: c.kind,
      imageKey: c.imageKey,
      score: Number(c.score.toFixed(4)),
      snippet:
        c.content.length > SNIPPET_LEN
          ? `${c.content.slice(0, SNIPPET_LEN)}…`
          : c.content,
    }));
  }

  /**
   * Confirm any scope filters belong to this workspace before searching, so a
   * filter id from another tenant returns a clear 404 instead of silently
   * matching nothing. (The retrieval SQL already enforces tenant isolation; this
   * is the friendly-error layer on top.)
   */
  private async validateScope(
    workspaceId: string,
    collectionId: string | null,
    documentId: string | null,
  ): Promise<void> {
    if (collectionId) {
      // Throws 404 if the collection is not in this workspace.
      await this.collections.getById(workspaceId, collectionId);
    }
    if (documentId) {
      const doc = await this.prisma.document.findUnique({
        where: { id: documentId },
      });
      if (
        !doc ||
        doc.workspaceId !== workspaceId ||
        (collectionId && doc.collectionId !== collectionId)
      ) {
        throw new NotFoundException('Document not found in this scope');
      }
    }
  }

  private topKValue(): number {
    return Number(this.config.get<string>('RAG_TOP_K', '5'));
  }
}

/**
 * Label a passage so the model knows how much to trust it. A table is verbatim
 * from the document; a chart description was written by a vision model reading
 * an image, which is a weaker source and worth flagging as such.
 */
function describeSource(chunk: RetrievedChunk): string {
  const where = `source: ${chunk.filename}${
    chunk.pageNumber ? `, p.${chunk.pageNumber}` : ''
  }`;

  switch (chunk.kind) {
    case ChunkKind.TABLE:
      return `${where} — table`;
    case ChunkKind.IMAGE:
      return `${where} — description of a chart or image`;
    case ChunkKind.OCR:
      return `${where} — text read from a scanned page`;
    default:
      return where;
  }
}

/** Which [n] citation markers the model actually used in its answer. */
function extractCitedIndices(answer: string): Set<number> {
  const cited = new Set<number>();
  const re = /\[(\d+)\]/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(answer)) !== null) {
    cited.add(Number(match[1]));
  }
  return cited;
}
