import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Readable } from 'node:stream';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import { StorageService } from '../storage/storage.service';
import { VisionService } from './vision.service';

/** The fields the parser needs from a Document row. */
export interface ParsableDocument {
  id: string;
  workspaceId: string;
  storageKey: string;
  mimeType: string;
  filename: string;
  /**
   * Who uploaded it, so vision calls made while parsing are billed to the right
   * account. Nullable because the column is `onDelete: SetNull`: a document can
   * outlive the person who uploaded it, and that work is simply unattributed.
   */
  uploaderId: string | null;
}

/** Where a block's text came from. Mirrors the ChunkKind enum in Prisma. */
export type BlockKind = 'TEXT' | 'TABLE' | 'IMAGE' | 'OCR';

/**
 * One unit of extracted meaning, always as text. A PDF page yields a TEXT block,
 * plus a TABLE block per detected table, plus an IMAGE block per described
 * chart — or an OCR block instead of TEXT when the page has no text layer.
 */
export interface DocumentBlock {
  kind: BlockKind;
  content: string;
  pageNumber: number | null;
  /** Storage key of the source image — IMAGE blocks only. */
  imageKey: string | null;
}

const IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);

// A page with fewer meaningful characters than this is treated as having no
// text layer (a scan), so we fall back to OCR for that page.
const MIN_PAGE_TEXT_CHARS = 40;
// Ignore embedded images smaller than this on either side — logos, bullets,
// rules and tracking pixels, none of which are worth a vision call.
const MIN_IMAGE_DIMENSION = 120;
// Skip absurdly large embedded images rather than posting them to the API.
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
// Render scanned pages at this width: enough for OCR, small enough to stay cheap.
const OCR_RENDER_WIDTH = 1400;

/**
 * Turns stored file bytes into text blocks, dispatched by MIME type.
 *
 * Text-layer extraction, table detection and page rendering all come from
 * `pdf-parse` (which bundles pdfjs-dist + @napi-rs/canvas). Anything that only
 * exists as pixels — a chart, a scanned page, an uploaded screenshot — is
 * handed to VisionService, which writes it back out as text. That keeps a
 * single text embedding model serving the entire knowledge base.
 *
 * Bytes are always read through StorageService (path-traversal guarded), so
 * the parser never touches the filesystem directly.
 */
@Injectable()
export class ParserService {
  private readonly logger = new Logger(ParserService.name);

  constructor(
    private readonly storage: StorageService,
    private readonly vision: VisionService,
  ) {}

  async parse(doc: ParsableDocument): Promise<DocumentBlock[]> {
    const buffer = await streamToBuffer(
      this.storage.createReadStream(doc.storageKey),
    );

    const blocks = (await this.extract(buffer, doc)).filter(
      (b) => b.content.trim().length > 0,
    );

    if (blocks.length === 0) {
      throw new BadRequestException(
        `No extractable content found in "${doc.filename}". ` +
          `If this is a scanned document, check that vision extraction is enabled.`,
      );
    }
    return blocks;
  }

  private async extract(
    buffer: Buffer,
    doc: ParsableDocument,
  ): Promise<DocumentBlock[]> {
    const { mimeType, filename } = doc;

    if (IMAGE_MIME_TYPES.has(mimeType)) {
      return this.extractFromImage(buffer, doc);
    }

    switch (mimeType) {
      case 'application/pdf':
        return this.extractFromPdf(buffer, doc);

      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
        const result = await mammoth.extractRawText({ buffer });
        return [textBlock(result.value)];
      }

      case 'text/html':
        return [textBlock(stripHtml(buffer.toString('utf-8')))];

      case 'text/plain':
      case 'text/markdown':
      case 'text/csv':
      case 'application/json':
        return [textBlock(buffer.toString('utf-8'))];

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

  /**
   * The multimodal path. Four passes over one PDF:
   *   1. text layer, per page
   *   2. OCR for pages that came back empty (scans)
   *   3. detected tables, as markdown
   *   4. embedded images (charts/diagrams), described by the vision model
   */
  private async extractFromPdf(
    buffer: Buffer,
    doc: ParsableDocument,
  ): Promise<DocumentBlock[]> {
    const parser = new PDFParse({ data: buffer });

    try {
      const blocks: DocumentBlock[] = [];

      const textResult = await parser.getText();
      const pages = textResult.pages ?? [];

      // 1. Pages that already carry a text layer.
      const emptyPages: number[] = [];
      for (const page of pages) {
        const text = (page.text ?? '').trim();
        if (countMeaningful(text) >= MIN_PAGE_TEXT_CHARS) {
          blocks.push({
            kind: 'TEXT',
            content: text,
            pageNumber: page.num,
            imageKey: null,
          });
        } else {
          emptyPages.push(page.num);
        }
      }

      // 2. Pages with no text layer — render and transcribe them.
      const ocrPages = await this.ocrEmptyPages(parser, emptyPages, doc);
      blocks.push(...ocrPages.blocks);

      // 3. Tables. These partly duplicate the page text, but the flat text
      //    version has its columns scrambled while this one keeps its shape,
      //    so the markdown version is what actually answers numeric questions.
      blocks.push(...(await this.extractTables(parser, doc)));

      // 4. Charts and diagrams. Skip pages we OCR'd: their "embedded image" is
      //    the page scan itself, which we have already transcribed.
      blocks.push(
        ...(await this.describeEmbeddedImages(parser, doc, ocrPages.done)),
      );

      return sortByPage(blocks);
    } finally {
      await parser.destroy();
    }
  }

  /** Render text-less pages to PNG and OCR them with the vision model. */
  private async ocrEmptyPages(
    parser: PDFParse,
    pageNumbers: number[],
    doc: ParsableDocument,
  ): Promise<{ blocks: DocumentBlock[]; done: Set<number> }> {
    const done = new Set<number>();
    if (pageNumbers.length === 0 || !this.vision.isEnabled()) {
      return { blocks: [], done };
    }

    const capped = pageNumbers.slice(0, this.vision.maxOcrPages);
    if (capped.length < pageNumbers.length) {
      this.logger.warn(
        `${doc.filename}: ${pageNumbers.length} pages need OCR, transcribing the first ${capped.length} (VISION_MAX_OCR_PAGES)`,
      );
    }

    const shots = await parser.getScreenshot({
      partial: capped,
      desiredWidth: OCR_RENDER_WIDTH,
      imageBuffer: true,
      imageDataUrl: false,
    });

    const rendered = (shots.pages ?? []).filter((p) => p.data?.length);
    const texts = await this.vision.mapLimited(rendered, (page) =>
      this.vision.transcribePage(
        Buffer.from(page.data),
        'image/png',
        `${doc.filename} p.${page.pageNumber}`,
        doc.uploaderId,
      ),
    );

    const blocks: DocumentBlock[] = [];
    rendered.forEach((page, i) => {
      const text = texts[i];
      if (!text) return;
      done.add(page.pageNumber);
      blocks.push({
        kind: 'OCR',
        content: text,
        pageNumber: page.pageNumber,
        imageKey: null,
      });
    });

    if (blocks.length) {
      this.logger.log(
        `${doc.filename}: OCR recovered ${blocks.length} page(s)`,
      );
    }
    return { blocks, done };
  }

  /** Detected tables → one markdown TABLE block each. */
  private async extractTables(
    parser: PDFParse,
    doc: ParsableDocument,
  ): Promise<DocumentBlock[]> {
    let result: Awaited<ReturnType<PDFParse['getTable']>>;
    try {
      result = await parser.getTable();
    } catch (err) {
      // Table detection is geometry-based and can fail on odd PDFs. It is a
      // bonus pass, so a failure must not lose the document's text.
      this.logger.warn(
        `${doc.filename}: table extraction failed: ${message(err)}`,
      );
      return [];
    }

    const blocks: DocumentBlock[] = [];
    for (const page of result.pages ?? []) {
      for (const table of page.tables ?? []) {
        const markdown = toMarkdownTable(table);
        if (markdown) {
          blocks.push({
            kind: 'TABLE',
            content: markdown,
            pageNumber: page.num,
            imageKey: null,
          });
        }
      }
    }

    if (blocks.length) {
      this.logger.log(`${doc.filename}: extracted ${blocks.length} table(s)`);
    }
    return blocks;
  }

  /**
   * Pull embedded images out of the PDF, store each one, and ask the vision
   * model what it shows. The description becomes the searchable text; the
   * stored image is kept so the UI can show what a citation refers to.
   */
  private async describeEmbeddedImages(
    parser: PDFParse,
    doc: ParsableDocument,
    skipPages: Set<number>,
  ): Promise<DocumentBlock[]> {
    if (!this.vision.isEnabled()) return [];

    let result: Awaited<ReturnType<PDFParse['getImage']>>;
    try {
      result = await parser.getImage({
        imageThreshold: MIN_IMAGE_DIMENSION,
        imageBuffer: true,
        imageDataUrl: false,
      });
    } catch (err) {
      this.logger.warn(
        `${doc.filename}: image extraction failed: ${message(err)}`,
      );
      return [];
    }

    // Flatten to (page, image) pairs so the cap and the concurrency limit apply
    // across the whole document rather than per page.
    //
    // Deduplicated by content hash: a logo or icon reused on every page arrives
    // once per placement, and describing each copy would burn a vision call and
    // fill the index with identical chunks. First occurrence wins.
    const candidates: Array<{
      pageNumber: number;
      data: Buffer;
      name: string;
    }> = [];
    const seen = new Set<string>();
    let duplicates = 0;

    for (const page of result.pages ?? []) {
      if (skipPages.has(page.pageNumber)) continue;
      for (const image of page.images ?? []) {
        if (!image.data?.length || image.data.length > MAX_IMAGE_BYTES)
          continue;

        const data = Buffer.from(image.data);
        const hash = createHash('sha1').update(data).digest('hex');
        if (seen.has(hash)) {
          duplicates++;
          continue;
        }
        seen.add(hash);

        candidates.push({
          pageNumber: page.pageNumber,
          data,
          name: image.name,
        });
      }
    }

    if (duplicates > 0) {
      this.logger.log(
        `${doc.filename}: skipped ${duplicates} repeated image(s) (same bytes)`,
      );
    }

    if (candidates.length === 0) return [];

    const capped = candidates.slice(0, this.vision.maxImages);
    if (capped.length < candidates.length) {
      this.logger.warn(
        `${doc.filename}: ${candidates.length} images found, describing the first ${capped.length} (VISION_MAX_IMAGES)`,
      );
    }

    const described = await this.vision.mapLimited(
      capped,
      async (image): Promise<DocumentBlock | null> => {
        const mimeType = sniffImageMime(image.data);
        const description = await this.vision.describeImage(
          image.data,
          mimeType,
          {
            filename: doc.filename,
            pageNumber: image.pageNumber,
            ownerId: doc.uploaderId,
          },
        );
        if (!description) return null;

        // Only pay the storage cost for images we actually kept.
        const imageKey = await this.storage.save(
          doc.workspaceId,
          `${doc.id}-p${image.pageNumber}-${image.name}.${extensionFor(mimeType)}`,
          image.data,
        );

        return {
          kind: 'IMAGE',
          content: description,
          pageNumber: image.pageNumber,
          imageKey,
        };
      },
    );

    const blocks = described.filter((b): b is DocumentBlock => b !== null);
    if (blocks.length) {
      this.logger.log(`${doc.filename}: described ${blocks.length} image(s)`);
    }
    return blocks;
  }

  /**
   * A standalone uploaded image (a screenshot, a photo of a whiteboard). The
   * file is already in storage, so the block points back at the original key
   * rather than saving a second copy.
   */
  private async extractFromImage(
    buffer: Buffer,
    doc: ParsableDocument,
  ): Promise<DocumentBlock[]> {
    if (!this.vision.isEnabled()) {
      throw new BadRequestException(
        `"${doc.filename}" is an image, but vision extraction is disabled (VISION_ENABLED=false).`,
      );
    }

    const description = await this.vision.describeImage(buffer, doc.mimeType, {
      filename: doc.filename,
      ownerId: doc.uploaderId,
    });

    if (!description) {
      throw new BadRequestException(
        `Could not extract any content from the image "${doc.filename}".`,
      );
    }

    return [
      {
        kind: 'IMAGE',
        content: description,
        pageNumber: null,
        imageKey: doc.storageKey,
      },
    ];
  }
}

/** A whole-document TEXT block, for formats without page structure. */
function textBlock(content: string): DocumentBlock {
  return { kind: 'TEXT', content, pageNumber: null, imageKey: null };
}

/** Keep document order: by page, then TEXT/OCR before TABLE before IMAGE. */
function sortByPage(blocks: DocumentBlock[]): DocumentBlock[] {
  const rank: Record<BlockKind, number> = {
    TEXT: 0,
    OCR: 0,
    TABLE: 1,
    IMAGE: 2,
  };
  return [...blocks].sort(
    (a, b) =>
      (a.pageNumber ?? 0) - (b.pageNumber ?? 0) || rank[a.kind] - rank[b.kind],
  );
}

/** Characters that carry meaning — whitespace-only pages should not count. */
function countMeaningful(text: string): number {
  return text.replace(/\s+/g, '').length;
}

/**
 * Render a detected table as a GitHub-flavoured markdown table. The first row
 * is treated as the header. Returns null for tables too small to be useful.
 */
function toMarkdownTable(rows: string[][]): string | null {
  const cleaned = rows
    .map((row) => row.map((cell) => (cell ?? '').replace(/\s+/g, ' ').trim()))
    .filter((row) => row.some((cell) => cell.length > 0));

  if (cleaned.length < 2) return null;

  const width = Math.max(...cleaned.map((r) => r.length));
  if (width < 2) return null;

  const pad = (row: string[]) =>
    Array.from({ length: width }, (_, i) => escapePipes(row[i] ?? ''));

  const [header, ...body] = cleaned;
  const lines = [
    `| ${pad(header).join(' | ')} |`,
    `| ${Array.from({ length: width }, () => '---').join(' | ')} |`,
    ...body.map((row) => `| ${pad(row).join(' | ')} |`),
  ];
  return lines.join('\n');
}

function escapePipes(cell: string): string {
  return cell.replace(/\|/g, '\\|');
}

/** Identify image bytes by magic number; PNG is what pdfjs/canvas emits. */
function sniffImageMime(buffer: Buffer): string {
  if (buffer.length >= 8 && buffer.readUInt32BE(0) === 0x89504e47) {
    return 'image/png';
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    return 'image/jpeg';
  }
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return 'image/png';
}

function extensionFor(mimeType: string): string {
  return mimeType === 'image/jpeg'
    ? 'jpg'
    : mimeType === 'image/webp'
      ? 'webp'
      : 'png';
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
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
