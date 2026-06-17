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

    // Kick off the background ingestion pipeline (parse → chunk → embed).
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
    status?: DocStatus,
  ) {
    await this.collections.getById(workspaceId, collectionId);

    return this.prisma.document.findMany({
      where: { workspaceId, collectionId, ...(status ? { status } : {}) },
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

    await this.prisma.document.delete({ where: { id: document.id } });
    await this.storage.remove(document.storageKey);

    return { success: true };
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
