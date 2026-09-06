/**
 * Image attachments for a single question.
 *
 * These are NOT knowledge-base uploads: the backend sends them to the model
 * with the question and then forgets them. Upload the file as a document if it
 * should become searchable.
 */
import type { AskImage } from "../types";

/** Must match ASK_IMAGE_MIME_TYPES in the backend's ask.dto.ts. */
export const ATTACH_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;

/** Matches @ArrayMaxSize(4) on AskDto.images. */
export const MAX_ATTACHMENTS = 4;

/**
 * The backend caps the base64 string at 10,000,000 chars. Base64 inflates by
 * 4/3, so this keeps us comfortably under it after encoding.
 */
export const MAX_ATTACHMENT_BYTES = 7 * 1024 * 1024;

export const ATTACH_ACCEPT = ATTACH_MIME_TYPES.join(",");

/** A picked image, before it is sent. */
export interface PendingAttachment {
  id: string;
  name: string;
  /** Object URL for the thumbnail — revoke it when the attachment is dropped. */
  previewUrl: string;
  image: AskImage;
}

export function isAttachableImage(file: File): boolean {
  return (ATTACH_MIME_TYPES as readonly string[]).includes(file.type);
}

/** Why a file was rejected, or null if it is fine. */
export function rejectionReason(file: File): string | null {
  if (!isAttachableImage(file)) return "PNG, JPEG, WebP or GIF only";
  if (file.size > MAX_ATTACHMENT_BYTES) return "Images must be under 7 MB";
  return null;
}

/** Read a File into the base64 shape the ask endpoint expects. */
export async function toPendingAttachment(
  file: File,
): Promise<PendingAttachment> {
  const data = await readAsBase64(file);
  return {
    id: `${file.name}-${file.size}-${file.lastModified}`,
    name: file.name,
    previewUrl: URL.createObjectURL(file),
    image: { mimeType: file.type as AskImage["mimeType"], data },
  };
}

/** Base64 payload only — the `data:<mime>;base64,` prefix is stripped. */
function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.onload = () => {
      const result = String(reader.result);
      const comma = result.indexOf(",");
      resolve(comma === -1 ? result : result.slice(comma + 1));
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Hand-off slot for the "new chat" screen, which starts a conversation and
 * navigates before the question is actually sent. The question itself rides
 * along in `?q=`, but images are far too large for a URL, so they wait here
 * for the conversation page to pick them up. Only one hand-off can be in
 * flight at a time, which is exactly how the flow works.
 */
let pending: PendingAttachment[] | null = null;

export const attachmentHandoff = {
  set(attachments: PendingAttachment[]) {
    pending = attachments.length ? attachments : null;
  },
  /** Read and clear — a hand-off must never be replayed on a later question. */
  take(): PendingAttachment[] {
    const value = pending ?? [];
    pending = null;
    return value;
  },
};
