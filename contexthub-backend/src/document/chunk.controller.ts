import {
  Controller,
  Get,
  Param,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { WorkspaceGuard } from '../workspace/guards/workspace.guard';
import { DocumentService } from './document.service';

/**
 * Chunk-level reads. Separate from DocumentController because a chunk is
 * addressed by id alone — the caller (a citation in a chat answer) knows the
 * chunk, not which collection its document lives in.
 */
@UseGuards(WorkspaceGuard)
@Controller('workspaces/:id/chunks')
export class ChunkController {
  constructor(private readonly documents: DocumentService) {}

  /** The chart/diagram an IMAGE citation was derived from. */
  @Get(':chunkId/image')
  async image(
    @Param('id') workspaceId: string,
    @Param('chunkId') chunkId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { mimeType, stream } = await this.documents.chunkImage(
      workspaceId,
      chunkId,
    );

    res.set({
      'Content-Type': mimeType,
      // Extracted images are immutable once ingested — safe to cache hard.
      'Cache-Control': 'private, max-age=31536000, immutable',
    });

    return new StreamableFile(stream);
  }
}
