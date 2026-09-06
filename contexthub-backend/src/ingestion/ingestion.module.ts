import { Module } from '@nestjs/common';
import { AnalysisService } from './analysis.service';
import { ChunkerService } from './chunker.service';
import { IngestionService } from './ingestion.service';
import { IngestionWorker } from './ingestion.worker';
import { ParserService } from './parser.service';
import { VisionService } from './vision.service';

/**
 * Ingestion pipeline. Depends on the global EmbeddingModule (embeddings),
 * StorageModule (file bytes), PrismaModule (DB) and JobModule (queue).
 *
 * VisionService and AnalysisService are local to this module: both call the
 * same Gemini model as ChatModule's LlmService, but ingestion shouldn't have to
 * import ChatModule to read a chart or summarise a file.
 */
@Module({
  providers: [
    ParserService,
    ChunkerService,
    VisionService,
    AnalysisService,
    IngestionService,
    IngestionWorker,
  ],
  exports: [IngestionService],
})
export class IngestionModule {}
