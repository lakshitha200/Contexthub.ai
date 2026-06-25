import { Injectable, NotFoundException } from '@nestjs/common';
import {
  MessageRole,
  Prisma,
  type Conversation,
} from '../../generated/prisma/client';
import { CollectionService } from '../collection/collection.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';

/**
 * CRUD for conversations and their messages. Conversations are private to the
 * user that started them within a workspace, so every lookup is scoped by
 * `workspaceId + userId` — a conversation id from another user/workspace
 * returns 404 (tenant + owner isolation), never the record.
 */
@Injectable()
export class ConversationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly collections: CollectionService,
  ) {}

  async create(workspaceId: string, userId: string, dto: CreateConversationDto) {
    // If scoped to a collection, ensure it actually belongs to this workspace.
    if (dto.collectionId) {
      await this.collections.getById(workspaceId, dto.collectionId);
    }

    return this.prisma.conversation.create({
      data: {
        workspaceId,
        userId,
        collectionId: dto.collectionId ?? null,
        title: dto.title?.trim() || 'New conversation',
      },
    });
  }

  async list(workspaceId: string, userId: string) {
    return this.prisma.conversation.findMany({
      where: { workspaceId, userId },
      orderBy: [{ pinned: 'desc' }, { updatedAt: 'desc' }],
      include: { _count: { select: { messages: true } } },
    });
  }

  /** A conversation with its full message history, oldest first. */
  async getWithMessages(workspaceId: string, userId: string, id: string) {
    await this.getOwnedOrThrow(workspaceId, userId, id);
    return this.prisma.conversation.findUnique({
      where: { id },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
  }

  async listMessages(workspaceId: string, userId: string, id: string) {
    await this.getOwnedOrThrow(workspaceId, userId, id);
    return this.prisma.message.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: 'asc' },
    });
  }

  async update(
    workspaceId: string,
    userId: string,
    id: string,
    dto: UpdateConversationDto,
  ) {
    await this.getOwnedOrThrow(workspaceId, userId, id);
    return this.prisma.conversation.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.pinned !== undefined ? { pinned: dto.pinned } : {}),
      },
    });
  }

  async remove(workspaceId: string, userId: string, id: string) {
    await this.getOwnedOrThrow(workspaceId, userId, id);
    await this.prisma.conversation.delete({ where: { id } });
    return { success: true };
  }

  /** Persist one message and bump the conversation's `updatedAt`. */
  async addMessage(
    conversationId: string,
    role: MessageRole,
    content: string,
    citations?: Prisma.InputJsonValue,
  ) {
    const [message] = await this.prisma.$transaction([
      this.prisma.message.create({
        data: {
          conversationId,
          role,
          content,
          ...(citations !== undefined ? { citations } : {}),
        },
      }),
      this.prisma.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      }),
    ]);
    return message;
  }

  /** Loaded conversation, guaranteed to belong to this workspace + user. */
  async getOwnedOrThrow(
    workspaceId: string,
    userId: string,
    id: string,
  ): Promise<Conversation> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
    });

    if (
      !conversation ||
      conversation.workspaceId !== workspaceId ||
      conversation.userId !== userId
    ) {
      throw new NotFoundException('Conversation not found in this workspace');
    }

    return conversation;
  }
}
