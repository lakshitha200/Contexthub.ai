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
import type { Role } from "../types";
import { API_BASE_URL } from "./config";
import type { Api } from "./contract";
import { http } from "./http";

const enc = encodeURIComponent;

// ------------------------------------------------------------------
// Normalizers — the backend nests counts under `_count` and returns the
// caller's role only on list endpoints, so we flatten to the UI's flat types.
// ------------------------------------------------------------------
type RawWorkspace = Omit<Workspace, "role" | "memberCount" | "documentCount"> & {
  role?: Role;
  members?: { role: Role }[];
  _count?: { members?: number; documents?: number; collections?: number };
};

function mapWorkspace(w: RawWorkspace): Workspace {
  return {
    id: w.id,
    slug: w.slug,
    name: w.name,
    description: w.description,
    createdAt: w.createdAt,
    role: w.role ?? w.members?.[0]?.role,
    memberCount: w._count?.members,
    documentCount: w._count?.documents,
  };
}

type RawCollection = Omit<Collection, "documentCount"> & {
  _count?: { documents?: number; conversations?: number };
};

function mapCollection(c: RawCollection): Collection {
  return {
    id: c.id,
    workspaceId: c.workspaceId,
    name: c.name,
    createdAt: c.createdAt,
    documentCount: c._count?.documents,
  };
}

type RawMember = {
  id: string;
  role: Role;
  joinedAt: string;
  user: { id: string; email: string; name: string | null; avatarUrl: string | null };
};

function mapMember(m: RawMember, workspaceId: string): WorkspaceMember {
  return {
    id: m.id,
    userId: m.user.id, // backend omits userId; derive from the included user
    workspaceId,
    role: m.role,
    joinedAt: m.joinedAt,
    user: m.user,
  };
}

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
    async list() {
      const raw = await http.get<RawWorkspace[]>("/workspaces");
      return raw.map(mapWorkspace);
    },
    async get(id) {
      // getById omits the caller's role, so resolve it from the list (which
      // includes role + counts). Fall back to the canonical fetch if missing.
      const list = await http.get<RawWorkspace[]>("/workspaces");
      const found = list.find((w) => w.id === id);
      if (found) return mapWorkspace(found);
      return mapWorkspace(await http.get<RawWorkspace>(`/workspaces/${enc(id)}`));
    },
    async create(p) {
      const raw = await http.post<RawWorkspace>("/workspaces", p);
      return {
        ...mapWorkspace(raw),
        memberCount: raw._count?.members ?? 1,
        documentCount: raw._count?.documents ?? 0,
      };
    },
    async update(id, p) {
      return mapWorkspace(await http.patch<RawWorkspace>(`/workspaces/${enc(id)}`, p));
    },
    remove: (id) => http.del<void>(`/workspaces/${enc(id)}`),
    async members(id) {
      const raw = await http.get<RawMember[]>(`/workspaces/${enc(id)}/members`);
      return raw.map((m) => mapMember(m, id));
    },
    invite: (id, p) => http.post<{ ok: true }>(`/workspaces/${enc(id)}/invite`, p),
    removeMember: (id, userId) =>
      http.del<void>(`/workspaces/${enc(id)}/members/${enc(userId)}`),
    leave: (id) => http.post<void>(`/workspaces/${enc(id)}/leave`),
  },

  collections: {
    async list(ws) {
      const raw = await http.get<RawCollection[]>(`/workspaces/${enc(ws)}/collections`);
      return raw.map(mapCollection);
    },
    async create(ws, name) {
      return mapCollection(
        await http.post<RawCollection>(`/workspaces/${enc(ws)}/collections`, { name }),
      );
    },
    async update(ws, id, name) {
      return mapCollection(
        await http.patch<RawCollection>(`/workspaces/${enc(ws)}/collections/${enc(id)}`, { name }),
      );
    },
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
