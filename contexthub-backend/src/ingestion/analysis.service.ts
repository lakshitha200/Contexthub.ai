import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI, Type } from '@google/genai';
import { DocType } from '../../generated/prisma/client';
import type { DocumentBlock } from './parser.service';

/** What one pass of document analysis produces. */
export interface DocumentAnalysis {
  /** A short abstract of the whole document, in the document's own terms. */
  summary: string;
  /** Closed-set classification. */
  docType: DocType;
  /** Lowercase topic keywords, deduplicated. */
  topics: string[];
}

const DOC_TYPE_VALUES = Object.values(DocType);

/** Hard caps so one odd document can't write a novel into the row. */
const MAX_SUMMARY_CHARS = 1200;
const MAX_TOPIC_CHARS = 40;

/**
 * Reads a document as a whole — not chunk by chunk — and records what it is:
 * a summary, a type, and topic keywords.
 *
 * Two payoffs. The obvious one is UI: a document list that says what each file
 * actually contains. The less obvious one is retrieval — IngestionService
 * prepends the summary to every chunk before embedding, so a passage that reads
 * "revenue grew 12%" still carries which document and which period it came from.
 *
 * Deliberately narrow. It records what the document states (what this is, what
 * it covers) and not what would have to be inferred (risks, decisions, action
 * items) — inferred fields have no ground truth in the text, so the model
 * invents plausible ones and they get stored uncited as if they were facts.
 * Chat already answers those questions, with citations, on demand.
 *
 * Like VisionService, every failure degrades to null and is logged. Losing a
 * summary must never fail an otherwise good document.
 */
@Injectable()
export class AnalysisService implements OnModuleInit {
  private readonly logger = new Logger(AnalysisService.name);
  private readonly model: string;
  private readonly enabled: boolean;
  private readonly maxInputChars: number;
  private readonly maxTopics: number;
  private client!: GoogleGenAI;

  constructor(private readonly config: ConfigService) {
    this.model = this.config.get<string>(
      'ANALYSIS_MODEL',
      this.config.get<string>('CHAT_MODEL', 'gemini-2.5-flash'),
    );
    this.enabled =
      this.config.get<string>('ANALYSIS_ENABLED', 'true') !== 'false';
    this.maxInputChars = Number(
      this.config.get<string>('ANALYSIS_MAX_INPUT_CHARS', '24000'),
    );
    this.maxTopics = Number(
      this.config.get<string>('ANALYSIS_MAX_TOPICS', '6'),
    );
  }

  onModuleInit(): void {
    const apiKey = this.config.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      throw new Error(
        'GEMINI_API_KEY is not set. Add it to .env before the analysis service can run.',
      );
    }
    this.client = new GoogleGenAI({ apiKey });
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Analyze a parsed document. Returns null when disabled, when there is
   * nothing to read, or when the call failed — callers carry on regardless.
   */
  async analyze(
    filename: string,
    blocks: DocumentBlock[],
  ): Promise<DocumentAnalysis | null> {
    if (!this.enabled) return null;

    const sample = buildSample(blocks, this.maxInputChars);
    if (!sample.trim()) return null;

    try {
      const response = await this.client.models.generateContent({
        model: this.model,
        contents: [{ role: 'user', parts: [{ text: sample }] }],
        config: {
          systemInstruction: this.systemInstruction(),
          // Description, not composition — as deterministic as the vision path.
          temperature: 0,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: {
                type: Type.STRING,
                description:
                  'Two to four sentences stating what this document is and what it covers.',
              },
              docType: {
                type: Type.STRING,
                format: 'enum',
                enum: DOC_TYPE_VALUES,
                description: 'The closest matching document type.',
              },
              topics: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description:
                  'Up to six short lowercase subject keywords, most important first.',
              },
            },
            required: ['summary', 'docType', 'topics'],
          },
        },
      });

      const parsed = this.parse(response.text);
      if (!parsed) {
        this.logger.warn(`Analysis returned no usable JSON for ${filename}`);
        return null;
      }

      this.logger.log(
        `Analyzed ${filename}: ${parsed.docType}, topics [${parsed.topics.join(', ')}]`,
      );
      return parsed;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Analysis failed for ${filename}: ${message}`);
      return null;
    }
  }

  private systemInstruction(): string {
    return `You classify and summarise documents for a team knowledge base.

You are given the text of one document. Long documents are sampled, and an elided middle is marked with [...].

summary: two to four sentences saying what the document IS and what it COVERS. Write it so someone who has never opened the file knows whether it answers their question. State only what the text states — never infer risks, decisions or action items, and never guess at anything the text does not say. Do not begin with "This document"; start with the subject itself.

docType: the single closest match from the allowed list. Use OTHER only when nothing else fits.

topics: up to ${this.maxTopics} short lowercase subject keywords, most important first, one to three words each. Use the document's own vocabulary — product names, domains, subject areas. No generic filler such as "document", "information", "report" or "data".

Write in the same language as the document.`;
  }

  /** Parse and normalize the model's JSON. Returns null if unusable. */
  private parse(text: string | undefined): DocumentAnalysis | null {
    if (!text?.trim()) return null;

    let raw: unknown;
    try {
      raw = JSON.parse(text) as unknown;
    } catch {
      return null;
    }

    const shaped = raw as {
      summary?: unknown;
      docType?: unknown;
      topics?: unknown;
    };

    const summary =
      typeof shaped.summary === 'string' ? shaped.summary.trim() : '';
    if (!summary) return null;

    return {
      summary: summary.slice(0, MAX_SUMMARY_CHARS),
      docType: toDocType(shaped.docType),
      topics: normalizeTopics(shaped.topics, this.maxTopics),
    };
  }
}

/**
 * Coerce whatever came back into a DocType. The schema constrains it, but a
 * malformed response must not break ingestion — OTHER is always valid.
 */
function toDocType(value: unknown): DocType {
  if (typeof value !== 'string') return DocType.OTHER;
  const upper = value
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
  return DOC_TYPE_VALUES.includes(upper as DocType)
    ? (upper as DocType)
    : DocType.OTHER;
}

/** Lowercase, trim, drop blanks and duplicates, cap the count. */
function normalizeTopics(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== 'string') continue;
    const topic = entry.trim().toLowerCase().slice(0, MAX_TOPIC_CHARS);
    if (topic) seen.add(topic);
    if (seen.size >= max) break;
  }
  return [...seen];
}

/**
 * Assemble the text to analyze. A long document is sampled head-and-tail rather
 * than truncated: the opening says what a document is, but the conclusion is
 * where a report states its findings, and a head-only cut never sees it.
 *
 * IMAGE blocks are excluded — a chart description is a vision model's prose
 * about a picture, which skews a summary of what the document itself says.
 */
export function buildSample(blocks: DocumentBlock[], maxChars: number): string {
  const text = blocks
    .filter((b) => b.kind !== 'IMAGE')
    .map((b) => b.content.trim())
    .filter(Boolean)
    .join('\n\n');

  if (text.length <= maxChars) return text;

  const headChars = Math.floor(maxChars * 0.7);
  const tailChars = maxChars - headChars;
  return `${text.slice(0, headChars)}\n\n[...]\n\n${text.slice(-tailChars)}`;
}
