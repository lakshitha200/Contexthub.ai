import { Module } from '@nestjs/common';
import { WorkspaceGuard } from '../workspace/guards/workspace.guard';
import { CollectionController } from './collection.controller';
import { CollectionService } from './collection.service';

@Module({
  controllers: [CollectionController],
  providers: [CollectionService, WorkspaceGuard],
  exports: [CollectionService],
})
export class CollectionModule {}
