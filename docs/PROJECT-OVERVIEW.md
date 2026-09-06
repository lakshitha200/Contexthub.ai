# ContextHub AI — Project Overview

> **Your team's knowledge, answered.**
> Upload documents, then ask anything. ContextHub retrieves the exact passages
> and answers with citations — grounded in *your* documents, never guessed.

ContextHub AI is a multi-tenant **RAG (Retrieval-Augmented Generation)** platform.
Teams organize documents into workspaces and collections; the system ingests,
chunks, and embeds them into a vector database; and a chat interface answers
questions using an LLM that is grounded strictly in those documents — every
factual claim traceable back to its source.

---

## 1. Vision

Most business knowledge lives scattered across PDFs, Word docs, spreadsheets,
and wikis. Finding an answer means remembering *which* file has it, then reading
through it. General AI chatbots can talk fluently but **hallucinate** and don't
know your private documents.

ContextHub's vision is a **trustworthy knowledge assistant for teams**:

- **Grounded, not guessed** — answers come only from your uploaded documents, with inline citations to the exact source passage.
- **Team-first** — knowledge is organized into shared workspaces with roles and invitations, so a whole team benefits from one curated knowledge base.
- **Effortless to feed** — drop in a file and it becomes searchable automatically (parse → chunk → embed), with live processing status.
- **Natural to use** — a fast, beautiful chat UI with citations, plus optional voice (speak questions, hear answers) so it feels like a real assistant.

The long-term goal is an **AI knowledge workspace** that any team can point at
their documents and immediately trust for sourced answers.

---

## 2. The problem it solves

| Pain | ContextHub's answer |
|------|---------------------|
| "Which document has this?" | Semantic search finds the right passages by *meaning*, not keywords. |
| "Can I trust this AI answer?" | Every document answer is cited to its source chunk (file + page + snippet). |
| "The AI makes things up." | Strict grounding — the model may only answer document questions from retrieved passages. |
| "Onboarding a teammate to our docs is slow." | Shared workspaces + invites give the whole team one searchable knowledge base. |
| "Setup is painful." | Upload a file; ingestion (parse/chunk/embed) runs automatically in the background. |

---

## 3. Who it's for

- **Teams & organizations** with a growing body of internal documents (research, product specs, policies, runbooks, contracts).
- **Knowledge workers** who need fast, sourced answers rather than reading whole files.
- **Workspace owners/admins** who curate collections and manage who has access.

---

## 4. Core concept — how RAG works here

RAG = **Retrieve** the relevant text, then let the LLM **Generate** an answer from it.

```
INGESTION (once per document, background)
  Upload → Parse text → Chunk into passages → Embed each chunk → Store vectors (pgvector)

QUERY (every question)
  Question → Embed → Nearest-neighbour search over chunks → Top-K passages
           → Build prompt (rules + history + passages) → Gemini → Cited answer
```

The LLM never "knows" your documents. Retrieval hands it the exact passages each
time, and the system attaches only the sources the answer actually cited.

---

## 5. Key features

### Knowledge & documents
- **Workspaces** — isolated tenants; a user can belong to many.
- **Collections** — folders that group documents; questions can be scoped to one.
- **Document upload** — PDF, Word (.doc/.docx), Markdown, HTML, CSV, JSON, text.
- **Automatic ingestion** — parse → chunk → embed → store, with a **live status badge** (`Queued → Parsing → Chunking → Embedding → Ready`, or `Failed`).
- **Reprocess / download / delete** documents; see **who uploaded** each and when.

### Chat / RAG
- **Grounded answers with citations** — inline sources collapse into a compact "N sources" control that opens a **right-side sources panel** (filename, page, % match, snippet).
- **Hybrid answering** — document questions are answered strictly from the passages and cited; greetings and general questions are answered conversationally (no fake citations).
- **Retrieval scope** — search the whole workspace or a single collection per conversation.
- **Conversations** — private per user, pinnable, searchable, auto-titled from the first question.
- **Streaming feel** — answers reveal progressively; graceful inline error + retry.

### Voice (optional)
- **Speak questions** (speech-to-text) and **hear answers read aloud** (text-to-speech).
- **Option A (built):** browser Web Speech API — free, on-device (Chrome/Edge).
- **Option B (planned):** cloud STT/TTS (natural voices, all browsers) behind an env toggle (`NEXT_PUBLIC_VOICE_PROVIDER`).

### Teams & access
- **Roles:** `OWNER`, `ADMIN`, `MEMBER` — role-based permissions on every action.
- **Invitations:** email an invite; see **pending invites**, **resend**, or **cancel** them; accept via a dedicated invite page.
- **Members management:** list, search/filter by role, remove members, leave a workspace.

### Authentication
- Email + password (bcrypt), with **email verification**.
- **Google OAuth** sign-in.
- **Magic-link** (passwordless) sign-in.
- **Password reset** flow.
- **JWT access + refresh** tokens with rotation and transparent refresh-on-expiry.

---

## 6. System architecture

```
┌────────────────────────┐         HTTPS / JSON          ┌──────────────────────────┐
│   Frontend (Next.js)    │  ───────────────────────────► │   Backend API (NestJS)    │
│  React 19 · Tailwind v4 │   Bearer JWT, /api/v1/*        │   Modular, guarded routes │
│  Zustand · Framer Motion│ ◄─────────────────────────────│                           │
└────────────────────────┘                                └────────────┬──────────────┘
        │  Web Speech (voice A)                                         │
        ▼                                                               ▼
   Browser STT/TTS                              ┌───────────────┬───────────────┬──────────────┐
                                                │ PostgreSQL +  │  Local/S3     │  Google       │
                                                │  pgvector     │  file storage │  Gemini API   │
                                                │ (data+vectors)│  (documents)  │ (embed + chat)│
                                                └───────────────┴───────────────┴──────────────┘
```

- **Frontend** — a client-rendered dashboard (App Router). Talks only to the API; holds no secrets.
- **Backend** — NestJS modules, each guarded and tenant-scoped. Global `/api/v1` prefix.
- **Database** — PostgreSQL with the **pgvector** extension; chunk embeddings live in a `vector(1536)` column.
- **Storage** — an abstracted `StorageService` (local filesystem now, swappable to S3) holds the raw uploaded bytes.
- **AI provider** — Google **Gemini** via `@google/genai` for both embeddings and chat generation. One service (`LlmService`) is the only chat-provider touchpoint, so swapping providers is a one-file change.

---

## 7. Technology stack

**Backend**
- NestJS 11 (TypeScript)
- Prisma 7 ORM · PostgreSQL · `pgvector`
- Google Gemini (`@google/genai`) — `gemini-embedding-001` (1536-dim) + `gemini-2.5-flash`
- Auth: `@nestjs/jwt`, Passport (JWT + Google OAuth), bcrypt
- Parsing: `pdf-parse`, `mammoth` (DOCX)
- Email: Resend / Nodemailer (SMTP)
- Background work: in-process job queue (`@nestjs/schedule`)

**Frontend**
- Next.js 16 (App Router, Turbopack) · React 19
- Tailwind CSS v4 (CSS-first theming, light/dark)
- Zustand (state) · Framer Motion (animation) · lucide-react (icons) · next-themes
- Web Speech API (voice, Option A)

---

## 8. Data model

```
User ──< WorkspaceMember >── Workspace ──< Collection ──< Document ──< Chunk (vector 1536)
  │                             │  │  │
  │                             │  │  └──< Conversation ──< Message (citations JSON)
  │                             │  └──< Invite
  │                             └──< AuditLog
  ├──< RefreshToken
  ├──< OAuthAccount
  └──< VerificationToken
```

- **User** joins **Workspaces** through **WorkspaceMember** (with a role).
- **Workspace** → many **Collections**; **Collection** → many **Documents**.
- **Document** → ordered **Chunks**, each with a `vector(1536)` embedding.
- **Conversation** belongs to a workspace (optionally scoped to a collection) → **Messages** (`USER` / `ASSISTANT`, with `citations`).
- **Invite**, **AuditLog**, **RefreshToken**, **OAuthAccount**, **VerificationToken** support access, teams, and security.

Tenant isolation is enforced everywhere: a resource ID from another workspace
returns **404**, never the record.

---

## 9. Backend modules

| # | Module | Responsibility | AI |
|---|--------|----------------|----|
| 1 | **Auth** | Register, login, refresh/rotate, logout, profile, email verification, password reset, magic link, Google OAuth. Global `JwtAuthGuard`; `@Public()` opts out. | — |
| 2 | **Workspace** | Workspace CRUD, membership, roles, invites (send/list/resend/revoke/accept), last-owner protection. `WorkspaceGuard` + `@Roles()`. | — |
| 3 | **Collection** | CRUD for document folders inside a workspace; reuses `WorkspaceGuard`. | — |
| 4 | **Document + Storage** | Upload (MIME allowlist + size cap), list, metadata, download (stream), reprocess, delete. Abstracted `StorageService`. | — |
| 5 | **Jobs + Ingestion** | Durable job queue + pipeline: parse → chunk → embed → store vectors. State machine with retries. | ⚠️ Embeddings |
| 6 | **Chat / RAG** | Conversations + the ask pipeline: embed question → pgvector search → prompt → Gemini → cited answer. Hybrid grounding. | ✅ Gemini |
| 7 | **Audit log** | Records actor + action per workspace *(schema exists; roadmap).* | — |

---

## 10. The RAG pipeline in detail

### Ingestion (background, per document)
1. **PARSING** — extract plain text from the file (PDF/DOCX/MD/…).
2. **CHUNKING** — split into ~500-token overlapping passages, cutting on natural boundaries (paragraph › sentence › word).
3. **EMBEDDING** — send chunk texts to Gemini in batches → one 1536-dim vector each, L2-normalized.
4. **STORE** — write chunks + vectors to Postgres/pgvector in one transaction (idempotent: old chunks deleted first). Status → **READY**.

Driven by an in-process **job queue**: upload enqueues an `ingest` job; a worker
processes it, advancing `DocStatus` and retrying transient failures.

### Query (per question)
1. Persist the user message; resolve retrieval scope (workspace, optional collection/document).
2. **Embed** the question (same model/dimension as ingestion).
3. **Nearest-neighbour search** over chunk vectors (`embedding <=> query`), top-K (default 5), scoped to the tenant.
4. **Assemble the prompt**: system rules + last ~10 turns + numbered context passages.
5. **Generate** with Gemini.
6. **Attach citations** the answer actually used (parse `[n]` markers), persist the assistant message, return `{ message, citations }`.

---

## 11. Security & multi-tenancy

- **Every route is authenticated** (global JWT guard); public routes opt out explicitly.
- **Workspace-scoped guards** verify membership and role on all nested resources.
- **Tenant isolation** — cross-workspace IDs 404; retrieval SQL always filters by `workspaceId`.
- **Secrets** stay server-side; passwords hashed (bcrypt); refresh & verification tokens stored **hashed**.
- **Refresh-token rotation** with reuse detection; transparent client-side refresh on 401.
- **Upload validation** — MIME allowlist, size cap, path-traversal-guarded storage keys.

---

## 12. Requirements

### Functional
- Users can register/verify/sign in (password, Google, magic link) and manage their profile.
- Users can create workspaces, invite members with roles, and manage/rescind invites.
- Users can create collections and upload documents that are automatically made searchable.
- Users can ask questions and receive answers grounded in their documents, with citations.
- Users can scope a conversation to a collection, and manage (pin/rename/delete) conversations.
- Users can optionally speak questions and hear answers.

### Non-functional
- **Accuracy/trust:** answers to document questions must be grounded and cited; no fabricated document facts.
- **Isolation:** strict multi-tenant separation of data and vectors.
- **Responsiveness:** live document status; fast, animated UI; graceful errors + retry.
- **Portability:** provider seams for storage (local↔S3), chat/embedding (Gemini↔other), and voice (browser↔cloud).
- **Security:** hashed credentials/tokens, role-based authorization, validated uploads.

---

## 13. Configuration (key env vars)

| Var | Purpose |
|-----|---------|
| `DATABASE_URL` | PostgreSQL (with `pgvector`) connection |
| `PORT` · `APP_URL` · `WEB_URL` | Server port, backend URL, frontend URL (OAuth/invite/magic-link redirects) |
| `JWT_ACCESS_SECRET` · `JWT_REFRESH_SECRET` (+ expiries) | Token signing |
| `GOOGLE_CLIENT_ID` · `GOOGLE_CLIENT_SECRET` · `GOOGLE_CALLBACK_URL` | Google OAuth |
| `RESEND_API_KEY` / `SMTP_*` | Transactional email (invites, verification, magic links) |
| `GEMINI_API_KEY` | Embeddings + chat |
| `EMBEDDING_MODEL` · `EMBEDDING_DIM` · `EMBEDDING_BATCH_SIZE` | Ingestion embeddings (`gemini-embedding-001`, 1536, 100) |
| `CHAT_MODEL` · `CHAT_TEMPERATURE` · `CHAT_MAX_OUTPUT_TOKENS` | RAG generation (`gemini-2.5-flash`) |
| `RAG_TOP_K` | Chunks retrieved per question (default 5) |
| `STORAGE_DIR` · `MAX_UPLOAD_MB` | File storage location & upload cap |
| `NEXT_PUBLIC_API_URL` | Frontend → backend base URL (`/api/v1`) |
| `NEXT_PUBLIC_VOICE_ENABLED` · `NEXT_PUBLIC_VOICE_PROVIDER` | Voice on/off; `browser` (built) or `cloud` (planned) |

---

## 14. Project structure

```
Contexthub AI/
├── contexthub-backend/         NestJS API
│   ├── src/
│   │   ├── auth/               Auth, guards, strategies, tokens, mail
│   │   ├── workspace/         Workspaces, members, invites
│   │   ├── collection/        Collections
│   │   ├── document/          Upload/list/download/delete
│   │   ├── storage/           File byte storage (local/S3 seam)
│   │   ├── jobs/              Durable job queue
│   │   ├── ingestion/         Parse → chunk → embed pipeline
│   │   ├── embedding/         Gemini embedding wrapper
│   │   ├── chat/             Conversations + RAG (retrieval, llm)
│   │   └── prisma/           Prisma service
│   └── prisma/schema/         Data models (user, auth, workspace, …, chunk)
│
└── contexthub-frontend/        Next.js app
    ├── app/                    Routes: auth/*, invite/*, (app)/workspaces, w/[id]/{chat,documents,members,settings}
    ├── components/             ui/, layout/, chat/, documents/, workspace/, auth/
    └── lib/                    api/ (typed client), store/ (zustand), voice/, hooks/, types
```

---

## 15. Roadmap

- **Cloud voice (Option B)** — backend `/voice/stt` + `/voice/tts`, natural voices, all browsers.
- **Audit log** — record and surface key workspace actions.
- **Retrieval quality** — reranking + hybrid (vector + keyword) search; contextual chunking.
- **Streaming** — true token streaming from Gemini (SSE).
- **Hardening** — rate limiting, pagination, OpenAPI/Swagger, e2e tests, observability.

---

*ContextHub AI — an AI knowledge workspace that turns your team's documents into
sourced, trustworthy answers.*
