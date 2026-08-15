import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';

/** Returned when the model decides an image carries no useful information. */
export const VISION_SKIP = 'SKIP';

/**
 * Turns pixels into text with Gemini's multimodal model, so the rest of the
 * pipeline (chunker → embeddings → pgvector) stays entirely text-based. Same
 * `GEMINI_API_KEY` and same model family as LlmService — this is a separate
 * class only so ingestion doesn't have to depend on ChatModule.
 *
 * Every method degrades gracefully: a vision failure returns null and is logged,
 * never thrown. Losing a chart description must not fail a whole document.
 */
@Injectable()
export class VisionService implements OnModuleInit {
  private readonly logger = new Logger(VisionService.name);
  private readonly model: string;
  private readonly enabled: boolean;
  private client!: GoogleGenAI;

  /** Max pages we OCR per document — caps cost on huge scanned files. */
  readonly maxOcrPages: number;
  /** Max embedded images we describe per document. */
  readonly maxImages: number;
  /** How many vision calls to run at once (free tiers rate-limit hard). */
  readonly concurrency: number;

  constructor(private readonly config: ConfigService) {
    this.model = this.config.get<string>(
      'VISION_MODEL',
      this.config.get<string>('CHAT_MODEL', 'gemini-2.5-flash'),
    );
    this.enabled =
      this.config.get<string>('VISION_ENABLED', 'true') !== 'false';
    this.maxOcrPages = Number(
      this.config.get<string>('VISION_MAX_OCR_PAGES', '30'),
    );
    this.maxImages = Number(this.config.get<string>('VISION_MAX_IMAGES', '20'));
    this.concurrency = Number(
      this.config.get<string>('VISION_CONCURRENCY', '2'),
    );
  }

  onModuleInit(): void {
    const apiKey = this.config.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      throw new Error(
        'GEMINI_API_KEY is not set. Add it to .env before the vision service can run.',
      );
    }
    this.client = new GoogleGenAI({ apiKey });
  }

  /** Whether vision-based extraction should run at all (VISION_ENABLED). */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Read every word off a page image. Used when a PDF page has no text layer
   * (a scan or an export-as-image). Returns null if the page is blank or the
   * call failed.
   */
  async transcribePage(
    image: Buffer,
    mimeType: string,
    label: string,
  ): Promise<string | null> {
    const text = await this.call(
      image,
      mimeType,
      `Transcribe every piece of text in this scanned document page, exactly as written.

Rules:
- Preserve reading order, headings, and list structure.
- Render any table as a GitHub-flavoured markdown table.
- Do NOT summarise, translate, explain, or add commentary of your own.
- Transcribe only what is actually legible. Never guess at unreadable text.
- If the page contains no readable text at all, reply with exactly ${VISION_SKIP}.`,
      label,
    );
    return this.orNullIfSkipped(text);
  }

  /**
   * Describe an image pulled out of a document — usually a chart, diagram, or
   * screenshot — in enough detail that the description is worth searching.
   * Returns null for decorative images (logos, dividers) and on failure.
   */
  async describeImage(
    image: Buffer,
    mimeType: string,
    context: { filename: string; pageNumber?: number | null },
  ): Promise<string | null> {
    const where = context.pageNumber
      ? `page ${context.pageNumber} of "${context.filename}"`
      : `"${context.filename}"`;

    const text = await this.call(
      image,
      mimeType,
      `This image was taken from ${where}. Describe it so that someone searching the document can find it by its content.

If it is a CHART or GRAPH:
- State the chart type and what it measures, including axis labels and units.
- Name every series or category shown.
- Reproduce the underlying data as a markdown table, but ONLY using values that are explicitly printed on the chart (data labels, axis ticks, legend values).
- If a value is not printed, do NOT estimate it from the drawing. Describe the shape of the trend in words instead (rising, flat, a sharp drop between X and Y).
- Finish with the key takeaway the chart shows.

If it is a TABLE: reproduce it as a markdown table.
If it is a DIAGRAM or SCREENSHOT: describe the components, their labels, and how they relate.
If it is a photograph: describe what it shows.

If it is purely decorative (a logo, icon, border, background, or divider) and carries no information, reply with exactly ${VISION_SKIP}.

Never invent numbers, names, or dates that are not visible in the image.`,
      where,
    );
    return this.orNullIfSkipped(text);
  }

  /**
   * Run an async mapper over items with a small concurrency cap. Vision calls
   * are slow and rate-limited, so we neither serialise them nor let a 200-page
   * PDF open 200 sockets at once.
   */
  async mapLimited<T, R>(
    items: T[],
    fn: (item: T, index: number) => Promise<R>,
  ): Promise<R[]> {
    const results = new Array<R>(items.length);
    let cursor = 0;

    const workers = Array.from(
      { length: Math.min(Math.max(this.concurrency, 1), items.length) },
      async () => {
        for (;;) {
          const index = cursor++;
          if (index >= items.length) return;
          results[index] = await fn(items[index], index);
        }
      },
    );

    await Promise.all(workers);
    return results;
  }

  /** One multimodal generateContent call. Errors are logged, never rethrown. */
  private async call(
    image: Buffer,
    mimeType: string,
    prompt: string,
    label: string,
  ): Promise<string | null> {
    if (!this.enabled) return null;

    try {
      const response = await this.client.models.generateContent({
        model: this.model,
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  mimeType,
                  data: image.toString('base64'),
                },
              },
              { text: prompt },
            ],
          },
        ],
        config: {
          // Near-zero temperature: this is transcription, not creative writing.
          temperature: 0,
          maxOutputTokens: Number(
            this.config.get<string>('VISION_MAX_OUTPUT_TOKENS', '2048'),
          ),
        },
      });

      return response.text?.trim() ?? null;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Vision call failed for ${label}: ${message}`);
      return null;
    }
  }

  /** Collapse the SKIP sentinel (and empty output) to null. */
  private orNullIfSkipped(text: string | null): string | null {
    if (!text) return null;
    const trimmed = text.trim();
    if (!trimmed) return null;
    // The model sometimes wraps the sentinel in punctuation or backticks.
    if (trimmed.replace(/[`*.\s]/g, '').toUpperCase() === VISION_SKIP)
      return null;
    return trimmed;
  }
}
