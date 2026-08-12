import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MessageRole, Prisma } from '../../generated/prisma/client';
import { CollectionService } from '../collection/collection.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConversationService } from './conversation.service';
import { AskDto } from './dto/ask.dto';
import { LlmService, type LlmTurn } from './llm.service';
import { RetrievalService, type RetrievedChunk } from './retrieval.service';

/** A source reference attached to an assistant answer. */
export interface Citation {
  index: number;
  chunkId: string;
  documentId: string;
  filename: string;
  pageNumber: number | null;
  score: number;
  snippet: string;
}

const SYSTEM_INSTRUCTION = `You are ContextHub, a helpful AI assistant for a team's knowledge workspace.

You are given numbered context passages retrieved from the user's documents (there may be none, or they may be irrelevant to the question).

How to answer:
- If the passages are relevant, answer using ONLY them and cite each fact inline with its number in square brackets, e.g. [1] or [2][3].
- If the question is a greeting, small talk, or a general-knowledge / how-to-use-this-assistant question that the passages don't cover, just answer briefly and helpfully from your own knowledge. In that case do NOT add any [n] citation markers, and don't claim the answer came from the user's documents.
- If the question clearly asks about the user's documents but the passages don't contain the answer, say you couldn't find it in the documents and suggest uploading or rephrasing. Never invent facts about the user's documents.
- Be concise, direct, and friendly.`;

// How many past turns of the conversation to send back to the model.
const MAX_HISTORY_MESSAGES = 10;
// Max characters of a chunk surfaced as a citation snippet.
const SNIPPET_LEN = 300;

/**
 * The RAG orchestration: question in → grounded, cited answer out.
 *
 *   persist USER msg → embed+retrieve chunks → build prompt → call LLM
 *   → persist ASSISTANT msg (+citations)
 *
 * Retrieval is scoped by the conversation's workspace and (optional) collection,
 * so an answer can only ever draw on documents the user already has access to.
 */
@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly conversations: ConversationService,
    private readonly retrieval: RetrievalService,
    private readonly llm: LlmService,
    private readonly collections: CollectionService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async ask(
    workspaceId: string,
    userId: string,
    conversationId: string,
    dto: AskDto,
  ) {
    const conversation = await this.conversations.getOwnedOrThrow(
      workspaceId,
      userId,
      conversationId,
    );

    // History BEFORE this turn (so the new question isn't duplicated below).
    const priorMessages = await this.conversations.listMessages(
      workspaceId,
      userId,
      conversationId,
    );

    const question = dto.content.trim();
    await this.conversations.addMessage(
      conversationId,
      MessageRole.USER,
      question,
    );

    // Resolve the search scope. Precedence: per-question filter (dto) overrides
    // the conversation's default collection; omitting both = whole workspace.
    // Workspace is always passed separately so tenant isolation is never lost.
    const collectionId = dto.collectionId ?? conversation.collectionId ?? null;
    const documentId = dto.documentId ?? null;
    await this.validateScope(workspaceId, collectionId, documentId);

    // Retrieve relevant chunks within the resolved scope.
    const chunks = await this.retrieval.retrieve(
      workspaceId,
      { collectionId, documentId },
      question,
      this.topKValue(),
    );

    // Hybrid: always let the LLM answer. It grounds + cites when the passages
    // are relevant, and answers greetings / general questions conversationally
    // otherwise. We then attach ONLY the sources the answer actually cited, so
    // small talk shows no citations and document answers stay grounded.
    const turns = this.buildTurns(priorMessages, question, chunks);
    const answer = await this.llm.generate(turns, SYSTEM_INSTRUCTION);

    const cited = extractCitedIndices(answer);
    const citations: Citation[] = chunks.length
      ? this.toCitations(chunks).filter((c) => cited.has(c.index))
      : [];

    const assistant = await this.conversations.addMessage(
      conversationId,
      MessageRole.ASSISTANT,
      answer,
      // Citation[] is a concrete shape; widen to Prisma's structural JSON type.
      citations as unknown as Prisma.InputJsonValue,
    );

    // Auto-title a brand-new conversation from its first question.
    if (priorMessages.length === 0 && conversation.title === 'New conversation') {
      await this.conversations.update(workspaceId, userId, conversationId, {
        title: question.slice(0, 80),
      });
    }

    this.logger.log(
      `Answered conversation ${conversationId}: ${chunks.length} chunks retrieved`,
    );

    return { message: assistant, citations };
  }

  /** Build the multi-turn prompt: prior turns + a context-laden final question. */
  private buildTurns(
    priorMessages: Array<{ role: MessageRole; content: string }>,
    question: string,
    chunks: RetrievedChunk[],
  ): LlmTurn[] {
    const history: LlmTurn[] = priorMessages
      .slice(-MAX_HISTORY_MESSAGES)
      .map((m) => ({
        role: m.role === MessageRole.USER ? 'user' : 'model',
        text: m.content,
      }));

    const context = chunks.length
      ? chunks
          .map(
            (c, i) =>
              `[${i + 1}] (source: ${c.filename}${
                c.pageNumber ? `, p.${c.pageNumber}` : ''
              })\n${c.content}`,
          )
          .join('\n\n')
      : '(No relevant document passages were found for this question.)';

    const finalTurn: LlmTurn = {
      role: 'user',
      text: `Context passages:\n\n${context}\n\n---\nQuestion: ${question}`,
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
