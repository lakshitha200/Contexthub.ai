import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DocStatus } from '../../generated/prisma/client';
import { EmbeddingService } from '../embedding/embedding.service';
import { PrismaService } from '../prisma/prisma.service';
import { ChunkerService, type TextChunk } from './chunker.service';
import { ParserService } from './parser.service';

/**
 * Orchestrates the ingestion pipeline for a single document, as an explicit
 * state machine:
 *
 *   PARSING → CHUNKING → EMBEDDING → READY   (or FAILED on any error)
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
  ) {}

  async process(documentId: string): Promise<void> {
    const doc = await this.prisma.document.findUniqueOrThrow({
      where: { id: documentId },
    });

    const started = Date.now();
    try {
      await this.setStatus(doc.id, DocStatus.PARSING);
      const text = await this.parser.parse(doc);

      await this.setStatus(doc.id, DocStatus.CHUNKING);
      const chunks = this.chunker.split(text);
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

      await this.replaceChunks(doc.id, chunks, vectors);
      await this.setStatus(doc.id, DocStatus.READY);

      this.logger.log(
        `Ingested ${doc.id} (${doc.filename}): ${chunks.length} chunks in ${
          Date.now() - started
        }ms`,
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
    chunks: TextChunk[],
    vectors: number[][],
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.chunk.deleteMany({ where: { documentId } });

      for (let i = 0; i < chunks.length; i++) {
        const c = chunks[i];
        const literal = `[${vectors[i].join(',')}]`;
        await tx.$executeRaw`
          INSERT INTO "Chunk"
            (id, "documentId", ordinal, content, "tokenCount",
             "startOffset", "endOffset", embedding, "createdAt")
          VALUES
            (${randomUUID()}, ${documentId}, ${c.ordinal}, ${c.content},
             ${c.tokenCount}, ${c.startOffset}, ${c.endOffset},
             ${literal}::vector, now())`;
      }
    });
  }
}
