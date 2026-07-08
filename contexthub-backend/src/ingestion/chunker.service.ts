import { Injectable } from '@nestjs/common';

/** One chunk, shaped to match the Chunk Prisma model (minus id/embedding). */
export interface TextChunk {
  ordinal: number;
  content: string;
  tokenCount: number;
  startOffset: number;
  endOffset: number;
}

// ~4 characters per token is the standard rough estimate (no tokenizer needed).
const CHARS_PER_TOKEN = 4;
// Target ~500 tokens per chunk with ~75-token (~15%) overlap so meaning isn't
// lost at boundaries. Tuneable; these are the common RAG defaults.
const CHUNK_TOKENS = 500;
const OVERLAP_TOKENS = 75;

const MAX_CHARS = CHUNK_TOKENS * CHARS_PER_TOKEN; // ~2000
const OVERLAP_CHARS = OVERLAP_TOKENS * CHARS_PER_TOKEN; // ~300

/**
 * Splits plain text into overlapping chunks. Each window is capped at MAX_CHARS
 * but we prefer to cut on a natural boundary (paragraph > sentence > space) so
 * sentences aren't sliced mid-thought.
 */
@Injectable()
export class ChunkerService {
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
          tokenCount: Math.ceil(content.length / CHARS_PER_TOKEN),
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
