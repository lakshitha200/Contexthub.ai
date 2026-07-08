import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCollectionDto } from './dto/create-collection.dto';
import { UpdateCollectionDto } from './dto/update-collection.dto';

@Injectable()
export class CollectionService {
  constructor(private readonly prisma: PrismaService) {}

  async create(workspaceId: string, dto: CreateCollectionDto) {
    return this.prisma.collection.create({
      data: { workspaceId, name: dto.name },
      include: {
        _count: { select: { documents: true, conversations: true } },
      },
    });
  }

  async list(workspaceId: string) {
    return this.prisma.collection.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { documents: true, conversations: true } },
      },
    });
  }

  async getById(workspaceId: string, collectionId: string) {
    return this.getOwnedOrThrow(workspaceId, collectionId, {
      _count: { select: { documents: true, conversations: true } },
    });
  }

  async update(
    workspaceId: string,
    collectionId: string,
    dto: UpdateCollectionDto,
  ) {
    await this.getOwnedOrThrow(workspaceId, collectionId);

    return this.prisma.collection.update({
      where: { id: collectionId },
      data: { name: dto.name },
      include: {
        _count: { select: { documents: true, conversations: true } },
      },
    });
  }

  async remove(workspaceId: string, collectionId: string) {
    await this.getOwnedOrThrow(workspaceId, collectionId);
    await this.prisma.collection.delete({ where: { id: collectionId } });
    return { success: true };
  }

  private async getOwnedOrThrow(
    workspaceId: string,
    collectionId: string,
    include?: { _count: { select: { documents: true; conversations: true } } },
  ) {
    const collection = await this.prisma.collection.findUnique({
      where: { id: collectionId },
      ...(include ? { include } : {}),
    });

    if (!collection || collection.workspaceId !== workspaceId) {
      throw new NotFoundException('Collection not found in this workspace');
    }

    return collection;
  }
}
