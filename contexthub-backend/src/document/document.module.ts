import { Module } from '@nestjs/common';
import { CollectionModule } from '../collection/collection.module';
import { WorkspaceGuard } from '../workspace/guards/workspace.guard';
import { ChunkController } from './chunk.controller';
import { DocumentController } from './document.controller';
import { DocumentService } from './document.service';

@Module({
  imports: [CollectionModule],
  controllers: [DocumentController, ChunkController],
  providers: [DocumentService, WorkspaceGuard],
  exports: [DocumentService],
})
export class DocumentModule {}
