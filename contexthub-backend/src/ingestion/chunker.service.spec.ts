import { ChunkerService } from './chunker.service';
import type { DocumentBlock } from './parser.service';

const block = (over: Partial<DocumentBlock>): DocumentBlock => ({
  kind: 'TEXT',
  content: 'x',
  pageNumber: null,
  imageKey: null,
  ...over,
});

describe('ChunkerService', () => {
  let chunker: ChunkerService;

  beforeEach(() => {
    chunker = new ChunkerService();
  });

  describe('split', () => {
    it('keeps short text as a single chunk', () => {
      const chunks = chunker.split('A short paragraph.');
      expect(chunks).toHaveLength(1);
      expect(chunks[0].content).toBe('A short paragraph.');
    });

    it('splits long text into overlapping chunks', () => {
      const text = `${'word '.repeat(1200)}`; // ~6000 chars
      const chunks = chunker.split(text);

      expect(chunks.length).toBeGreaterThan(1);
      // Each chunk starts before the previous one ended — that's the overlap.
      for (let i = 1; i < chunks.length; i++) {
        expect(chunks[i].startOffset).toBeLessThan(chunks[i - 1].endOffset);
      }
    });
  });

  describe('splitBlocks', () => {
    it('numbers ordinals across the whole document, not per block', () => {
      const chunks = chunker.splitBlocks([
        block({ content: 'Page one text.', pageNumber: 1 }),
        block({ content: 'Page two text.', pageNumber: 2 }),
        block({ content: 'Page three text.', pageNumber: 3 }),
      ]);

      expect(chunks.map((c) => c.ordinal)).toEqual([0, 1, 2]);
      expect(chunks.map((c) => c.pageNumber)).toEqual([1, 2, 3]);
    });

    it('carries kind, page and imageKey onto every chunk', () => {
      const [chunk] = chunker.splitBlocks([
        block({
          kind: 'IMAGE',
          content: 'A bar chart of revenue by month.',
          pageNumber: 7,
          imageKey: 'workspaces/w1/chart.png',
        }),
      ]);

      expect(chunk.kind).toBe('IMAGE');
      expect(chunk.pageNumber).toBe(7);
      expect(chunk.imageKey).toBe('workspaces/w1/chart.png');
    });

    it('keeps a table intact even when it exceeds the prose window', () => {
      // ~3000 chars: over the ~2000-char prose limit, under the atomic limit.
      const rows = Array.from(
        { length: 100 },
        (_, i) => `| Item ${i} | ${i * 10} | region-${i} |`,
      );
      const table = [
        '| Item | Value | Region |',
        '| --- | --- | --- |',
        ...rows,
      ].join('\n');
      expect(table.length).toBeGreaterThan(2000);

      const chunks = chunker.splitBlocks([
        block({ kind: 'TABLE', content: table, pageNumber: 2 }),
      ]);

      expect(chunks).toHaveLength(1);
      expect(chunks[0].content).toBe(table);
    });

    it('repeats the header when a table is too large to keep whole', () => {
      const rows = Array.from(
        { length: 400 },
        (_, i) => `| Item ${i} | ${i * 10} | region-${i} |`,
      );
      const header = '| Item | Value | Region |';
      const separator = '| --- | --- | --- |';
      const table = [header, separator, ...rows].join('\n');

      const chunks = chunker.splitBlocks([
        block({ kind: 'TABLE', content: table, pageNumber: 2 }),
      ]);

      expect(chunks.length).toBeGreaterThan(1);
      for (const chunk of chunks) {
        expect(chunk.content.startsWith(`${header}\n${separator}`)).toBe(true);
        expect(chunk.kind).toBe('TABLE');
        expect(chunk.pageNumber).toBe(2);
      }

      // Every data row survives the split exactly once (the repeated header
      // is excluded here — `| Item | Value |` also starts with "| Item ").
      const emitted = chunks
        .flatMap((c) => c.content.split('\n'))
        .filter((line) => /^\| Item \d+ \|/.test(line));
      expect(emitted).toEqual(rows);
    });

    it('drops blocks that are empty or whitespace only', () => {
      const chunks = chunker.splitBlocks([
        block({ content: '   \n  ' }),
        block({ content: 'Real content.' }),
      ]);

      expect(chunks).toHaveLength(1);
      expect(chunks[0].content).toBe('Real content.');
    });

    it('splits an over-long image description rather than dropping it', () => {
      const description = 'The chart shows a steady decline. '.repeat(400);
      const chunks = chunker.splitBlocks([
        block({ kind: 'IMAGE', content: description, imageKey: 'k.png' }),
      ]);

      expect(chunks.length).toBeGreaterThan(1);
      // Every piece stays attributed to the image it came from.
      expect(chunks.every((c) => c.kind === 'IMAGE')).toBe(true);
      expect(chunks.every((c) => c.imageKey === 'k.png')).toBe(true);
    });
  });
});
