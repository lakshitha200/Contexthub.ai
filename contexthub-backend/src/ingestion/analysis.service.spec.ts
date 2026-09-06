import { ConfigService } from '@nestjs/config';
import { DocType } from '../../generated/prisma/client';
import { AnalysisService, buildSample } from './analysis.service';
import { buildChunkContext } from './ingestion.service';
import type { DocumentBlock } from './parser.service';

// The SDK is only constructed in onModuleInit, which these tests never call —
// the parsing and sampling logic under test makes no network calls.
jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn(),
  Type: {
    OBJECT: 'OBJECT',
    STRING: 'STRING',
    ARRAY: 'ARRAY',
  },
}));

function block(
  content: string,
  kind: DocumentBlock['kind'] = 'TEXT',
): DocumentBlock {
  return { kind, content, pageNumber: null, imageKey: null };
}

/** Reach the private `parse` without loosening its visibility in the service. */
function parseWith(service: AnalysisService, text: string | undefined) {
  return (
    service as unknown as {
      parse(text: string | undefined): unknown;
    }
  ).parse(text);
}

describe('AnalysisService', () => {
  function makeService(overrides: Record<string, string> = {}) {
    const config = {
      get: (key: string, fallback?: string) => overrides[key] ?? fallback,
    } as unknown as ConfigService;
    return new AnalysisService(config);
  }

  describe('parse()', () => {
    it('accepts a well-formed response', () => {
      const service = makeService();

      const result = parseWith(
        service,
        JSON.stringify({
          summary: 'Quarterly revenue and headcount for the EU region.',
          docType: 'REPORT',
          topics: ['revenue', 'headcount'],
        }),
      );

      expect(result).toEqual({
        summary: 'Quarterly revenue and headcount for the EU region.',
        docType: DocType.REPORT,
        topics: ['revenue', 'headcount'],
      });
    });

    it('falls back to OTHER for a type outside the enum', () => {
      const service = makeService();

      const result = parseWith(
        service,
        JSON.stringify({
          summary: 'Something.',
          docType: 'NEWSLETTER',
          topics: [],
        }),
      );

      expect(result).toMatchObject({ docType: DocType.OTHER });
    });

    it('maps a spaced or hyphenated type onto the enum', () => {
      const service = makeService();

      const result = parseWith(
        service,
        JSON.stringify({
          summary: 'Notes from the weekly sync.',
          docType: 'meeting notes',
          topics: [],
        }),
      );

      expect(result).toMatchObject({ docType: DocType.MEETING_NOTES });
    });

    it('lowercases, trims, dedupes and caps topics', () => {
      const service = makeService({ ANALYSIS_MAX_TOPICS: '3' });

      const result = parseWith(
        service,
        JSON.stringify({
          summary: 'Something.',
          docType: 'REPORT',
          topics: ['  Revenue ', 'revenue', 'Pricing', 'Churn', 'Expansion'],
        }),
      );

      expect(result).toMatchObject({
        topics: ['revenue', 'pricing', 'churn'],
      });
    });

    it('drops non-string topic entries instead of failing', () => {
      const service = makeService();

      const result = parseWith(
        service,
        JSON.stringify({
          summary: 'Something.',
          docType: 'REPORT',
          topics: ['pricing', 42, null, 'churn'],
        }),
      );

      expect(result).toMatchObject({ topics: ['pricing', 'churn'] });
    });

    it('returns null for unparseable or empty output', () => {
      const service = makeService();

      expect(parseWith(service, undefined)).toBeNull();
      expect(parseWith(service, '   ')).toBeNull();
      expect(parseWith(service, 'not json at all')).toBeNull();
      // A summary is the one field with no safe default.
      expect(
        parseWith(service, JSON.stringify({ docType: 'REPORT' })),
      ).toBeNull();
    });
  });

  describe('analyze()', () => {
    it('returns null without calling the model when disabled', async () => {
      const service = makeService({ ANALYSIS_ENABLED: 'false' });

      await expect(
        service.analyze('a.pdf', [block('hello')]),
      ).resolves.toBeNull();
    });

    it('returns null when there is no text to read', async () => {
      const service = makeService();

      await expect(service.analyze('a.pdf', [])).resolves.toBeNull();
    });
  });
});

describe('buildSample()', () => {
  it('joins blocks as-is when they fit', () => {
    expect(buildSample([block('one'), block('two')], 1000)).toBe('one\n\ntwo');
  });

  it('excludes IMAGE blocks — a vision description is not the document speaking', () => {
    const blocks = [block('body text'), block('a bar chart', 'IMAGE')];

    expect(buildSample(blocks, 1000)).toBe('body text');
  });

  it('keeps OCR and TABLE blocks', () => {
    const blocks = [block('scanned', 'OCR'), block('| a | b |', 'TABLE')];

    expect(buildSample(blocks, 1000)).toBe('scanned\n\n| a | b |');
  });

  it('samples head and tail so a conclusion is never cut off', () => {
    const text = `${'H'.repeat(500)}${'M'.repeat(500)}${'T'.repeat(500)}`;

    const sample = buildSample([block(text)], 100);

    expect(sample).toContain('[...]');
    expect(sample.startsWith('H')).toBe(true);
    expect(sample.endsWith('T')).toBe(true);
  });
});

describe('buildChunkContext()', () => {
  const analysis = {
    summary: 'Quarterly revenue and headcount for the EU region.',
    docType: DocType.MEETING_NOTES,
    topics: ['revenue', 'headcount'],
  };

  it('carries filename, readable type, summary and topics', () => {
    const context = buildChunkContext('Q3.pdf', analysis);

    expect(context).toContain('Document: Q3.pdf (Meeting notes)');
    expect(context).toContain(
      'About: Quarterly revenue and headcount for the EU region.',
    );
    expect(context).toContain('Topics: revenue, headcount');
    // Blank line separates the header from the chunk body that follows.
    expect(context.endsWith('\n\n')).toBe(true);
  });

  it('falls back to the filename alone when analysis is unavailable', () => {
    expect(buildChunkContext('Q3.pdf', null)).toBe('Document: Q3.pdf\n\n');
  });

  it('omits the topics line when there are none', () => {
    const context = buildChunkContext('Q3.pdf', { ...analysis, topics: [] });

    expect(context).not.toContain('Topics:');
  });

  it('truncates a long summary so the header cannot dominate the chunk', () => {
    const context = buildChunkContext('Q3.pdf', {
      ...analysis,
      summary: 'x'.repeat(900),
    });

    expect(context).toContain('…');
    expect(context.length).toBeLessThan(600);
  });
});
