import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { WorkspaceGuard } from '../workspace/guards/workspace.guard';
import { ChatService } from './chat.service';
import { ConversationService } from './conversation.service';
import { AskDto } from './dto/ask.dto';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';

@UseGuards(WorkspaceGuard)
@Controller('workspaces/:id/conversations')
export class ChatController {
  constructor(
    private readonly conversations: ConversationService,
    private readonly chat: ChatService,
  ) {}

  @Post()
  create(
    @Param('id') workspaceId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: CreateConversationDto,
  ) {
    return this.conversations.create(workspaceId, user.id, dto);
  }

  @Get()
  list(
    @Param('id') workspaceId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.conversations.list(workspaceId, user.id);
  }

  @Get(':conversationId')
  getById(
    @Param('id') workspaceId: string,
    @Param('conversationId') conversationId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.conversations.getWithMessages(
      workspaceId,
      user.id,
      conversationId,
    );
  }

  @Get(':conversationId/messages')
  listMessages(
    @Param('id') workspaceId: string,
    @Param('conversationId') conversationId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.conversations.listMessages(workspaceId, user.id, conversationId);
  }

  /** Ask a question — runs the RAG pipeline and returns the cited answer. */
  @Post(':conversationId/messages')
  ask(
    @Param('id') workspaceId: string,
    @Param('conversationId') conversationId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: AskDto,
  ) {
    return this.chat.ask(workspaceId, user.id, conversationId, dto);
  }

  @Patch(':conversationId')
  update(
    @Param('id') workspaceId: string,
    @Param('conversationId') conversationId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateConversationDto,
  ) {
    return this.conversations.update(
      workspaceId,
      user.id,
      conversationId,
      dto,
    );
  }

  @Delete(':conversationId')
  remove(
    @Param('id') workspaceId: string,
    @Param('conversationId') conversationId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.conversations.remove(workspaceId, user.id, conversationId);
  }
}
