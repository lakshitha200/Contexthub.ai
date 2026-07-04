/** Seed data for the in-memory mock backend. */
import type {
  Collection,
  Conversation,
  Document,
  Message,
  User,
  Workspace,
  WorkspaceMember,
} from "../types";

const now = Date.now();
const ago = (mins: number) => new Date(now - mins * 60_000).toISOString();

export const seedUser: User = {
  id: "u_me",
  email: "info@healplace.com",
  name: "Lakshitha Fernando",
  avatarUrl: null,
  emailVerified: ago(60 * 24 * 30),
  createdAt: ago(60 * 24 * 60),
};

export const seedWorkspaces: Workspace[] = [
  {
    id: "ws_acme",
    slug: "acme-research",
    name: "Acme Research",
    description: "Product, market & competitor knowledge base.",
    createdAt: ago(60 * 24 * 40),
    role: "OWNER",
    memberCount: 4,
    documentCount: 6,
  },
  {
    id: "ws_ops",
    slug: "internal-ops",
    name: "Internal Ops",
    description: "HR policies, runbooks and onboarding docs.",
    createdAt: ago(60 * 24 * 12),
    role: "ADMIN",
    memberCount: 9,
    documentCount: 3,
  },
];

export const seedMembers: Record<string, WorkspaceMember[]> = {
  ws_acme: [
    { id: "m1", userId: "u_me", workspaceId: "ws_acme", role: "OWNER", joinedAt: ago(60 * 24 * 40), user: { id: "u_me", email: seedUser.email, name: seedUser.name, avatarUrl: null } },
    { id: "m2", userId: "u_2", workspaceId: "ws_acme", role: "ADMIN", joinedAt: ago(60 * 24 * 20), user: { id: "u_2", email: "priya@acme.io", name: "Priya Nadar", avatarUrl: null } },
    { id: "m3", userId: "u_3", workspaceId: "ws_acme", role: "MEMBER", joinedAt: ago(60 * 24 * 8), user: { id: "u_3", email: "diego@acme.io", name: "Diego Santos", avatarUrl: null } },
    { id: "m4", userId: "u_4", workspaceId: "ws_acme", role: "MEMBER", joinedAt: ago(60 * 24 * 3), user: { id: "u_4", email: "mei@acme.io", name: "Mei Lin", avatarUrl: null } },
  ],
  ws_ops: [
    { id: "m5", userId: "u_me", workspaceId: "ws_ops", role: "ADMIN", joinedAt: ago(60 * 24 * 12), user: { id: "u_me", email: seedUser.email, name: seedUser.name, avatarUrl: null } },
    { id: "m6", userId: "u_5", workspaceId: "ws_ops", role: "OWNER", joinedAt: ago(60 * 24 * 30), user: { id: "u_5", email: "sam@healplace.com", name: "Sam Carter", avatarUrl: null } },
  ],
};

export const seedCollections: Record<string, Collection[]> = {
  ws_acme: [
    { id: "col_market", workspaceId: "ws_acme", name: "Market Research", createdAt: ago(60 * 24 * 30), documentCount: 3 },
    { id: "col_product", workspaceId: "ws_acme", name: "Product Specs", createdAt: ago(60 * 24 * 22), documentCount: 2 },
    { id: "col_legal", workspaceId: "ws_acme", name: "Legal & Contracts", createdAt: ago(60 * 24 * 10), documentCount: 1 },
  ],
  ws_ops: [
    { id: "col_hr", workspaceId: "ws_ops", name: "HR Policies", createdAt: ago(60 * 24 * 10), documentCount: 2 },
    { id: "col_runbooks", workspaceId: "ws_ops", name: "Runbooks", createdAt: ago(60 * 24 * 5), documentCount: 1 },
  ],
};

const doc = (
  id: string,
  workspaceId: string,
  collectionId: string,
  filename: string,
  mimeType: string,
  sizeBytes: number,
  status: Document["status"],
  minsAgo: number,
): Document => ({
  id,
  workspaceId,
  collectionId,
  uploaderId: "u_me",
  filename,
  mimeType,
  sizeBytes,
  status,
  errorMessage: status === "FAILED" ? "Unsupported PDF encoding (encrypted)" : null,
  createdAt: ago(minsAgo),
  updatedAt: ago(Math.max(0, minsAgo - 2)),
});

export const seedDocuments: Document[] = [
  doc("doc_1", "ws_acme", "col_market", "2026-market-landscape.pdf", "application/pdf", 2_412_544, "READY", 60 * 24 * 6),
  doc("doc_2", "ws_acme", "col_market", "competitor-teardown.pdf", "application/pdf", 1_884_112, "READY", 60 * 24 * 5),
  doc("doc_3", "ws_acme", "col_market", "user-interviews-q2.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", 642_113, "EMBEDDING", 6),
  doc("doc_4", "ws_acme", "col_product", "api-spec-v3.md", "text/markdown", 88_204, "READY", 60 * 24 * 2),
  doc("doc_5", "ws_acme", "col_product", "pricing-model.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", 220_940, "PARSING", 2),
  doc("doc_6", "ws_acme", "col_legal", "master-services-agreement.pdf", "application/pdf", 3_998_210, "FAILED", 60 * 24 * 1),
  doc("doc_7", "ws_ops", "col_hr", "employee-handbook-2026.pdf", "application/pdf", 4_120_880, "READY", 60 * 24 * 9),
  doc("doc_8", "ws_ops", "col_hr", "leave-policy.pdf", "application/pdf", 512_000, "READY", 60 * 24 * 8),
  doc("doc_9", "ws_ops", "col_runbooks", "incident-response.md", "text/markdown", 44_120, "READY", 60 * 24 * 4),
];

export const seedConversations: Conversation[] = [
  { id: "conv_1", workspaceId: "ws_acme", userId: "u_me", collectionId: "col_market", title: "Top competitor differentiators", pinned: true, createdAt: ago(120), updatedAt: ago(30) },
  { id: "conv_2", workspaceId: "ws_acme", userId: "u_me", collectionId: null, title: "Pricing tiers overview", pinned: false, createdAt: ago(300), updatedAt: ago(180) },
  { id: "conv_3", workspaceId: "ws_ops", userId: "u_me", collectionId: "col_hr", title: "Parental leave policy", pinned: false, createdAt: ago(60 * 20), updatedAt: ago(60 * 19) },
];

export const seedMessages: Record<string, Message[]> = {
  conv_1: [
    {
      id: "msg_1",
      conversationId: "conv_1",
      role: "USER",
      content: "What are the top 3 differentiators competitors highlight vs us?",
      citations: null,
      createdAt: ago(31),
    },
    {
      id: "msg_2",
      conversationId: "conv_1",
      role: "ASSISTANT",
      content:
        "Based on the competitor teardown, the three differentiators emphasized most are:\n\n1. **Faster onboarding** — rivals claim a sub-10-minute setup versus our multi-step flow [1].\n2. **Transparent pricing** — flat per-seat tiers with no usage overage, positioned against our metered model [2].\n3. **Native integrations** — 40+ prebuilt connectors marketed as a lock-in advantage [1].\n\nThe market landscape report notes these are messaging claims, not independently verified benchmarks [2].",
      citations: [
        { index: 1, chunkId: "ch_a", documentId: "doc_2", filename: "competitor-teardown.pdf", pageNumber: 4, score: 0.89, snippet: "Competitors consistently lead with onboarding speed (\"under 10 minutes\") and a library of 40+ native integrations as their primary wedge against incumbents." },
        { index: 2, chunkId: "ch_b", documentId: "doc_1", filename: "2026-market-landscape.pdf", pageNumber: 12, score: 0.83, snippet: "Pricing transparency remains a recurring theme; several vendors position flat per-seat pricing against metered models, though claims are seldom benchmarked." },
      ],
      createdAt: ago(30),
    },
  ],
  conv_2: [
    { id: "msg_3", conversationId: "conv_2", role: "USER", content: "Summarize our pricing tiers.", citations: null, createdAt: ago(181) },
    { id: "msg_4", conversationId: "conv_2", role: "ASSISTANT", content: "There are three tiers — Starter, Growth, and Enterprise — differentiated by seat count, retrieval volume, and support SLA [1].", citations: [{ index: 1, chunkId: "ch_c", documentId: "doc_5", filename: "pricing-model.xlsx", pageNumber: null, score: 0.78, snippet: "Starter / Growth / Enterprise tiers scale by seats and monthly retrieval quota; Enterprise adds a 99.9% SLA and SSO." }], createdAt: ago(180) },
  ],
  conv_3: [],
};
