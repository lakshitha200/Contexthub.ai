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

const SYSTEM_INSTRUCTION = `You are ContextHub, a helpful assistant that answers questions strictly from the provided context.

Rules:
- Answer ONLY using the numbered context passages given in the user's message.
- When you use a passage, cite it inline with its number in square brackets, e.g. [1] or [2][3].
- If the context does not contain the answer, say you don't have enough information in the provided documents. Do not invent facts.
- Be concise and direct.`;

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

    let answer: string;
    let citations: Citation[] = [];

    if (chunks.length === 0) {
      // Nothing to ground on — answer honestly without calling the LLM.
      answer =
        "I don't have any indexed documents to answer that from yet. Upload and process documents, then ask again.";
    } else {
      citations = this.toCitations(chunks);
      const turns = this.buildTurns(priorMessages, question, chunks);
      answer = await this.llm.generate(turns, SYSTEM_INSTRUCTION);
    }

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

    const context = chunks
      .map(
        (c, i) =>
          `[${i + 1}] (source: ${c.filename}${
            c.pageNumber ? `, p.${c.pageNumber}` : ''
          })\n${c.content}`,
      )
      .join('\n\n');

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
