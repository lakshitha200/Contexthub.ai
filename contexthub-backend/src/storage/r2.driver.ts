import { Logger } from '@nestjs/common';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { Readable } from 'node:stream';
import type { StorageDriver } from './storage.driver';

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

/**
 * Cloudflare R2, through its S3-compatible API.
 *
 * R2 rather than S3 for one reason that matters here: no egress charges. This
 * product streams documents and extracted chart images back to the browser on
 * every citation, so download volume scales with how much people actually use
 * it, and on S3 that is the line item that grows.
 *
 * Region is fixed to "auto". R2 has no regions, but the S3 client refuses to
 * sign a request without one.
 */
export class R2StorageDriver implements StorageDriver {
  private readonly logger = new Logger(R2StorageDriver.name);
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: R2Config) {
    this.bucket = config.bucket;
    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async save(
    storageKey: string,
    buffer: Buffer,
    contentType?: string,
  ): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
        Body: buffer,
        ...(contentType ? { ContentType: contentType } : {}),
      }),
    );
  }

  async read(storageKey: string): Promise<Readable> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: storageKey }),
    );

    // In Node the SDK returns a Readable here. The union also covers browser
    // stream types, which cannot occur on this runtime, so narrow rather than
    // pretend the other branches are reachable.
    const body = response.Body as Readable | undefined;
    if (!body) throw new Error(`R2 returned no body for ${storageKey}`);
    return body;
  }

  async exists(storageKey: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: storageKey }),
      );
      return true;
    } catch {
      // HeadObject answers a missing key with a 404-shaped throw, so absence
      // and a genuine failure look the same here. Treating both as "gone" is
      // right for the callers: each one falls back to "stored file is missing".
      return false;
    }
  }

  async remove(storageKey: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: storageKey }),
      );
    } catch (err) {
      // A failed delete leaves an orphaned object, which costs a little storage
      // and nothing else. Failing the request the user asked for, on the other
      // hand, would leave a document they deleted still listed.
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed to delete ${storageKey} from R2: ${message}`);
    }
  }
}
