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
import { Role } from '../../generated/prisma/client';
import { Roles } from '../workspace/decorators/roles.decorator';
import { WorkspaceGuard } from '../workspace/guards/workspace.guard';
import { CollectionService } from './collection.service';
import { CreateCollectionDto } from './dto/create-collection.dto';
import { UpdateCollectionDto } from './dto/update-collection.dto';

@UseGuards(WorkspaceGuard)
@Controller('workspaces/:id/collections')
export class CollectionController {
  constructor(private readonly collections: CollectionService) {}

  @Post()
  create(
    @Param('id') workspaceId: string,
    @Body() dto: CreateCollectionDto,
  ) {
    return this.collections.create(workspaceId, dto);
  }

  @Get()
  list(@Param('id') workspaceId: string) {
    return this.collections.list(workspaceId);
  }

  @Get(':collectionId')
  getById(
    @Param('id') workspaceId: string,
    @Param('collectionId') collectionId: string,
  ) {
    return this.collections.getById(workspaceId, collectionId);
  }

  @Roles(Role.OWNER, Role.ADMIN)
  @Patch(':collectionId')
  update(
    @Param('id') workspaceId: string,
    @Param('collectionId') collectionId: string,
    @Body() dto: UpdateCollectionDto,
  ) {
    return this.collections.update(workspaceId, collectionId, dto);
  }

  @Roles(Role.OWNER, Role.ADMIN)
  @Delete(':collectionId')
  remove(
    @Param('id') workspaceId: string,
    @Param('collectionId') collectionId: string,
  ) {
    return this.collections.remove(workspaceId, collectionId);
  }
}
