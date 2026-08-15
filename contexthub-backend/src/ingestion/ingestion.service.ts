import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DocStatus } from '../../generated/prisma/client';
import { EmbeddingService } from '../embedding/embedding.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { ChunkerService, type DocumentChunk } from './chunker.service';
import { ParserService } from './parser.service';

/**
 * Orchestrates the ingestion pipeline for a single document, as an explicit
 * state machine:
 *
 *   PARSING → CHUNKING → EMBEDDING → READY   (or FAILED on any error)
 *
 * PARSING is the multimodal step: text, tables, OCR of scanned pages, and
 * vision descriptions of charts all come back as text blocks, so CHUNKING and
 * EMBEDDING stay unaware that any of it started as pixels.
 *
 * Idempotent: re-running deletes existing chunks first, so retries / manual
 * reprocess never produce duplicates.
 */
@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly parser: ParserService,
    private readonly chunker: ChunkerService,
    private readonly embedding: EmbeddingService,
    private readonly storage: StorageService,
  ) {}

  async process(documentId: string): Promise<void> {
    const doc = await this.prisma.document.findUniqueOrThrow({
      where: { id: documentId },
    });

    const started = Date.now();
    try {
      await this.setStatus(doc.id, DocStatus.PARSING);
      const blocks = await this.parser.parse(doc);

      await this.setStatus(doc.id, DocStatus.CHUNKING);
      const chunks = this.chunker.splitBlocks(blocks);
      if (chunks.length === 0) {
        throw new Error('Chunker produced no chunks');
      }

      await this.setStatus(doc.id, DocStatus.EMBEDDING);
      const vectors = await this.embedding.embed(chunks.map((c) => c.content));
      if (vectors.length !== chunks.length) {
        throw new Error(
          `Embedding count mismatch: ${chunks.length} chunks, ${vectors.length} vectors`,
        );
      }

      await this.replaceChunks(doc.id, doc.storageKey, chunks, vectors);
      await this.setStatus(doc.id, DocStatus.READY);

      this.logger.log(
        `Ingested ${doc.id} (${doc.filename}): ${chunks.length} chunks ` +
          `[${summarizeKinds(chunks)}] in ${Date.now() - started}ms`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.failDocument(doc.id, message);
      this.logger.error(`Ingest failed for ${doc.id}: ${message}`);
      throw err; // let the worker count the attempt / decide on retry
    }
  }

  private async setStatus(id: string, status: DocStatus): Promise<void> {
    await this.prisma.document.update({ where: { id }, data: { status } });
  }

  private async failDocument(id: string, message: string): Promise<void> {
    await this.prisma.document.update({
      where: { id },
      data: { status: DocStatus.FAILED, errorMessage: message.slice(0, 1000) },
    });
  }

  /**
   * Replace all chunks for a document in one transaction. The `embedding`
   * column is `Unsupported("vector(1536)")` so Prisma can't write it — we use
   * raw SQL with a parameterized `'[...]'::vector` literal.
   */
  private async replaceChunks(
    documentId: string,
    documentStorageKey: string,
    chunks: DocumentChunk[],
    vectors: number[][],
  ): Promise<void> {
    // Images extracted by a previous run are about to be orphaned; capture
    // their keys before the rows go away so the files can be cleaned up after.
    const previous = await this.prisma.chunk.findMany({
      where: { documentId, imageKey: { not: null } },
      select: { imageKey: true },
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.chunk.deleteMany({ where: { documentId } });

      for (let i = 0; i < chunks.length; i++) {
        const c = chunks[i];
        const literal = `[${vectors[i].join(',')}]`;
        await tx.$executeRaw`
          INSERT INTO "Chunk"
            (id, "documentId", ordinal, content, "tokenCount", kind,
             "pageNumber", "imageKey", "startOffset", "endOffset",
             embedding, "createdAt")
          VALUES
            (${randomUUID()}, ${documentId}, ${c.ordinal}, ${c.content},
             ${c.tokenCount}, ${c.kind}::"ChunkKind", ${c.pageNumber},
             ${c.imageKey}, ${c.startOffset}, ${c.endOffset},
             ${literal}::vector, now())`;
      }
    });

    await this.removeOrphanedImages(
      previous.map((p) => p.imageKey),
      chunks,
      documentStorageKey,
    );
  }

  /**
   * Delete extracted image files that the new chunk set no longer references.
   * The document's own upload is never touched — for a standalone image upload
   * the chunk's imageKey IS the original file.
   */
  private async removeOrphanedImages(
    previousKeys: Array<string | null>,
    chunks: DocumentChunk[],
    documentStorageKey: string,
  ): Promise<void> {
    const stillUsed = new Set(
      chunks.map((c) => c.imageKey).filter((k): k is string => k !== null),
    );

    const orphans = previousKeys.filter(
      (key): key is string =>
        key !== null && key !== documentStorageKey && !stillUsed.has(key),
    );

    for (const key of new Set(orphans)) {
      try {
        await this.storage.remove(key);
      } catch (err) {
        // Cleanup is best-effort: a stale file is not worth failing an
        // otherwise successful ingest over.
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Could not remove orphaned image ${key}: ${message}`);
      }
    }
  }
}

/** e.g. "12 TEXT, 3 TABLE, 2 IMAGE" — makes the multimodal work visible in logs. */
function summarizeKinds(chunks: DocumentChunk[]): string {
  const counts = new Map<string, number>();
  for (const c of chunks) counts.set(c.kind, (counts.get(c.kind) ?? 0) + 1);
  return [...counts.entries()].map(([kind, n]) => `${n} ${kind}`).join(', ');
}
