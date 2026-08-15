import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBase64,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

/** MIME types Gemini accepts as inline image input. */
export const ASK_IMAGE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
] as const;

/** Roughly 7.5 MB of raw bytes once base64 is decoded (base64 is ~4/3 size). */
const MAX_IMAGE_BASE64_CHARS = 10_000_000;

/** An image pasted into the chat box alongside the question. */
export class AskImageDto {
  @IsIn(ASK_IMAGE_MIME_TYPES)
  mimeType!: (typeof ASK_IMAGE_MIME_TYPES)[number];

  /** Base64-encoded image bytes, WITHOUT a `data:` URL prefix. */
  @IsString()
  @IsBase64()
  @MaxLength(MAX_IMAGE_BASE64_CHARS)
  data!: string;
}

export class AskDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  content!: string;

  /**
   * Optional per-question scope filters. Default (omitted) = search the whole
   * workspace. Tenant isolation (workspace) is always enforced server-side and
   * cannot be widened by these.
   */
  @IsOptional()
  @IsString()
  collectionId?: string;

  @IsOptional()
  @IsString()
  documentId?: string;

  /**
   * Images attached to THIS question — a pasted screenshot, a photo of a
   * whiteboard. They are sent to the model with the question and the retrieved
   * passages, but are not embedded or added to the knowledge base. Upload the
   * file as a document if it should become searchable.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => AskImageDto)
  images?: AskImageDto[];
}
