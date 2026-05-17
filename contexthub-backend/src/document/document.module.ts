import { Module } from '@nestjs/common';
import { CollectionModule } from '../collection/collection.module';
import { WorkspaceGuard } from '../workspace/guards/workspace.guard';
import { DocumentController } from './document.controller';
import { DocumentService } from './document.service';

@Module({
  imports: [CollectionModule],
  controllers: [DocumentController],
  providers: [DocumentService, WorkspaceGuard],
  exports: [DocumentService],
})
export class DocumentModule {}
