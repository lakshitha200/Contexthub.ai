import {
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';

/**
 * Provider-agnostic embedding wrapper. Today it calls Google Gemini
 * (`gemini-embedding-001`) but callers only see `embed(texts) → number[][]`,
 * so swapping providers later means changing only this file.
 *
 * Output dimension MUST equal the `vector(N)` declared on Chunk.embedding
 * (currently 1536). If you change EMBEDDING_DIM, you must also migrate the
 * Prisma schema and the pgvector HNSW index.
 */
@Injectable()
export class EmbeddingService implements OnModuleInit {
  private readonly logger = new Logger(EmbeddingService.name);
  private readonly model: string;
  private readonly batchSize: number;
  private client!: GoogleGenAI;

  /** Output vector length — must match Prisma `vector(N)` on Chunk.embedding. */
  readonly dimension: number;

  constructor(private readonly config: ConfigService) {
    this.model = this.config.get<string>(
      'EMBEDDING_MODEL',
      'gemini-embedding-001',
    );
    this.dimension = Number(this.config.get<string>('EMBEDDING_DIM', '1536'));
    this.batchSize = Number(
      this.config.get<string>('EMBEDDING_BATCH_SIZE', '100'),
    );
  }

  onModuleInit(): void {
    const apiKey = this.config.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      throw new Error(
        'GEMINI_API_KEY is not set. Add it to .env before the embedding service can run.',
      );
    }
    this.client = new GoogleGenAI({ apiKey });
  }

  /**
   * Embed a batch of texts. Returns one vector (length `dimension`) per input,
   * in the same order. Large inputs are split into provider-safe sub-batches.
   */
  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const vectors: number[][] = [];
    for (let i = 0; i < texts.length; i += this.batchSize) {
      const slice = texts.slice(i, i + this.batchSize);
      const batch = await this.embedBatch(slice);
      vectors.push(...batch);
    }
    return vectors;
  }

  /** Embed a single text — convenience for the chat query path. */
  async embedOne(text: string): Promise<number[]> {
    const [vec] = await this.embed([text]);
    return vec;
  }

  private async embedBatch(texts: string[]): Promise<number[][]> {
    try {
      const response = await this.client.models.embedContent({
        model: this.model,
        contents: texts,
        config: { outputDimensionality: this.dimension },
      });

      const embeddings = response.embeddings ?? [];
      if (embeddings.length !== texts.length) {
        throw new Error(
          `Embedding count mismatch: requested ${texts.length}, got ${embeddings.length}`,
        );
      }

      return embeddings.map((e, idx) => {
        const values = e.values;
        if (!values || values.length !== this.dimension) {
          throw new Error(
            `Embedding[${idx}] has wrong dimension: expected ${this.dimension}, got ${values?.length}`,
          );
        }
        // Gemini returns non-normalized vectors when outputDimensionality < 3072.
        // pgvector cosine distance works on any magnitude, but normalizing keeps
        // results consistent and lets us also use inner-product if we switch ops.
        return l2Normalize(values);
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Gemini embed failed: ${message}`);
      throw new InternalServerErrorException(
        `Embedding provider error: ${message}`,
      );
    }
  }
}

function l2Normalize(vec: number[]): number[] {
  let sum = 0;
  for (const v of vec) sum += v * v;
  const norm = Math.sqrt(sum);
  if (norm === 0) return vec;
  return vec.map((v) => v / norm);
}
