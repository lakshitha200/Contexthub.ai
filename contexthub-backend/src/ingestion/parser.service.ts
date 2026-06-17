import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import type { Readable } from 'node:stream';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import { StorageService } from '../storage/storage.service';

/** The fields the parser needs from a Document row. */
export interface ParsableDocument {
  storageKey: string;
  mimeType: string;
  filename: string;
}

/**
 * Turns stored file bytes into plain text, dispatched by MIME type.
 * Bytes are always read through StorageService (path-traversal guarded), so
 * the parser never touches the filesystem directly.
 */
@Injectable()
export class ParserService {
  private readonly logger = new Logger(ParserService.name);

  constructor(private readonly storage: StorageService) {}

  async parse(doc: ParsableDocument): Promise<string> {
    const buffer = await streamToBuffer(
      this.storage.createReadStream(doc.storageKey),
    );

    const text = await this.extract(buffer, doc.mimeType, doc.filename);
    const trimmed = text.trim();

    if (!trimmed) {
      throw new BadRequestException(
        `No extractable text found in "${doc.filename}"`,
      );
    }
    return trimmed;
  }

  private async extract(
    buffer: Buffer,
    mimeType: string,
    filename: string,
  ): Promise<string> {
    switch (mimeType) {
      case 'application/pdf': {
        const parser = new PDFParse({ data: buffer });
        try {
          const result = await parser.getText();
          return result.text;
        } finally {
          await parser.destroy();
        }
      }

      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
        const result = await mammoth.extractRawText({ buffer });
        return result.value;
      }

      case 'text/html':
        return stripHtml(buffer.toString('utf-8'));

      case 'text/plain':
      case 'text/markdown':
      case 'text/csv':
      case 'application/json':
        return buffer.toString('utf-8');

      // Legacy binary .doc is not supported by mammoth.
      case 'application/msword':
        throw new BadRequestException(
          `Legacy .doc files are not supported. Re-save "${filename}" as .docx or PDF.`,
        );

      default:
        throw new BadRequestException(
          `Unsupported MIME type for parsing: ${mimeType}`,
        );
    }
  }
}

/** Collect a readable stream into a single Buffer. */
async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
  }
  return Buffer.concat(chunks);
}

/** Very light HTML → text: drop script/style, strip tags, collapse whitespace. */
function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
