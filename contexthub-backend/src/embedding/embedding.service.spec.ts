// ─────────────────────────────────────────────────────────────────────────────
// EmbeddingService — UNIT TESTS
//
//   [HAPPY]    → returns one vector per input, with the correct dimension
//   [SAD]      → throws InternalServerErrorException on provider failure
//   [SECURITY] → fails fast if GEMINI_API_KEY is missing on bootstrap
//
// The Gemini SDK is stubbed so tests are offline & deterministic.
// ─────────────────────────────────────────────────────────────────────────────

// Stub the SDK BEFORE importing the service.
const embedContentMock = jest.fn();
jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: { embedContent: embedContentMock },
  })),
}));

import { InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { EmbeddingService } from './embedding.service';

const check = (label: string) => console.log(`        ✓ ${label}`);

const DIM = 1536;
const fakeVector = (seed = 1) =>
  Array.from({ length: DIM }, (_, i) => (i + seed) / 100000);

function configWith(values: Record<string, string | undefined>) {
  return {
    provide: ConfigService,
    useValue: {
      get: (key: string, fallback?: string) => values[key] ?? fallback,
    },
  };
}

async function buildService(
  values: Record<string, string | undefined>,
  initialize = true,
): Promise<EmbeddingService> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [EmbeddingService, configWith(values)],
  }).compile();
  const service = module.get(EmbeddingService);
  if (initialize) service.onModuleInit();
  return service;
}

describe('EmbeddingService', () => {
  beforeEach(() => {
    embedContentMock.mockReset();
  });

  // ── HAPPY ─────────────────────────────────────────────────────────────────
  describe('[HAPPY] embed()', () => {
    it('returns one vector per input, each with the configured dimension', async () => {
      embedContentMock.mockResolvedValue({
        embeddings: [
          { values: fakeVector(1) },
          { values: fakeVector(2) },
        ],
      });

      const service = await buildService({ GEMINI_API_KEY: 'test-key' });
      const result = await service.embed(['hello', 'world']);

      expect(result).toHaveLength(2);
      expect(result[0]).toHaveLength(DIM);
      expect(result[1]).toHaveLength(DIM);
      check('returns one vector per input with correct dimension');
    });

    it('returns an empty array immediately for an empty input (no API call)', async () => {
      const service = await buildService({ GEMINI_API_KEY: 'test-key' });
      const result = await service.embed([]);

      expect(result).toEqual([]);
      expect(embedContentMock).not.toHaveBeenCalled();
      check('short-circuits on empty input (saves an API call)');
    });

    it('L2-normalizes returned vectors so ‖v‖ ≈ 1', async () => {
      embedContentMock.mockResolvedValue({
        embeddings: [{ values: fakeVector(1) }],
      });

      const service = await buildService({ GEMINI_API_KEY: 'test-key' });
      const [vec] = await service.embed(['hello']);

      const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
      expect(norm).toBeCloseTo(1, 5);
      check('L2-normalizes vectors for stable cosine similarity');
    });

    it('splits large inputs into provider-safe sub-batches', async () => {
      embedContentMock.mockImplementation(({ contents }: { contents: string[] }) =>
        Promise.resolve({
          embeddings: contents.map(() => ({ values: fakeVector() })),
        }),
      );

      const service = await buildService({
        GEMINI_API_KEY: 'test-key',
        EMBEDDING_BATCH_SIZE: '2',
      });
      const result = await service.embed(['a', 'b', 'c', 'd', 'e']);

      expect(result).toHaveLength(5);
      expect(embedContentMock).toHaveBeenCalledTimes(3); // 2 + 2 + 1
      check('chunks inputs into batches when over batch size');
    });

    it('embedOne() returns a single vector', async () => {
      embedContentMock.mockResolvedValue({
        embeddings: [{ values: fakeVector(7) }],
      });

      const service = await buildService({ GEMINI_API_KEY: 'test-key' });
      const vec = await service.embedOne('one thing');

      expect(vec).toHaveLength(DIM);
      check('embedOne() returns a single vector');
    });
  });

  // ── SAD ───────────────────────────────────────────────────────────────────
  describe('[SAD] failures', () => {
    it('throws InternalServerErrorException when the provider rejects', async () => {
      embedContentMock.mockRejectedValue(new Error('quota exceeded'));

      const service = await buildService({ GEMINI_API_KEY: 'test-key' });
      await expect(service.embed(['x'])).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
      check('wraps provider errors in InternalServerErrorException');
    });

    it('throws when the provider returns the wrong number of vectors', async () => {
      embedContentMock.mockResolvedValue({ embeddings: [] });

      const service = await buildService({ GEMINI_API_KEY: 'test-key' });
      await expect(service.embed(['x'])).rejects.toThrow(/count mismatch/);
      check('rejects mismatched response counts');
    });

    it('throws when a returned vector has the wrong dimension', async () => {
      embedContentMock.mockResolvedValue({
        embeddings: [{ values: [0.1, 0.2, 0.3] }],
      });

      const service = await buildService({ GEMINI_API_KEY: 'test-key' });
      await expect(service.embed(['x'])).rejects.toThrow(/wrong dimension/);
      check('rejects vectors whose dimension does not match the schema');
    });
  });

  // ── SECURITY ──────────────────────────────────────────────────────────────
  describe('[SECURITY] bootstrap', () => {
    it('refuses to start without a GEMINI_API_KEY', async () => {
      const service = await buildService({ GEMINI_API_KEY: undefined }, false);
      expect(() => service.onModuleInit()).toThrow(/GEMINI_API_KEY/);
      check('fails fast at boot when the API key is missing');
    });
  });
});
