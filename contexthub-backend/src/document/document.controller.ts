import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { Role } from '../../generated/prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../workspace/decorators/roles.decorator';
import { WorkspaceGuard } from '../workspace/guards/workspace.guard';
import { DocumentService } from './document.service';
import { ListDocumentsQueryDto } from './dto/list-documents.query';
import type { UploadedFileLike } from './dto/uploaded-file';

@UseGuards(WorkspaceGuard)
@Controller('workspaces/:id/collections/:collectionId/documents')
export class DocumentController {
  constructor(private readonly documents: DocumentService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @Param('id') workspaceId: string,
    @Param('collectionId') collectionId: string,
    @CurrentUser() user: { id: string },
    @UploadedFile() file: UploadedFileLike,
  ) {
    return this.documents.create(workspaceId, collectionId, user.id, file);
  }

  @Get()
  list(
    @Param('id') workspaceId: string,
    @Param('collectionId') collectionId: string,
    @Query() query: ListDocumentsQueryDto,
  ) {
    return this.documents.list(workspaceId, collectionId, query.status);
  }

  @Get(':documentId')
  getById(
    @Param('id') workspaceId: string,
    @Param('documentId') documentId: string,
  ) {
    return this.documents.getById(workspaceId, documentId);
  }

  @Get(':documentId/download')
  async download(
    @Param('id') workspaceId: string,
    @Param('documentId') documentId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { filename, mimeType, stream } = await this.documents.download(
      workspaceId,
      documentId,
    );

    res.set({
      'Content-Type': mimeType,
      'Content-Disposition': `attachment; filename="${filename}"`,
    });

    return new StreamableFile(stream);
  }

  @Roles(Role.OWNER, Role.ADMIN)
  @Delete(':documentId')
  remove(
    @Param('id') workspaceId: string,
    @Param('documentId') documentId: string,
  ) {
    return this.documents.remove(workspaceId, documentId);
  }
}
