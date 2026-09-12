import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  Logger,
  Param,
  Patch,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
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
  private readonly logger = new Logger(ChatController.name);

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
  list(@Param('id') workspaceId: string, @CurrentUser() user: { id: string }) {
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
    return this.conversations.listMessages(
      workspaceId,
      user.id,
      conversationId,
    );
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

  /**
   * The same question, streamed as Server-Sent Events.
   *
   * POST rather than GET because the question (and up to four base64 images)
   * belongs in a body, which also rules out `EventSource` on the client — it
   * cannot POST or send an Authorization header. The frontend reads the
   * response body as a stream instead, so this hand-writes SSE frames rather
   * than using Nest's `@Sse()` decorator.
   *
   * Frames are `data: {"type":"delta"|"done"|"error", …}`.
   */
  @Post(':conversationId/messages/stream')
  async askStream(
    @Param('id') workspaceId: string,
    @Param('conversationId') conversationId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: AskDto,
    @Res() res: Response,
  ): Promise<void> {
    res.set({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Tell nginx not to buffer, which would defeat the whole point.
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();

    const send = (event: unknown) => {
      // The client may have navigated away mid-answer. Generation continues so
      // the message is still saved, but there is nowhere left to write it.
      if (res.writableEnded) return;
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    try {
      const stream = this.chat.askStream(
        workspaceId,
        user.id,
        conversationId,
        dto,
      );
      for await (const event of stream) {
        send(event);
      }
    } catch (err) {
      // Headers are already sent, so AllExceptionsFilter cannot shape this into
      // a JSON error response — it has to travel as a frame instead. That means
      // reproducing the parts of the JSON contract clients branch on, `code`
      // and `details`, or a refusal the UI knows how to explain (an exhausted
      // allowance) arrives looking like a generic failure.
      const status = err instanceof HttpException ? err.getStatus() : 500;
      const message =
        err instanceof HttpException
          ? err.message
          : 'Something went wrong generating the answer.';

      const payload = err instanceof HttpException ? err.getResponse() : null;
      const shaped =
        payload && typeof payload === 'object'
          ? (payload as { code?: string; details?: unknown })
          : {};

      this.logger.error(
        `Stream failed for conversation ${conversationId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
        err instanceof Error ? err.stack : undefined,
      );
      send({
        type: 'error',
        statusCode: status,
        message,
        ...(shaped.code ? { code: shaped.code } : {}),
        ...(shaped.details !== undefined ? { details: shaped.details } : {}),
      });
    } finally {
      res.end();
    }
  }

  @Patch(':conversationId')
  update(
    @Param('id') workspaceId: string,
    @Param('conversationId') conversationId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateConversationDto,
  ) {
    return this.conversations.update(workspaceId, user.id, conversationId, dto);
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
