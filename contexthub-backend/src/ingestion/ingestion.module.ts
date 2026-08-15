import { Module } from '@nestjs/common';
import { ChunkerService } from './chunker.service';
import { IngestionService } from './ingestion.service';
import { IngestionWorker } from './ingestion.worker';
import { ParserService } from './parser.service';
import { VisionService } from './vision.service';

/**
 * Ingestion pipeline. Depends on the global EmbeddingModule (embeddings),
 * StorageModule (file bytes), PrismaModule (DB) and JobModule (queue).
 *
 * VisionService is local to this module: it calls the same Gemini model as
 * ChatModule's LlmService, but ingestion shouldn't have to import ChatModule
 * to read a chart.
 */
@Module({
  providers: [
    ParserService,
    ChunkerService,
    VisionService,
    IngestionService,
    IngestionWorker,
  ],
  exports: [IngestionService],
})
export class IngestionModule {}
