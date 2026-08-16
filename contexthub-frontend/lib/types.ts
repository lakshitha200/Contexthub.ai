/**
 * Shared domain types — mirror the NestJS backend contract 1:1.
 * Source of truth: contexthub-backend Prisma schema + DTOs.
 */

export type Role = "OWNER" | "ADMIN" | "MEMBER";

export type DocStatus =
  | "UPLOADED"
  | "PARSING"
  | "CHUNKING"
  | "EMBEDDING"
  | "READY"
  | "FAILED";

export type MessageRole = "USER" | "ASSISTANT";

/** Terminal statuses — no further processing expected. */
export const DOC_TERMINAL: DocStatus[] = ["READY", "FAILED"];

// ------------------------------------------------------------------
// Auth
// ------------------------------------------------------------------
export interface User {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  emailVerified: string | null;
  createdAt: string;
}

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse {
  user: User;
  tokens: Tokens;
}

/** Registration no longer signs you in — you must verify your email first. */
export interface RegisterResult {
  verificationRequired: boolean;
  email: string;
}

// ------------------------------------------------------------------
// Workspace
// ------------------------------------------------------------------
export interface Workspace {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  createdAt: string;
  /** Present on list responses — the caller's role in this workspace. */
  role?: Role;
  /** Convenience counters when the API includes them. */
  memberCount?: number;
  documentCount?: number;
}

export interface WorkspaceMember {
  id: string;
  userId: string;
  workspaceId: string;
  role: Role;
  joinedAt: string;
  user: Pick<User, "id" | "email" | "name" | "avatarUrl">;
}

/** A pending workspace invitation (sent, not yet accepted). */
export interface Invite {
  id: string;
  email: string;
  role: Role;
  createdAt: string;
  expiresAt: string;
}

// ------------------------------------------------------------------
// Collection
// ------------------------------------------------------------------
export interface Collection {
  id: string;
  workspaceId: string;
  name: string;
  createdAt: string;
  documentCount?: number;
}

// ------------------------------------------------------------------
// Document
// ------------------------------------------------------------------
export interface Document {
  id: string;
  workspaceId: string;
  collectionId: string;
  uploaderId: string | null;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  status: DocStatus;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  /** Who uploaded it — included by the list endpoint. */
  uploader?: { id: string; name: string | null; email: string };
}

// ------------------------------------------------------------------
// Chat / RAG
// ------------------------------------------------------------------
/**
 * What a retrieved passage was extracted from. Everything is embedded as text;
 * this says whether that text was body copy, a table, a vision description of
 * a chart, or a transcription of a scanned page.
 */
export type ChunkKind = "TEXT" | "TABLE" | "IMAGE" | "OCR";

export interface Citation {
  index: number;
  chunkId: string;
  documentId: string;
  filename: string;
  pageNumber: number | null;
  kind: ChunkKind;
  /** Set for IMAGE citations — fetch via api.chat.chunkImageUrl(). */
  imageKey: string | null;
  score: number;
  snippet: string;
}

export interface Message {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  citations: Citation[] | null;
  createdAt: string;
  /** Client-only: true while an assistant reply is streaming in. */
  pending?: boolean;
  /** Client-only: the answer request failed (renders an inline error bubble). */
  error?: boolean;
  /**
   * Client-only: object URLs for images attached to this question, so the user
   * sees what they sent. Not persisted — they vanish on reload, which matches
   * the backend (attached images are used for one turn and never stored).
   */
  attachments?: string[];
}

export interface Conversation {
  id: string;
  workspaceId: string;
  userId: string;
  collectionId: string | null;
  title: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationWithMessages extends Conversation {
  messages: Message[];
}

/** Response of POST .../messages (the RAG answer). */
export interface AskResponse {
  message: Message;
  citations: Citation[];
}

// ------------------------------------------------------------------
// Request payloads (DTOs)
// ------------------------------------------------------------------
export interface RegisterPayload {
  email: string;
  password: string;
  name?: string;
}
export interface LoginPayload {
  email: string;
  password: string;
}
export interface CreateWorkspacePayload {
  name: string;
  description?: string;
}
export interface InviteMemberPayload {
  email: string;
  role: "ADMIN" | "MEMBER";
}
export interface CreateConversationPayload {
  title?: string;
  collectionId?: string;
}
/** An image attached to a single question (base64, no `data:` prefix). */
export interface AskImage {
  mimeType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
  data: string;
}

export interface AskPayload {
  content: string;
  collectionId?: string;
  documentId?: string;
  /**
   * Images attached to THIS question. They are sent to the model with the
   * question but are not embedded or added to the knowledge base — upload the
   * file as a document if it should become searchable.
   */
  images?: AskImage[];
}
