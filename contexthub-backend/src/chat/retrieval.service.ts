import { Injectable } from '@nestjs/common';
import { ChunkKind, Prisma } from '../../generated/prisma/client';
import { EmbeddingService } from '../embedding/embedding.service';
import { PrismaService } from '../prisma/prisma.service';

/** A chunk retrieved by similarity search, with its source document. */
export interface RetrievedChunk {
  chunkId: string;
  documentId: string;
  filename: string;
  ordinal: number;
  pageNumber: number | null;
  /** What the passage was extracted from: body text, a table, a chart, a scan. */
  kind: ChunkKind;
  /** Storage key of the source chart/image, for IMAGE chunks only. */
  imageKey: string | null;
  content: string;
  /** Cosine similarity in [0,1]; higher is more relevant. */
  score: number;
}

/** Optional scope narrowing for a retrieval. Workspace is NOT here — it is a
 * mandatory, separate argument so tenant isolation can never be forgotten. */
export interface RetrievalFilters {
  collectionId?: string | null;
  documentId?: string | null;
}

/**
 * The "retrieval" half of RAG: turn a question into the most relevant chunks
 * for a workspace, optionally narrowed to one collection or document, via
 * pgvector nearest-neighbour search.
 *
 * The `embedding` column is `Unsupported("vector(1536)")`, so Prisma can't read
 * it — we use raw SQL with a parameterized `'[...]'::vector` literal, mirroring
 * how IngestionService writes it.
 */
@Injectable()
export class RetrievalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly embedding: EmbeddingService,
  ) {}

  /** Embed the question and fetch the top-K most similar chunks. */
  async retrieve(
    workspaceId: string,
    filters: RetrievalFilters,
    question: string,
    topK: number,
  ): Promise<RetrievedChunk[]> {
    const vector = await this.embedding.embedOne(question);
    const literal = `[${vector.join(',')}]`;

    // Tenant isolation lives in the mandatory workspace predicate below. These
    // optional filters can only ever NARROW that scope, never widen it.
    const collectionFilter = filters.collectionId
      ? Prisma.sql`AND d."collectionId" = ${filters.collectionId}`
      : Prisma.empty;
    const documentFilter = filters.documentId
      ? Prisma.sql`AND d."id" = ${filters.documentId}`
      : Prisma.empty;

    const rows = await this.prisma.$queryRaw<
      Array<{
        chunkId: string;
        documentId: string;
        filename: string;
        ordinal: number;
        pageNumber: number | null;
        kind: ChunkKind;
        imageKey: string | null;
        content: string;
        distance: number;
      }>
    >(Prisma.sql`
      SELECT c.id                       AS "chunkId",
             c."documentId"             AS "documentId",
             d.filename                 AS "filename",
             c.ordinal                  AS "ordinal",
             c."pageNumber"             AS "pageNumber",
             c.kind                     AS "kind",
             c."imageKey"               AS "imageKey",
             c.content                  AS "content",
             (c.embedding <=> ${literal}::vector) AS "distance"
        FROM "Chunk" c
        JOIN "Document" d ON d.id = c."documentId"
       WHERE d."workspaceId" = ${workspaceId}
         AND c.embedding IS NOT NULL
         ${collectionFilter}
         ${documentFilter}
       ORDER BY c.embedding <=> ${literal}::vector
       LIMIT ${topK}
    `);

    return rows.map((r) => ({
      chunkId: r.chunkId,
      documentId: r.documentId,
      filename: r.filename,
      ordinal: r.ordinal,
      pageNumber: r.pageNumber,
      kind: r.kind,
      imageKey: r.imageKey,
      content: r.content,
      // cosine distance ∈ [0,2]; similarity = 1 - distance for normalized vectors.
      score: 1 - Number(r.distance),
    }));
  }
}
