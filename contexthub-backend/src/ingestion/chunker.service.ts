import { Injectable } from '@nestjs/common';
import type { BlockKind, DocumentBlock } from './parser.service';

/** One chunk of plain text, before any block metadata is attached. */
export interface TextChunk {
  ordinal: number;
  content: string;
  tokenCount: number;
  startOffset: number;
  endOffset: number;
}

/** A chunk ready to persist, shaped to match the Chunk Prisma model. */
export interface DocumentChunk extends TextChunk {
  kind: BlockKind;
  pageNumber: number | null;
  imageKey: string | null;
}

// ~4 characters per token is the standard rough estimate (no tokenizer needed).
const CHARS_PER_TOKEN = 4;
// Target ~500 tokens per chunk with ~75-token (~15%) overlap so meaning isn't
// lost at boundaries. Tuneable; these are the common RAG defaults.
const CHUNK_TOKENS = 500;
const OVERLAP_TOKENS = 75;

const MAX_CHARS = CHUNK_TOKENS * CHARS_PER_TOKEN; // ~2000
const OVERLAP_CHARS = OVERLAP_TOKENS * CHARS_PER_TOKEN; // ~300

// Tables and image descriptions lose their meaning when cut in half, so they
// are allowed to exceed the normal window before we split them at all.
const ATOMIC_MAX_CHARS = MAX_CHARS * 3; // ~6000

/**
 * Splits extracted content into embeddable chunks.
 *
 * Prose is cut on natural boundaries with an overlap. Tables and image
 * descriptions are kept whole wherever possible — half a table answers no
 * question — and a table too large to keep whole is split by rows with its
 * header repeated, so every piece stays readable on its own.
 */
@Injectable()
export class ChunkerService {
  /**
   * Chunk a parsed document. Ordinals run across the whole document so the
   * original reading order survives, and each chunk keeps the kind, page and
   * image of the block it came from.
   *
   * Offsets are relative to the block, not the document — blocks come from
   * separate passes (text, tables, images) and share no coordinate space.
   */
  splitBlocks(blocks: DocumentBlock[]): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];
    let ordinal = 0;

    for (const block of blocks) {
      for (const piece of this.splitBlock(block)) {
        chunks.push({ ...piece, ordinal: ordinal++ });
      }
    }

    return chunks;
  }

  /** Split plain text into overlapping chunks. */
  split(text: string): TextChunk[] {
    const chunks: TextChunk[] = [];
    let start = 0;
    let ordinal = 0;

    while (start < text.length) {
      let end = Math.min(start + MAX_CHARS, text.length);

      // If we're not at the very end, back up to a natural boundary.
      if (end < text.length) {
        const boundary = findBoundary(text, start, end);
        // Only honor the boundary if it doesn't make the chunk tiny.
        if (boundary > start + MAX_CHARS * 0.5) end = boundary;
      }

      const content = text.slice(start, end).trim();
      if (content) {
        chunks.push({
          ordinal: ordinal++,
          content,
          tokenCount: estimateTokens(content),
          startOffset: start,
          endOffset: end,
        });
      }

      if (end >= text.length) break;
      // Step forward, leaving an overlap window behind.
      start = Math.max(end - OVERLAP_CHARS, start + 1);
    }

    return chunks;
  }

  /** One block → its chunks, with ordinals still block-local (0-based). */
  private splitBlock(block: DocumentBlock): DocumentChunk[] {
    const meta = {
      kind: block.kind,
      pageNumber: block.pageNumber,
      imageKey: block.imageKey,
    };
    const content = block.content.trim();
    if (!content) return [];

    // Small enough to keep intact, or an atomic kind under its larger cap.
    const atomic = block.kind === 'TABLE' || block.kind === 'IMAGE';
    const limit = atomic ? ATOMIC_MAX_CHARS : MAX_CHARS;

    if (content.length <= limit) {
      return [
        {
          ordinal: 0,
          content,
          tokenCount: estimateTokens(content),
          startOffset: 0,
          endOffset: content.length,
          ...meta,
        },
      ];
    }

    if (block.kind === 'TABLE') {
      return splitMarkdownTable(content).map((part) => ({
        ...part,
        ...meta,
      }));
    }

    return this.split(content).map((part) => ({ ...part, ...meta }));
  }
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Split an oversized markdown table by rows, repeating the header (and its
 * separator) on every part so each chunk is independently readable.
 * Falls back to one whole chunk if the input doesn't look like a table.
 */
function splitMarkdownTable(markdown: string): TextChunk[] {
  const lines = markdown.split('\n');
  const [header, separator, ...body] = lines;

  if (!header || !separator || body.length === 0) {
    return [
      {
        ordinal: 0,
        content: markdown,
        tokenCount: estimateTokens(markdown),
        startOffset: 0,
        endOffset: markdown.length,
      },
    ];
  }

  const head = `${header}\n${separator}`;
  const chunks: TextChunk[] = [];
  let current: string[] = [];
  let ordinal = 0;
  let consumed = head.length;
  let start = 0;

  const flush = () => {
    if (current.length === 0) return;
    const content = [head, ...current].join('\n');
    chunks.push({
      ordinal: ordinal++,
      content,
      tokenCount: estimateTokens(content),
      startOffset: start,
      endOffset: consumed,
    });
    start = consumed;
    current = [];
  };

  for (const row of body) {
    // +1 for the newline this row will contribute.
    const projected = head.length + current.join('\n').length + row.length + 1;
    if (current.length > 0 && projected > ATOMIC_MAX_CHARS) flush();
    current.push(row);
    consumed += row.length + 1;
  }
  flush();

  return chunks;
}

/**
 * Find the best place to cut within [start, end): last paragraph break, else
 * last sentence end, else last space. Returns an absolute offset, or `end` if
 * no boundary is found.
 */
function findBoundary(text: string, start: number, end: number): number {
  const window = text.slice(start, end);

  const para = window.lastIndexOf('\n\n');
  if (para !== -1) return start + para + 2;

  const sentence = Math.max(
    window.lastIndexOf('. '),
    window.lastIndexOf('.\n'),
    window.lastIndexOf('! '),
    window.lastIndexOf('? '),
  );
  if (sentence !== -1) return start + sentence + 2;

  const space = window.lastIndexOf(' ');
  if (space !== -1) return start + space + 1;

  return end;
}
