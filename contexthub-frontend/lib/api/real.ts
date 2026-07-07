/** Real backend implementation of the Api contract (NestJS, /api/v1). */
import { tokenStore } from "../token-store";
import type {
  AskResponse,
  AuthResponse,
  Collection,
  Conversation,
  ConversationWithMessages,
  Document,
  Message,
  User,
  Workspace,
  WorkspaceMember,
} from "../types";
import { API_BASE_URL } from "./config";
import type { Api } from "./contract";
import { http } from "./http";

const enc = encodeURIComponent;

export const realApi: Api = {
  auth: {
    async login(p) {
      const res = await http.post<AuthResponse>("/auth/login", p, { anonymous: true });
      tokenStore.set(res.tokens);
      return res;
    },
    async register(p) {
      const res = await http.post<AuthResponse>("/auth/register", p, { anonymous: true });
      tokenStore.set(res.tokens);
      return res;
    },
    me: () => http.get<User>("/auth/me"),
    updateProfile: (p) => http.patch<User>("/auth/me", p),
    async logout() {
      const refreshToken = tokenStore.refresh;
      try {
        await http.post("/auth/logout", { refreshToken });
      } finally {
        tokenStore.clear();
      }
    },
    requestMagicLink: (email, name) =>
      http.post<void>("/auth/magic-link/request", { email, name }, { anonymous: true }),
    async verifyMagicLink(token) {
      const res = await http.get<AuthResponse>(
        `/auth/magic-link/verify?token=${encodeURIComponent(token)}`,
        { anonymous: true },
      );
      tokenStore.set(res.tokens);
      return res;
    },
  },

  workspaces: {
    list: () => http.get<Workspace[]>("/workspaces"),
    get: (id) => http.get<Workspace>(`/workspaces/${enc(id)}`),
    create: (p) => http.post<Workspace>("/workspaces", p),
    update: (id, p) => http.patch<Workspace>(`/workspaces/${enc(id)}`, p),
    remove: (id) => http.del<void>(`/workspaces/${enc(id)}`),
    members: (id) => http.get<WorkspaceMember[]>(`/workspaces/${enc(id)}/members`),
    invite: (id, p) => http.post<{ ok: true }>(`/workspaces/${enc(id)}/invite`, p),
    leave: (id) => http.post<void>(`/workspaces/${enc(id)}/leave`),
  },

  collections: {
    list: (ws) => http.get<Collection[]>(`/workspaces/${enc(ws)}/collections`),
    create: (ws, name) =>
      http.post<Collection>(`/workspaces/${enc(ws)}/collections`, { name }),
    update: (ws, id, name) =>
      http.patch<Collection>(`/workspaces/${enc(ws)}/collections/${enc(id)}`, { name }),
    remove: (ws, id) => http.del<void>(`/workspaces/${enc(ws)}/collections/${enc(id)}`),
  },

  documents: {
    list: (ws, col, status) =>
      http.get<Document[]>(
        `/workspaces/${enc(ws)}/collections/${enc(col)}/documents${
          status ? `?status=${status}` : ""
        }`,
      ),
    get: (ws, id) =>
      // documentId is unique; backend resolves collection internally on this route.
      http.get<Document>(`/workspaces/${enc(ws)}/documents/${enc(id)}`),
    upload: (ws, col, file) => {
      const form = new FormData();
      form.append("file", file);
      return http.upload<Document>(
        `/workspaces/${enc(ws)}/collections/${enc(col)}/documents`,
        form,
      );
    },
    reprocess: (ws, id) =>
      http.post<Document>(`/workspaces/${enc(ws)}/documents/${enc(id)}/reprocess`),
    remove: (ws, id) => http.del<void>(`/workspaces/${enc(ws)}/documents/${enc(id)}`),
    downloadUrl: (ws, id) =>
      `${API_BASE_URL}/workspaces/${enc(ws)}/documents/${enc(id)}/download`,
  },

  chat: {
    listConversations: (ws) =>
      http.get<Conversation[]>(`/workspaces/${enc(ws)}/conversations`),
    getConversation: (ws, id) =>
      http.get<ConversationWithMessages>(`/workspaces/${enc(ws)}/conversations/${enc(id)}`),
    createConversation: (ws, p) =>
      http.post<Conversation>(`/workspaces/${enc(ws)}/conversations`, p),
    updateConversation: (ws, id, p) =>
      http.patch<Conversation>(`/workspaces/${enc(ws)}/conversations/${enc(id)}`, p),
    removeConversation: (ws, id) =>
      http.del<void>(`/workspaces/${enc(ws)}/conversations/${enc(id)}`),
    listMessages: (ws, id) =>
      http.get<Message[]>(`/workspaces/${enc(ws)}/conversations/${enc(id)}/messages`),
    ask: (ws, id, p) =>
      http.post<AskResponse>(`/workspaces/${enc(ws)}/conversations/${enc(id)}/messages`, p),
  },
};
