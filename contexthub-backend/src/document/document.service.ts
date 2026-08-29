import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocStatus } from '../../generated/prisma/client';
import { CollectionService } from '../collection/collection.service';
import { JobService } from '../jobs/job.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { ListDocumentsQueryDto } from './dto/list-documents.query';
import { UploadedFileLike } from './dto/uploaded-file';

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/html',
  'text/csv',
  'application/json',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  // Images are ingested by describing/transcribing them with the vision model,
  // so a screenshot or a photo of a whiteboard becomes searchable text.
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);

@Injectable()
export class DocumentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly collections: CollectionService,
    private readonly config: ConfigService,
    private readonly jobs: JobService,
  ) {}

  async create(
    workspaceId: string,
    collectionId: string,
    uploaderId: string,
    file: UploadedFileLike | undefined,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    // Throws 404 if the collection is not in this workspace.
    await this.collections.getById(workspaceId, collectionId);
    this.validateFile(file);

    const storageKey = await this.storage.save(
      workspaceId,
      file.originalname,
      file.buffer,
    );

    const document = await this.prisma.document.create({
      data: {
        workspaceId,
        collectionId,
        uploaderId,
        filename: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        storageKey,
        status: DocStatus.UPLOADED,
      },
    });

    // Kick off the background ingestion pipeline (parse → chunk → analyse → embed).
    await this.jobs.enqueue('ingest', { documentId: document.id });

    return document;
  }

  /** Re-run ingestion for a document (e.g. after a FAILED parse). */
  async reprocess(workspaceId: string, documentId: string) {
    const document = await this.getOwnedOrThrow(workspaceId, documentId);
    await this.jobs.enqueue('ingest', { documentId: document.id });
    return { success: true };
  }

  async list(
    workspaceId: string,
    collectionId: string,
    filters: ListDocumentsQueryDto = {},
  ) {
    await this.collections.getById(workspaceId, collectionId);

    const { status, docType, topic } = filters;

    return this.prisma.document.findMany({
      where: {
        workspaceId,
        collectionId,
        ...(status ? { status } : {}),
        ...(docType ? { docType } : {}),
        // `has` compiles to `= ANY("topics")` — topics are stored lowercase and
        // the DTO lowercases the query, so the match is case-insensitive.
        ...(topic ? { topics: { has: topic } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        uploader: { select: { id: true, name: true, email: true } },
        _count: { select: { chunks: true } },
      },
    });
  }

  async getById(workspaceId: string, documentId: string) {
    return this.getOwnedOrThrow(workspaceId, documentId);
  }

  async download(workspaceId: string, documentId: string) {
    const document = await this.getOwnedOrThrow(workspaceId, documentId);

    if (!(await this.storage.exists(document.storageKey))) {
      throw new NotFoundException('Stored file is missing');
    }

    return {
      filename: document.filename,
      mimeType: document.mimeType,
      stream: this.storage.createReadStream(document.storageKey),
    };
  }

  async remove(workspaceId: string, documentId: string) {
    const document = await this.getOwnedOrThrow(workspaceId, documentId);

    // Images extracted from this document during ingestion live under their own
    // storage keys. Collect them before the cascade deletes the chunk rows,
    // otherwise the files are stranded on disk with nothing pointing at them.
    const imageKeys = await this.extractedImageKeys(document.id);

    await this.prisma.document.delete({ where: { id: document.id } });
    await this.storage.remove(document.storageKey);

    for (const key of imageKeys) {
      if (key === document.storageKey) continue; // already removed above
      await this.storage.remove(key);
    }

    return { success: true };
  }

  /**
   * Stream the image a chunk was derived from (a chart or diagram extracted
   * during ingestion). Authorization goes chunk → document → workspace, so a
   * chunk id from another tenant 404s; the storage key is never accepted from
   * the client, which keeps it out of reach of path traversal.
   */
  async chunkImage(workspaceId: string, chunkId: string) {
    const chunk = await this.prisma.chunk.findUnique({
      where: { id: chunkId },
      select: { imageKey: true, document: { select: { workspaceId: true } } },
    });

    if (!chunk || chunk.document.workspaceId !== workspaceId) {
      throw new NotFoundException('Chunk not found in this workspace');
    }
    if (!chunk.imageKey) {
      throw new NotFoundException('This chunk has no source image');
    }
    if (!(await this.storage.exists(chunk.imageKey))) {
      throw new NotFoundException('Stored image is missing');
    }

    return {
      mimeType: mimeTypeForKey(chunk.imageKey),
      stream: this.storage.createReadStream(chunk.imageKey),
    };
  }

  /** Storage keys of the chart/page images ingestion pulled out of a document. */
  private async extractedImageKeys(documentId: string): Promise<string[]> {
    const rows = await this.prisma.chunk.findMany({
      where: { documentId, imageKey: { not: null } },
      select: { imageKey: true },
    });

    return [
      ...new Set(rows.map((r) => r.imageKey).filter((k): k is string => !!k)),
    ];
  }

  private async getOwnedOrThrow(workspaceId: string, documentId: string) {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!document || document.workspaceId !== workspaceId) {
      throw new NotFoundException('Document not found in this workspace');
    }

    return document;
  }

  private validateFile(file: UploadedFileLike) {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException(
        `Unsupported file type: ${file.mimetype}`,
      );
    }

    const maxBytes = this.maxUploadMb() * 1024 * 1024;
    if (file.size > maxBytes) {
      throw new BadRequestException(
        `File exceeds the ${this.maxUploadMb()} MB limit`,
      );
    }
  }

  private maxUploadMb(): number {
    return Number(this.config.get<string>('MAX_UPLOAD_MB', '25'));
  }
}

/** Extracted images are written with a real extension, so the name is enough. */
function mimeTypeForKey(storageKey: string): string {
  const ext = storageKey.slice(storageKey.lastIndexOf('.') + 1).toLowerCase();
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    default:
      return 'image/png';
  }
}
