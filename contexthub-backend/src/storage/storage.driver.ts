import type { Readable } from 'node:stream';

/**
 * Where document bytes actually live.
 *
 * Narrow on purpose. Callers only ever hold the opaque `storageKey` a driver
 * hands back, so swapping local disk for object storage changes nothing above
 * this line.
 *
 * `read` is async even though the local driver could open a stream
 * synchronously: an object store cannot, and a contract shaped around the
 * cheaper implementation would have to be broken the moment the real one
 * arrives.
 */
export interface StorageDriver {
  /** Persist bytes and return the key to record against the document. */
  save(storageKey: string, buffer: Buffer, contentType?: string): Promise<void>;

  /** Open the stored object for reading. */
  read(storageKey: string): Promise<Readable>;

  /** Whether the object is still there. */
  exists(storageKey: string): Promise<boolean>;

  /** Delete it. Missing objects are not an error: deletion is idempotent. */
  remove(storageKey: string): Promise<void>;
}
