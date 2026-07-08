import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { createReadStream, type ReadStream } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

/**
 * Local filesystem storage. The service is intentionally narrow
 * (save / createReadStream / remove) so it can later be swapped for
 * S3/GCS without touching callers — only the `storageKey` contract matters.
 */
@Injectable()
export class StorageService {
  private readonly baseDir: string;

  constructor(private readonly config: ConfigService) {
    this.baseDir = resolve(
      this.config.get<string>('STORAGE_DIR', './storage'),
    );
  }

  /** Persists a buffer and returns the opaque storage key to record. */
  async save(
    workspaceId: string,
    originalName: string,
    buffer: Buffer,
  ): Promise<string> {
    const safeName = this.sanitize(originalName);
    const storageKey = `workspaces/${workspaceId}/${randomUUID()}-${safeName}`;
    const absPath = this.toAbsolute(storageKey);

    await mkdir(dirname(absPath), { recursive: true });
    await writeFile(absPath, buffer);

    return storageKey;
  }

  createReadStream(storageKey: string): ReadStream {
    return createReadStream(this.toAbsolute(storageKey));
  }

  async exists(storageKey: string): Promise<boolean> {
    try {
      await stat(this.toAbsolute(storageKey));
      return true;
    } catch {
      return false;
    }
  }

  async remove(storageKey: string): Promise<void> {
    await rm(this.toAbsolute(storageKey), { force: true });
  }

  /** Resolves a key under the base dir and guards against path traversal. */
  private toAbsolute(storageKey: string): string {
    const absPath = resolve(join(this.baseDir, storageKey));
    if (absPath !== this.baseDir && !absPath.startsWith(this.baseDir)) {
      throw new NotFoundException('Invalid storage key');
    }
    return absPath;
  }

  private sanitize(name: string): string {
    return (
      name
        .replace(/[^a-zA-Z0-9._-]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 120) || 'file'
    );
  }
}
