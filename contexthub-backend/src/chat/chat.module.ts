import { Module } from '@nestjs/common';
import { CollectionModule } from '../collection/collection.module';
import { WorkspaceGuard } from '../workspace/guards/workspace.guard';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ConversationService } from './conversation.service';
import { LlmService } from './llm.service';
import { RetrievalService } from './retrieval.service';

/**
 * Module 6 — Chat / RAG. Consumes the chunks Module 5 produced: embed a
 * question, retrieve the closest chunks (pgvector), ask the LLM, and persist a
 * cited answer. Depends on the global EmbeddingModule + PrismaModule, and on
 * CollectionModule for collection-scope validation.
 */
@Module({
  imports: [CollectionModule],
  controllers: [ChatController],
  providers: [
    ConversationService,
    RetrievalService,
    LlmService,
    ChatService,
    WorkspaceGuard,
  ],
  exports: [ConversationService],
})
export class ChatModule {}
