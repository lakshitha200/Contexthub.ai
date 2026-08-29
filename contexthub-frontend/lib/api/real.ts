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
  RegisterResult,
  User,
  Workspace,
  WorkspaceMember,
} from "../types";
import type { Invite, Role } from "../types";
import type { Api } from "./contract";
import { http } from "./http";

const enc = encodeURIComponent;

/** Build a `?a=1&b=2` string from defined values, or "" when there are none. */
function query(params?: object): string {
  if (!params) return "";
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string" && value) search.set(key, value);
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : "";
}

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
    // Registration does NOT sign you in — it returns a "verify your email" result.
    register: (p) =>
      http.post<RegisterResult>("/auth/register", p, { anonymous: true }),
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
    async verifyEmail(token) {
      const res = await http.post<AuthResponse>(
        "/auth/verify-email",
        { token },
        { anonymous: true },
      );
      tokenStore.set(res.tokens);
      return res;
    },
    resendVerification: (email) =>
      http.post<void>("/auth/verify-email/resend", { email }, { anonymous: true }),
    forgotPassword: (email) =>
      http.post<void>("/auth/forgot-password", { email }, { anonymous: true }),
    async resetPassword(token, newPassword) {
      const res = await http.post<AuthResponse>(
        "/auth/reset-password",
        { token, newPassword },
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
    async acceptInvite(token) {
      // Backend returns the created membership; surface its workspaceId.
      const member = await http.post<{ workspaceId: string }>("/workspaces/invites/accept", {
        token,
      });
      return { workspaceId: member.workspaceId };
    },
    listInvites: (id) => http.get<Invite[]>(`/workspaces/${enc(id)}/invites`),
    revokeInvite: (id, inviteId) =>
      http.del<void>(`/workspaces/${enc(id)}/invites/${enc(inviteId)}`),
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
    // All document routes are nested under the collection.
    list: (ws, col, filters) =>
      http.get<Document[]>(
        `/workspaces/${enc(ws)}/collections/${enc(col)}/documents${query(filters)}`,
      ),
    get: (ws, col, id) =>
      http.get<Document>(
        `/workspaces/${enc(ws)}/collections/${enc(col)}/documents/${enc(id)}`,
      ),
    upload: (ws, col, file) => {
      const form = new FormData();
      form.append("file", file);
      return http.upload<Document>(
        `/workspaces/${enc(ws)}/collections/${enc(col)}/documents`,
        form,
      );
    },
    reprocess: async (ws, col, id) => {
      await http.post<{ success: true }>(
        `/workspaces/${enc(ws)}/collections/${enc(col)}/documents/${enc(id)}/reprocess`,
      );
    },
    remove: (ws, col, id) =>
      http.del<void>(`/workspaces/${enc(ws)}/collections/${enc(col)}/documents/${enc(id)}`),
    async download(ws, col, id, filename) {
      const blob = await http.getBlob(
        `/workspaces/${enc(ws)}/collections/${enc(col)}/documents/${enc(id)}/download`,
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    },
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
    async chunkImageUrl(ws, chunkId) {
      const blob = await http.getBlob(
        `/workspaces/${enc(ws)}/chunks/${enc(chunkId)}/image`,
      );
      return URL.createObjectURL(blob);
    },
  },
};
