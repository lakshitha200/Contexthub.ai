import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import {
  LlmService,
  type LlmAgentTurn,
  type LlmToolDefinition,
  type LlmUsage,
} from './llm.service';
import { RetrievalService, type RetrievedChunk } from './retrieval.service';

/** What the agent gathered, for the answering step to work from. */
export interface AgentSearchResult {
  /** Every distinct passage found across all rounds, best scoring first. */
  chunks: RetrievedChunk[];
  /** The searches actually run, in order. Shown to the user as progress. */
  searches: string[];
}

/** Progress as the agent works, so the UI is not a silent spinner. */
export type AgentProgress =
  | { type: 'searching'; query: string }
  | { type: 'found'; query: string; count: number }
  | { type: 'thinking' };

const SEARCH_TOOL = 'search_documents';
const LIST_TOOL = 'list_documents';
const SUMMARY_TOOL = 'get_document_summary';

const TOOLS: LlmToolDefinition[] = [
  {
    name: SEARCH_TOOL,
    description:
      'Search the workspace documents for passages relevant to a query. Returns the most relevant passages with the document they came from. Call this multiple times with different queries to gather everything a question needs.',
    parameters: {
      query: {
        type: 'string',
        description:
          'What to search for. Use the words that would appear in the document, not the user question verbatim.',
        required: true,
      },
    },
  },
  {
    name: LIST_TOOL,
    description:
      'List the documents available in this workspace, with their type and a one-line summary. Use this to find out what exists before searching, especially when the question refers to documents by description rather than name.',
    parameters: {},
  },
  {
    name: SUMMARY_TOOL,
    description:
      'Get the full summary and topics of one document by its id, as returned by list_documents.',
    parameters: {
      documentId: {
        type: 'string',
        description: 'The document id, from list_documents.',
        required: true,
      },
    },
  },
];

const SYSTEM_INSTRUCTION = `You are the research step of a document question-answering system. Your only job is to GATHER the passages needed to answer the user's question. You do NOT write the final answer.

Work like this:
- Break the question into the separate things you need to find. "Compare X between 2024 and 2025" needs at least two searches, one per year. "What changed" needs both the before and the after.
- Search for each of them, one call at a time. Use wording that would actually appear in a document, not the user's phrasing.
- Look at what came back. If something you need is still missing, search again with different words.
- Use list_documents when the question names documents by description rather than by content, or when a search returns nothing and you need to know what exists.
- Stop as soon as you have enough. Do not search for things the question did not ask about.

When you have everything, reply with a short plain-text note of what you found. Do not answer the question itself and do not call any more tools.`;

/**
 * The research half of deep search: let the model run its own searches until it
 * has what a question needs, instead of taking one shot at retrieval.
 *
 * This exists because ordinary RAG embeds the question once and keeps the top
 * few passages. That is fine for "what is our refund policy" and quietly wrong
 * for anything needing more than one lookup: ask it to compare two years and
 * vector similarity returns the year whose wording matches best, twice over,
 * and the answer reads confidently about half the question.
 *
 * It deliberately stops at gathering. The passages it collects are handed back
 * to the normal answering path, which already knows how to ground an answer and
 * number its citations, so deep search changes what evidence is available and
 * nothing about how answers are written or cited.
 */
@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);
  private readonly maxRounds: number;
  private readonly perSearchTopK: number;
  private readonly maxChunks: number;

  constructor(
    private readonly llm: LlmService,
    private readonly retrieval: RetrievalService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.maxRounds = Number(this.config.get<string>('AGENT_MAX_ROUNDS', '3'));
    this.perSearchTopK = Number(this.config.get<string>('AGENT_TOP_K', '5'));
    this.maxChunks = Number(this.config.get<string>('AGENT_MAX_CHUNKS', '18'));
  }

  /**
   * Run the gather loop.
   *
   * `onUsage` is threaded through every model call so the whole run is billed
   * to the account that started it, and `onProgress` reports each search as it
   * happens because this takes several seconds and silence reads as a hang.
   */
  async gather(
    workspaceId: string,
    question: string,
    filters: { collectionId?: string | null; documentId?: string | null },
    onUsage: (usage: LlmUsage) => void,
    onProgress: (progress: AgentProgress) => void,
  ): Promise<AgentSearchResult> {
    const turns: LlmAgentTurn[] = [{ role: 'user', text: question }];
    // Keyed by chunk id: the same passage answering two different searches is
    // one piece of evidence, not two, and duplicates would waste the context
    // window the answering step has to work in.
    const found = new Map<string, RetrievedChunk>();
    const searches: string[] = [];

    for (let round = 0; round < this.maxRounds; round++) {
      onProgress({ type: 'thinking' });

      const step = await this.llm.step(turns, SYSTEM_INSTRUCTION, TOOLS, {
        temperature: 0,
        onUsage,
      });

      // No tool calls means the model considers itself done.
      if (step.calls.length === 0) break;

      turns.push({ role: 'model', text: step.text, calls: step.calls });

      for (const call of step.calls) {
        const result = await this.runTool(
          call.name,
          call.args,
          workspaceId,
          filters,
          found,
          searches,
          onProgress,
        );
        turns.push({ role: 'tool', name: call.name, result });
      }
    }

    // Best scoring first, then capped: the answering prompt has a finite window
    // and a weak passage crowding out a strong one makes the answer worse.
    const chunks = [...found.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, this.maxChunks);

    this.logger.log(
      `Deep search ran ${searches.length} search(es), kept ${chunks.length} passage(s)`,
    );

    return { chunks, searches };
  }

  /** Dispatch one tool call. Failures come back as text the model can read. */
  private async runTool(
    name: string,
    args: Record<string, string>,
    workspaceId: string,
    filters: { collectionId?: string | null; documentId?: string | null },
    found: Map<string, RetrievedChunk>,
    searches: string[],
    onProgress: (progress: AgentProgress) => void,
  ): Promise<unknown> {
    try {
      switch (name) {
        case SEARCH_TOOL:
          return await this.search(
            args.query ?? '',
            workspaceId,
            filters,
            found,
            searches,
            onProgress,
          );
        case LIST_TOOL:
          return await this.listDocuments(workspaceId, filters);
        case SUMMARY_TOOL:
          return await this.documentSummary(workspaceId, args.documentId ?? '');
        default:
          return { error: `Unknown tool "${name}".` };
      }
    } catch (err) {
      // Handed back rather than thrown: a failed lookup is something the model
      // can route around by searching differently, whereas throwing would lose
      // every passage gathered so far.
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Tool ${name} failed: ${message}`);
      return { error: `The ${name} call failed. Try a different approach.` };
    }
  }

  private async search(
    query: string,
    workspaceId: string,
    filters: { collectionId?: string | null; documentId?: string | null },
    found: Map<string, RetrievedChunk>,
    searches: string[],
    onProgress: (progress: AgentProgress) => void,
  ): Promise<unknown> {
    const trimmed = query.trim();
    if (!trimmed) return { error: 'query was empty' };

    onProgress({ type: 'searching', query: trimmed });
    searches.push(trimmed);

    // Scope is passed through untouched: the agent picks what to search for,
    // never where. Widening beyond the caller's workspace is not reachable
    // from here, which is the whole point of it being a separate argument.
    const chunks = await this.retrieval.retrieve(
      workspaceId,
      filters,
      trimmed,
      this.perSearchTopK,
    );

    for (const chunk of chunks) found.set(chunk.chunkId, chunk);
    onProgress({ type: 'found', query: trimmed, count: chunks.length });

    if (chunks.length === 0) {
      return { passages: [], note: 'Nothing matched. Try different wording.' };
    }

    return {
      passages: chunks.map((c) => ({
        document: c.filename,
        page: c.pageNumber,
        // Truncated on purpose: the model only needs enough to judge relevance
        // and decide what to search next. The full text reaches the answering
        // step from the stored chunk, not from this transcript.
        excerpt: c.content.slice(0, 500),
      })),
    };
  }

  private async listDocuments(
    workspaceId: string,
    filters: { collectionId?: string | null },
  ): Promise<unknown> {
    const documents = await this.prisma.document.findMany({
      where: {
        workspaceId,
        ...(filters.collectionId ? { collectionId: filters.collectionId } : {}),
        status: 'READY',
      },
      select: {
        id: true,
        filename: true,
        docType: true,
        summary: true,
        topics: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return {
      documents: documents.map((d) => ({
        id: d.id,
        filename: d.filename,
        type: d.docType,
        summary: d.summary?.slice(0, 240) ?? null,
        topics: d.topics,
      })),
    };
  }

  private async documentSummary(
    workspaceId: string,
    documentId: string,
  ): Promise<unknown> {
    const document = await this.prisma.document.findFirst({
      // Scoped by workspace, so a guessed or leaked id from another tenant
      // reads as "not found" exactly like a wrong one.
      where: { id: documentId, workspaceId },
      select: { filename: true, docType: true, summary: true, topics: true },
    });

    if (!document) return { error: 'No such document in this workspace.' };
    return document;
  }
}
