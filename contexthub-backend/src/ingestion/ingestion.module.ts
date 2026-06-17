import { Module } from '@nestjs/common';
import { ChunkerService } from './chunker.service';
import { IngestionService } from './ingestion.service';
import { IngestionWorker } from './ingestion.worker';
import { ParserService } from './parser.service';

/**
 * Ingestion pipeline. Depends on the global EmbeddingModule (embeddings),
 * StorageModule (file bytes), PrismaModule (DB) and JobModule (queue).
 */
@Module({
  providers: [ParserService, ChunkerService, IngestionService, IngestionWorker],
  exports: [IngestionService],
})
export class IngestionModule {}
