import { NotFoundException } from '@nestjs/common';
import { createReadStream } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { Readable } from 'node:stream';
import type { StorageDriver } from './storage.driver';

/**
 * Files on the local filesystem.
 *
 * The default, because development should need no credentials and no network.
 * Not suitable for most deployments: container filesystems are usually
 * ephemeral, so an upload survives only until the next restart or redeploy.
 */
export class LocalStorageDriver implements StorageDriver {
  constructor(private readonly baseDir: string) {}

  async save(storageKey: string, buffer: Buffer): Promise<void> {
    const absPath = this.toAbsolute(storageKey);
    await mkdir(dirname(absPath), { recursive: true });
    await writeFile(absPath, buffer);
  }

  read(storageKey: string): Promise<Readable> {
    return Promise.resolve(createReadStream(this.toAbsolute(storageKey)));
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

  /**
   * Resolve a key under the base directory, refusing anything that escapes it.
   *
   * A storage key is derived from a user-supplied filename, so without this a
   * crafted key could read or delete files anywhere the process can reach.
   */
  private toAbsolute(storageKey: string): string {
    const absPath = resolve(join(this.baseDir, storageKey));
    if (absPath !== this.baseDir && !absPath.startsWith(this.baseDir)) {
      throw new NotFoundException('Invalid storage key');
    }
    return absPath;
  }
}
