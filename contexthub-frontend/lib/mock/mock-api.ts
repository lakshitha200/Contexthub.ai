/**
 * In-memory mock backend. Implements the same Api contract as the real client
 * so the entire UI is runnable without the NestJS server. Simulates network
 * latency, live document-processing progression, and grounded RAG answers.
 */
import { tokenStore } from "../token-store";
import type {
  AskResponse,
  Citation,
  Collection,
  Conversation,
  ConversationWithMessages,
  Document,
  DocStatus,
  Message,
  User,
  Workspace,
  WorkspaceMember,
} from "../types";
import { sleep } from "../utils";
import type { Api } from "../api/contract";
import { ApiError } from "../api/http";
import {
  seedCollections,
  seedConversations,
  seedDocuments,
  seedMembers,
  seedMessages,
  seedUser,
  seedWorkspaces,
} from "./seed";

// Mutable in-memory state (cloned from seed so edits don't mutate seed).
const db = {
  user: { ...seedUser },
  workspaces: seedWorkspaces.map((w) => ({ ...w })),
  members: structuredClone(seedMembers) as Record<string, WorkspaceMember[]>,
  collections: structuredClone(seedCollections) as Record<string, Collection[]>,
  documents: seedDocuments.map((d) => ({ ...d })),
  conversations: seedConversations.map((c) => ({ ...c })),
  messages: structuredClone(seedMessages) as Record<string, Message[]>,
};

const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 10)}`;
const nowIso = () => new Date().toISOString();

// --- document processing simulation ------------------------------------------
const PIPELINE: DocStatus[] = ["UPLOADED", "PARSING", "CHUNKING", "EMBEDDING", "READY"];

/** Advance a freshly-uploaded/reprocessed doc through the pipeline over time. */
function simulateProcessing(docId: string) {
  let step = 0;
  const tick = () => {
    const d = db.documents.find((x) => x.id === docId);
    if (!d) return;
    step += 1;
    if (step < PIPELINE.length) {
      d.status = PIPELINE[step];
      d.updatedAt = nowIso();
      setTimeout(tick, 2200 + Math.random() * 1600);
    }
  };
  setTimeout(tick, 1800);
}

function requireWorkspace(id: string) {
  const ws = db.workspaces.find((w) => w.id === id);
  if (!ws) throw new ApiError(404, "Workspace not found");
  return ws;
}

// --- canned RAG answer -------------------------------------------------------
function buildAnswer(workspaceId: string, question: string, collectionId?: string, documentId?: string): { content: string; citations: Citation[] } {
  const pool = db.documents.filter(
    (d) =>
      d.workspaceId === workspaceId &&
      d.status === "READY" &&
      (!collectionId || d.collectionId === collectionId) &&
      (!documentId || d.id === documentId),
  );

  if (pool.length === 0) {
    return {
      content:
        "I don't have any indexed documents to answer that from yet. Upload and process documents, then ask again.",
      citations: [],
    };
  }

  const top = pool.slice(0, 2);
  const citations: Citation[] = top.map((d, i) => ({
    index: i + 1,
    chunkId: uid("ch"),
    documentId: d.id,
    filename: d.filename,
    pageNumber: d.mimeType.includes("pdf") ? 1 + ((i * 7) % 20) : null,
    score: 0.9 - i * 0.07,
    snippet: `Relevant passage from "${d.filename}" discussing ${question
      .toLowerCase()
      .replace(/[?.!]/g, "")
      .slice(0, 60)} and related context used to ground this answer.`,
  }));

  const content =
    `Here's what I found in your documents regarding "${question.trim()}":\n\n` +
    `The most relevant source is **${top[0].filename}**, which directly addresses your question [1].` +
    (top[1] ? ` A supporting reference appears in **${top[1].filename}** [2].` : "") +
    `\n\nThis answer is grounded strictly in the ${top.length} retrieved passage${
      top.length > 1 ? "s" : ""
    } cited below — nothing was inferred beyond them.`;

  return { content, citations };
}

export const mockApi: Api = {
  auth: {
    async login(p) {
      await sleep(600);
      if (!p.email || !p.password) throw new ApiError(400, "Email and password required");
      if (p.password.length < 6) throw new ApiError(401, "Invalid email or password");
      const tokens = { accessToken: uid("acc"), refreshToken: uid("ref") };
      tokenStore.set(tokens);
      db.user.email = p.email;
      return { user: { ...db.user }, tokens };
    },
    async register(p) {
      await sleep(700);
      const tokens = { accessToken: uid("acc"), refreshToken: uid("ref") };
      tokenStore.set(tokens);
      db.user = { ...db.user, email: p.email, name: p.name ?? db.user.name };
      return { user: { ...db.user }, tokens };
    },
    async me() {
      await sleep(200);
      if (!tokenStore.has()) throw new ApiError(401, "Not authenticated");
      return { ...db.user };
    },
    async updateProfile(p) {
      await sleep(400);
      db.user = { ...db.user, ...p } as User;
      return { ...db.user };
    },
    async logout() {
      await sleep(150);
      tokenStore.clear();
    },
  },

  workspaces: {
    async list() {
      await sleep(350);
      return db.workspaces.map((w) => ({ ...w }));
    },
    async get(id) {
      await sleep(200);
      return { ...requireWorkspace(id) };
    },
    async create(p) {
      await sleep(500);
      const ws: Workspace = {
        id: uid("ws"),
        slug: p.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
        name: p.name,
        description: p.description ?? null,
        createdAt: nowIso(),
        role: "OWNER",
        memberCount: 1,
        documentCount: 0,
      };
      db.workspaces.unshift(ws);
      db.members[ws.id] = [
        { id: uid("m"), userId: db.user.id, workspaceId: ws.id, role: "OWNER", joinedAt: nowIso(), user: { id: db.user.id, email: db.user.email, name: db.user.name, avatarUrl: db.user.avatarUrl } },
      ];
      db.collections[ws.id] = [];
      return { ...ws };
    },
    async update(id, p) {
      await sleep(400);
      const ws = requireWorkspace(id);
      Object.assign(ws, p);
      return { ...ws };
    },
    async remove(id) {
      await sleep(400);
      db.workspaces = db.workspaces.filter((w) => w.id !== id);
    },
    async members(id) {
      await sleep(300);
      return (db.members[id] ?? []).map((m) => ({ ...m }));
    },
    async invite(id, p) {
      await sleep(500);
      requireWorkspace(id);
      const list = db.members[id] ?? (db.members[id] = []);
      list.push({ id: uid("m"), userId: uid("u"), workspaceId: id, role: p.role, joinedAt: nowIso(), user: { id: uid("u"), email: p.email, name: null, avatarUrl: null } });
      return { ok: true };
    },
    async leave(id) {
      await sleep(300);
      db.workspaces = db.workspaces.filter((w) => w.id !== id);
    },
  },

  collections: {
    async list(ws) {
      await sleep(280);
      return (db.collections[ws] ?? []).map((c) => ({ ...c }));
    },
    async create(ws, name) {
      await sleep(400);
      const col: Collection = { id: uid("col"), workspaceId: ws, name, createdAt: nowIso(), documentCount: 0 };
      (db.collections[ws] ?? (db.collections[ws] = [])).push(col);
      return { ...col };
    },
    async update(ws, id, name) {
      await sleep(350);
      const col = (db.collections[ws] ?? []).find((c) => c.id === id);
      if (!col) throw new ApiError(404, "Collection not found");
      col.name = name;
      return { ...col };
    },
    async remove(ws, id) {
      await sleep(350);
      db.collections[ws] = (db.collections[ws] ?? []).filter((c) => c.id !== id);
      db.documents = db.documents.filter((d) => d.collectionId !== id);
    },
  },

  documents: {
    async list(ws, col, status) {
      await sleep(300);
      return db.documents
        .filter((d) => d.workspaceId === ws && d.collectionId === col && (!status || d.status === status))
        .map((d) => ({ ...d }));
    },
    async get(ws, id) {
      await sleep(150);
      const d = db.documents.find((x) => x.workspaceId === ws && x.id === id);
      if (!d) throw new ApiError(404, "Document not found");
      return { ...d };
    },
    async upload(ws, col, file) {
      await sleep(900);
      const d: Document = {
        id: uid("doc"),
        workspaceId: ws,
        collectionId: col,
        uploaderId: db.user.id,
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        status: "UPLOADED",
        errorMessage: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      db.documents.unshift(d);
      const col_ = (db.collections[ws] ?? []).find((c) => c.id === col);
      if (col_) col_.documentCount = (col_.documentCount ?? 0) + 1;
      simulateProcessing(d.id);
      return { ...d };
    },
    async reprocess(ws, id) {
      await sleep(400);
      const d = db.documents.find((x) => x.id === id);
      if (!d) throw new ApiError(404, "Document not found");
      d.status = "UPLOADED";
      d.errorMessage = null;
      d.updatedAt = nowIso();
      simulateProcessing(d.id);
      return { ...d };
    },
    async remove(ws, id) {
      await sleep(300);
      db.documents = db.documents.filter((d) => d.id !== id);
    },
    downloadUrl() {
      return "#";
    },
  },

  chat: {
    async listConversations(ws) {
      await sleep(300);
      return db.conversations
        .filter((c) => c.workspaceId === ws)
        .sort((a, b) => Number(b.pinned) - Number(a.pinned) || +new Date(b.updatedAt) - +new Date(a.updatedAt))
        .map((c) => ({ ...c }));
    },
    async getConversation(ws, id) {
      await sleep(250);
      const conv = db.conversations.find((c) => c.workspaceId === ws && c.id === id);
      if (!conv) throw new ApiError(404, "Conversation not found");
      return { ...conv, messages: (db.messages[id] ?? []).map((m) => ({ ...m })) };
    },
    async createConversation(ws, p) {
      await sleep(350);
      const conv: Conversation = {
        id: uid("conv"),
        workspaceId: ws,
        userId: db.user.id,
        collectionId: p.collectionId ?? null,
        title: p.title ?? "New conversation",
        pinned: false,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      db.conversations.unshift(conv);
      db.messages[conv.id] = [];
      return { ...conv };
    },
    async updateConversation(ws, id, p) {
      await sleep(250);
      const conv = db.conversations.find((c) => c.id === id);
      if (!conv) throw new ApiError(404, "Conversation not found");
      Object.assign(conv, p, { updatedAt: nowIso() });
      return { ...conv };
    },
    async removeConversation(ws, id) {
      await sleep(250);
      db.conversations = db.conversations.filter((c) => c.id !== id);
      delete db.messages[id];
    },
    async listMessages(ws, id) {
      await sleep(200);
      return (db.messages[id] ?? []).map((m) => ({ ...m }));
    },
    async ask(ws, conversationId, p) {
      const list = db.messages[conversationId] ?? (db.messages[conversationId] = []);
      const userMsg: Message = {
        id: uid("msg"),
        conversationId,
        role: "USER",
        content: p.content,
        citations: null,
        createdAt: nowIso(),
      };
      list.push(userMsg);

      // Give the first turn a title.
      const conv = db.conversations.find((c) => c.id === conversationId);
      if (conv) {
        if (conv.title === "New conversation") conv.title = p.content.slice(0, 60);
        conv.updatedAt = nowIso();
      }

      await sleep(1100); // simulate retrieval + generation
      const { content, citations } = buildAnswer(ws, p.content, p.collectionId, p.documentId);
      const assistant: Message = {
        id: uid("msg"),
        conversationId,
        role: "ASSISTANT",
        content,
        citations,
        createdAt: nowIso(),
      };
      list.push(assistant);
      return { message: assistant, citations };
    },
  },
};
