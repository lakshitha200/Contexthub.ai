import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import type { Readable } from 'node:stream';
import { LocalStorageDriver } from './local.driver';
import { R2StorageDriver } from './r2.driver';
import type { StorageDriver } from './storage.driver';

/**
 * Where document bytes live, and the only part of the app that knows.
 *
 * Callers hold the opaque `storageKey` this returns and nothing else, so the
 * backing store is a configuration choice rather than a code change.
 *
 * Two drivers ship: local disk for development, and Cloudflare R2 for anywhere
 * the filesystem does not survive a restart, which is most container hosts. The
 * default stays local so a fresh checkout runs with no credentials.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly driver: StorageDriver;

  constructor(private readonly config: ConfigService) {
    this.driver = this.createDriver();
  }

  /** Persists a buffer and returns the opaque storage key to record. */
  async save(
    workspaceId: string,
    originalName: string,
    buffer: Buffer,
    contentType?: string,
  ): Promise<string> {
    const safeName = this.sanitize(originalName);
    // The uuid keeps two uploads of the same filename apart, and means a key
    // can never be guessed from the document name alone.
    const storageKey = `workspaces/${workspaceId}/${randomUUID()}-${safeName}`;

    await this.driver.save(storageKey, buffer, contentType);
    return storageKey;
  }

  /**
   * Open a stored object for reading.
   *
   * Async because an object store has to be asked over the network. The local
   * driver could return a stream synchronously, but a signature shaped around
   * the cheaper case would have to break the moment the other one is used.
   */
  createReadStream(storageKey: string): Promise<Readable> {
    return this.driver.read(storageKey);
  }

  exists(storageKey: string): Promise<boolean> {
    return this.driver.exists(storageKey);
  }

  remove(storageKey: string): Promise<void> {
    return this.driver.remove(storageKey);
  }

  /**
   * Pick a driver from configuration.
   *
   * R2 is selected explicitly, and misconfiguration throws at startup rather
   * than on the first upload. A server that boots "fine" and then loses every
   * document is far worse than one that refuses to boot.
   */
  private createDriver(): StorageDriver {
    const driver = (
      this.config.get<string>('STORAGE_DRIVER', 'local') ?? 'local'
    ).toLowerCase();

    if (driver === 'r2') {
      const accountId = this.config.get<string>('R2_ACCOUNT_ID');
      const accessKeyId = this.config.get<string>('R2_ACCESS_KEY_ID');
      const secretAccessKey = this.config.get<string>('R2_SECRET_ACCESS_KEY');
      const bucket = this.config.get<string>('R2_BUCKET');

      const missing = [
        ['R2_ACCOUNT_ID', accountId],
        ['R2_ACCESS_KEY_ID', accessKeyId],
        ['R2_SECRET_ACCESS_KEY', secretAccessKey],
        ['R2_BUCKET', bucket],
      ]
        .filter(([, value]) => !value)
        .map(([name]) => name);

      if (missing.length > 0) {
        throw new Error(
          `STORAGE_DRIVER=r2 but ${missing.join(', ')} ${
            missing.length === 1 ? 'is' : 'are'
          } not set.`,
        );
      }

      this.logger.log(`Using Cloudflare R2 storage (bucket: ${bucket})`);
      return new R2StorageDriver({
        accountId: accountId as string,
        accessKeyId: accessKeyId as string,
        secretAccessKey: secretAccessKey as string,
        bucket: bucket as string,
      });
    }

    const baseDir = resolve(this.config.get<string>('STORAGE_DIR', './storage'));
    this.logger.log(`Using local filesystem storage (${baseDir})`);
    this.logger.warn(
      'Local storage does not survive a redeploy on most hosts. Set STORAGE_DRIVER=r2 in production.',
    );
    return new LocalStorageDriver(baseDir);
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
