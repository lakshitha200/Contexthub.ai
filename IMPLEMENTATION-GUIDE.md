# ContextHub AI — Remaining Build & GenAI Knowledge Guide

> Audience: a backend dev (NestJS / Prisma) who is **new to AI**.
> Every AI concept below is explained as *"it's just an API call / a SQL query / a data transform"* — no math required.
> Goal: explain **what is left to build, exactly how each part works, what knowledge you must acquire, and how the output is produced end-to-end.**

Status recap: **Auth, Workspace, Collection, Document+Storage = done.**
Remaining: **Ingestion pipeline, Chat (RAG), Audit, Hardening.**

---

# PART A — GenAI knowledge you must acquire

You only need ~8 concepts. None require ML background. Learn them in this order.

### A1. An LLM call is just a POST request

A Large Language Model (Claude) is an HTTP endpoint. You send messages, you get text back.

```
POST https://api.anthropic.com/v1/messages
{
  "model": "claude-sonnet-4-6",
  "system": "You are a helpful assistant. Only answer from the context.",
  "messages": [{ "role": "user", "content": "What is our refund policy?" }],
  "max_tokens": 1024
}
→ { "content": [{ "type": "text", "text": "Our refund policy is ..." }] }
```

That's the whole "AI". Everything else (RAG) is *what you put into that request*.

- **System prompt** = instructions/role (sent once, not from the user).
- **messages** = the conversation so far (user/assistant turns).
- The model has **no memory** — you resend history every call. It also has **no access to your DB** — you must paste relevant text into the prompt yourself. That pasting is what "RAG" means.

> 📌 Use the **`claude-api` skill** in this repo when you actually write this code — it scaffolds the Anthropic SDK with prompt caching and correct model IDs. Default model for answers: `claude-sonnet-4-6` (good quality/cost); `claude-haiku-4-5-20251001` for cheap/fast; `claude-opus-4-7` for hardest reasoning.

### A2. Tokens & context window

- A **token** ≈ ¾ of a word (~4 characters). "Hello world" ≈ 2–3 tokens.
- You pay **per token** (input + output) and there's a **max context window** (how much text fits in one request — large, but not infinite).
- Practical impact: you can't dump 500 PDFs into one prompt. You must **retrieve only the relevant slices** → this is the entire reason RAG exists.
- Rough rule for estimating: `tokens ≈ characters / 4`.

### A3. Embeddings = "turn text into a number array via an API call"

An **embedding model** is another HTTP endpoint. Input: a string. Output: a fixed-length array of floats (a "vector"), e.g. 1536 numbers.

```
embed("cancel my subscription")  → [0.013, -0.21, 0.08, ... ]  // length 1536
embed("how do I unsubscribe")    → [0.011, -0.20, 0.09, ... ]  // VERY close numbers
embed("photosynthesis in plants")→ [0.93,  0.04, -0.5, ... ]   // far away numbers
```

Key idea: **texts with similar meaning get similar vectors.** "Similar" = the arrays are close together in space. That's it. You don't compute this — the API does. You just store the array.

> ⚠️ **Critical detail:** Anthropic has **no embeddings API**. You use a separate provider (Anthropic officially recommends **Voyage AI**; **OpenAI `text-embedding-3-small`** is also common and is exactly **1536 dims**, which matches your `Chunk.embedding vector(1536)` schema). **The number in `vector(N)` MUST equal your chosen model's output dimension.** Pick the model first; if its dimension ≠ 1536, change the Prisma schema and re-migrate. Wrap it behind one `EmbeddingService` so the provider is swappable.

### A4. Vector similarity search = `ORDER BY distance LIMIT k`

Once every chunk's text is stored as a vector (in the `Chunk.embedding` column via **pgvector**), "find the most relevant chunks for a question" becomes a normal SQL query:

```sql
-- <=> is pgvector's cosine-distance operator. Smaller = more similar.
SELECT id, content
FROM "Chunk"
WHERE "documentId" IN (/* docs in this collection */)
ORDER BY embedding <=> $1::vector   -- $1 = the question's embedding
LIMIT 8;                            -- top-K most relevant chunks
```

That's "semantic search". No magic — it's `ORDER BY` on a distance function. pgvector adds the `vector` type, the `<=>` / `<->` / `<#>` operators, and an index type (HNSW) so this stays fast at scale.

### A5. Chunking = splitting documents into searchable pieces

You don't embed a whole 80-page PDF as one vector (too coarse — retrieval would be useless). You **split it into chunks** (~300–800 tokens each, with ~10–15% overlap so sentences aren't cut mid-thought), embed each chunk, and store each as a `Chunk` row.

- Too big → irrelevant text drags in, answers get vague.
- Too small → context fragments, model can't reason.
- Overlap → prevents losing meaning at chunk boundaries.

### A6. RAG = Retrieve, then Generate (the whole product in one sentence)

> **RAG**: embed the user's question → vector-search your chunks → paste the top chunks into Claude's prompt → Claude answers *using only that pasted text* → return the answer with citations to the source chunks.

It exists because the model doesn't know your private documents and can't fit them all in one prompt. You feed it just the relevant slices, on demand.

### A7. Grounding & citations (anti-hallucination)

LLMs will confidently make things up ("hallucinate"). You reduce this with the **system prompt** + structure:

- "Answer **only** from the provided context. If the answer isn't there, say *'I don't know based on the available documents.'*"
- Give each retrieved chunk an ID/number in the prompt; ask the model to cite which chunk numbers it used. Store those in `Message.citations` (the schema already has this `Json?` field).

### A8. Streaming responses (SSE)

LLM answers are generated token-by-token. Instead of waiting for the full answer, you **stream** it so the UI types it out live. Anthropic's API supports `stream: true`; in NestJS you expose it as **Server-Sent Events** (`text/event-stream`). Optional for v1 (you can return the full answer first), but expected for good UX.

### A9. Cost & latency mental model

| Operation | Roughly | Notes |
|-----------|---------|-------|
| Embed a chunk | very cheap | done once per chunk at ingest time |
| Embed a question | very cheap | once per user message |
| Vector search | fast (DB) | needs HNSW index at scale |
| Claude answer | the expensive/slow part | pay per input+output token; **prompt caching** cuts repeat cost |

**Prompt caching**: if your system prompt / instructions are large and constant, Anthropic can cache them so you don't pay full price every call. The `claude-api` skill sets this up.

### Knowledge checklist (tick these off before coding Part B)

- [ ] I can call the Claude Messages API and explain system vs messages.
- [ ] I understand tokens, context window, per-token cost.
- [ ] I can call an embeddings API and know my model's vector dimension.
- [ ] I installed `pgvector` and ran a `ORDER BY embedding <=> $1` query by hand.
- [ ] I can explain chunking + overlap and why.
- [ ] I can draw the RAG loop from memory (A6).
- [ ] I know how to write a grounded system prompt + capture citations.
- [ ] (Optional) I can stream tokens over SSE.

Minimal study sources: Anthropic docs (Messages API, prompt caching, streaming), your embedding provider's docs, the `pgvector` README, "RAG" overview articles. ~1–2 days total.

---

# PART B — Remaining modules: full construction process

## ⛔ Prerequisite blocker: npm registry is offline here

`npm install` failed earlier with `UNABLE_TO_VERIFY_LEAF_SIGNATURE` (corporate TLS interception). Ingestion/Chat need new packages. **Resolve this first**, by one of:

- Point Node at the corporate root CA: set env `NODE_EXTRA_CA_CERTS=C:\path\to\corp-root-ca.pem`, then `npm install`.
- `npm config set cafile C:\path\to\corp-root-ca.pem`.
- Use the internal/proxy registry: `npm config set registry https://<internal-registry>`.
- Last resort (dev only, insecure): `npm config set strict-ssl false`.

Packages you will add:

| Package | For |
|---------|-----|
| `@anthropic-ai/sdk` | Claude calls (Chat module) |
| embeddings SDK (`openai` *or* `voyageai`) | Embedding chunks & queries |
| `pdf-parse` (or `pdfjs-dist`) | Extract text from PDF |
| `mammoth` | Extract text from `.docx` |
| `@nestjs/throttler` | Rate limiting (hardening) |
| `@nestjs/swagger` | API docs (hardening) |

---

## Module 5 — Job + Ingestion pipeline  ⚠️ (first AI module: embeddings)

**Goal:** turn an uploaded file (`status=UPLOADED`) into searchable `Chunk` rows with embeddings, ending at `status=READY` (or `FAILED`). This is the producer side of RAG.

### Schema touchpoints (all already exist)
- `Document.status` — drive `UPLOADED → PARSING → CHUNKING → EMBEDDING → READY/FAILED`.
- `Chunk` — one row per chunk; `embedding vector(1536)` is `Unsupported(...)` in Prisma → **must use raw SQL** to write/read it.
- `Job` — generic durable queue row (`type`, `status`, `payload`, `attempts`, `errorMessage`).

### Build steps

**1. `EmbeddingService` (provider-agnostic)**
```ts
@Injectable()
export class EmbeddingService {
  // returns number[][] — one vector per input text
  async embed(texts: string[]): Promise<number[][]> { /* call provider API */ }
  readonly dimension = 1536; // MUST equal Prisma vector(N)
}
```
One method, batched. Swapping OpenAI↔Voyage later = change only this file.

**2. `ParserService` — bytes → plain text**, dispatched by `mimeType`:
- `application/pdf` → `pdf-parse`
- `.docx` → `mammoth`
- `text/*`, `csv`, `json`, `md`, `html` → read buffer as UTF-8 (strip HTML tags for `text/html`)
- Reads bytes via the existing `StorageService.createReadStream(storageKey)`.

**3. `ChunkerService` — text → chunks**
- Split on paragraphs/sentences, pack into ~500-token windows with ~75-token overlap.
- Token estimate without a tokenizer: `Math.ceil(text.length / 4)`.
- Output: `{ ordinal, content, tokenCount, pageNumber?, startOffset?, endOffset? }[]`.

**4. Queue strategy — use the existing `Job` table (no Redis needed)**

| Option | Verdict |
|--------|---------|
| Inline `await` after upload | ❌ blocks the HTTP response; lost on crash |
| **`Job` table + polling worker** | ✅ **recommended** — durable, no new infra, schema already there |
| BullMQ + Redis | Good at scale, but adds infra; defer |

A `JobService.enqueue(type, payload)` inserts a `Job{status:'PENDING'}`. A worker (`@Interval` from `@nestjs/schedule`, or a `setInterval` provider) polls `PENDING` jobs, marks `RUNNING`, dispatches by `type`, sets `DONE`/`FAILED`, increments `attempts`, retries up to N.

**5. `IngestionService.process(documentId)`** — the orchestration:
```
load Document
try:
  status = PARSING   → text = parser.parse(doc)
  status = CHUNKING  → chunks = chunker.split(text)
  status = EMBEDDING → vectors = embedding.embed(chunks.map(c=>c.content))
  insert Chunk rows WITH embeddings via raw SQL (see step 7)
  status = READY
catch e:
  status = FAILED; errorMessage = e.message   // worker may retry
```
Make it **idempotent**: on reprocess, `DELETE FROM "Chunk" WHERE documentId=?` before re-inserting.

**6. Trigger on upload**: in `DocumentService.create(...)`, after the row is created, call `jobs.enqueue('ingest', { documentId })`. (Inject `JobService` into `DocumentModule`.)

**7. pgvector wiring (the one tricky bit)**

Prisma can't read/write `vector` columns (`Unsupported`). So:
- One-time DB setup (migration / manual): `CREATE EXTENSION IF NOT EXISTS vector;`
- Add an index for speed:
  `CREATE INDEX ON "Chunk" USING hnsw (embedding vector_cosine_ops);`
- Insert embeddings with **raw SQL** (vector literal is a string like `'[0.1,0.2,...]'`):
```ts
await prisma.$executeRaw`
  INSERT INTO "Chunk" (id,"documentId",ordinal,content,"tokenCount",embedding,"createdAt")
  VALUES (${id}, ${documentId}, ${ordinal}, ${content}, ${tokenCount},
          ${`[${vector.join(',')}]`}::vector, now())`;
```
- Everything non-vector on `Chunk` can still use normal Prisma.

**8. Errors/retries:** cap `attempts` (e.g. 3); on final failure leave `Document.status=FAILED` + `errorMessage`; expose a `POST .../documents/:id/reprocess` (OWNER/ADMIN) that re-enqueues.

### How it works / output
Input: a `Document` row + stored file. Output: N `Chunk` rows, each with text + a 1536-d embedding, and `Document.status=READY`. No user-facing response — it's a background transform that **makes the document retrievable**. Observable via the existing `GET .../documents?status=READY`.

---

## Module 6 — Chat / RAG  ✅ (the Gen AI module: Claude)

**Goal:** user asks a question in a `Conversation`; system retrieves relevant chunks and asks Claude to answer **grounded in them**, with citations; persist the turn.

### Schema touchpoints (exist)
`Conversation` (workspace, optional `collectionId`, `title`, `pinned`), `Message` (`role` USER/ASSISTANT, `content`, `citations Json?`).

### Build steps

**1. Conversation/Message CRUD** (nested under workspace → reuse `WorkspaceGuard`):

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/workspaces/:id/conversations` | Start (optional `collectionId`) |
| GET | `/workspaces/:id/conversations` | List mine |
| GET | `/workspaces/:id/conversations/:cid` | Get + messages |
| PATCH | `/workspaces/:id/conversations/:cid` | Rename / pin |
| DELETE | `/workspaces/:id/conversations/:cid` | Delete |
| POST | `/workspaces/:id/conversations/:cid/messages` | **Ask a question (the RAG call)** |

**2. The RAG endpoint (`POST .../messages`) — the core loop:**

```
a. Persist the USER Message.
b. queryVec = EmbeddingService.embed([question])         // A3
c. Raw SQL vector search (A4), scoped to the conversation's
   collection (or whole workspace), top-K (e.g. 8) Chunks.
d. Build the prompt:
   system  = grounding rules (A7) + answer format
   context = numbered retrieved chunks ([1] ... [8] with doc names)
   messages = prior conversation history + the new question
e. Call Claude (claude-sonnet-4-6) via @anthropic-ai/sdk
   (use the `claude-api` skill: prompt caching + correct model id).
f. Parse answer; map cited [n] back to Chunk/Document ids.
g. Persist ASSISTANT Message with content + citations JSON.
h. Return { answer, citations }  (or stream — step 4).
```

**3. Prompt shape (concrete):**
```
system: "You are ContextHub's assistant. Answer ONLY using the numbered
         context. If it's not there, say you don't know. Cite sources as [n]."
user:   "Context:
         [1] (handbook.pdf) <chunk text>
         [2] (policy.pdf)   <chunk text>
         ...
         Question: What is the refund window?"
```
Retrieved chunk → `[n]` mapping lets you turn `[2]` in the answer into a real `{documentId, chunkId, filename}` stored in `Message.citations`.

**4. Streaming (optional v1, recommended v2):** Anthropic `stream:true` → NestJS `@Sse()` endpoint emitting `text/event-stream`; persist the full ASSISTANT message once the stream ends.

**5. Guardrails:** empty retrieval → return "I don't have documents to answer that" without calling Claude (save cost); cap history length (token budget, A2); rate-limit (hardening).

### How it works / output
Input: a question string. Output: a grounded answer + citation list, persisted as a `Message`. Example response:
```json
{
  "answer": "Refunds are available within 30 days of purchase [1].",
  "citations": [{ "n": 1, "documentId": "doc_x", "filename": "policy.pdf" }]
}
```
This is the product's payoff — everything in Modules 1–5 exists to make this call accurate.

---

## Module 7 — Audit log  (no AI)

**Goal:** record who did what per workspace (`AuditLog` schema exists).

- **How:** a NestJS **interceptor** (or explicit `audit.record(...)` calls in services) writing `{ workspaceId, actorId, action, targetType, targetId, metadata, ipAddress }`.
- **Log:** invites, role changes, member removal, collection/document create & delete, conversation deletes.
- **API:** `GET /workspaces/:id/audit-logs` (OWNER/ADMIN, paginated, filter by action/actor/date).
- Non-blocking: failures to write audit must never break the main request.

---

## Module 8 — Hardening (no AI)

| Item | How |
|------|-----|
| Rate limiting | `@nestjs/throttler` global guard; stricter limit on the RAG endpoint (cost) |
| Pagination | `?page&pageSize` on all list endpoints (documents, conversations, audit) |
| API docs | `@nestjs/swagger` → `/api/docs` |
| Secrets/config | Validate env at boot (`@nestjs/config` schema); never log keys |
| e2e tests | Supertest happy paths; first fix the **Jest/Prisma-ESM** resolver issue (add `moduleNameMapper` for `generated/prisma`) |
| Observability | Log job failures, Claude latency/token usage, retrieval hit counts |

---

# PART C — Full end-to-end output process

How a user question becomes a cited answer (every hop, with the AI parts marked 🤖):

```
1. Upload                POST /collections/:id/documents
                         → Document(status=UPLOADED), bytes → StorageService
                         → JobService.enqueue('ingest', {documentId})

2. Ingest (background)   Job worker picks it up
   PARSING               ParserService: PDF/docx/txt → plain text
   CHUNKING              ChunkerService: text → ~500-token chunks (+overlap)
   EMBEDDING 🤖          EmbeddingService.embed(chunks) → vectors[1536]
                         raw-SQL INSERT Chunk rows (content + embedding)
   READY                 Document.status = READY  (now retrievable)

3. Ask                   POST /conversations/:cid/messages { question }
                         persist USER Message

4. Retrieve 🤖           embed(question) → queryVec
                         SQL: ORDER BY embedding <=> queryVec LIMIT 8
                         → top-K relevant Chunks (scoped to collection)

5. Generate 🤖           build prompt (grounding + numbered chunks + history)
                         Anthropic Messages API (claude-sonnet-4-6, cached)
                         → grounded answer text with [n] citations

6. Respond               map [n] → {documentId, filename}
                         persist ASSISTANT Message (content + citations JSON)
                         return/stream answer to client

7. Audit                 AuditLog row written for the action
```

**Three AI touchpoints total**, and only two distinct AI APIs:
- **Embeddings API** — used twice (step 2 on chunks, step 4 on the question). Cheap.
- **Claude Messages API** — used once per question (step 5). The main cost/quality lever.

Everything else is ordinary NestJS + Prisma + SQL you already know.

---

# Build order & "definition of done"

1. **Resolve npm/TLS blocker** → can `npm install`.
2. **pgvector enabled** in Postgres + HNSW index → manual `<=>` query returns rows.
3. **Module 5 (Ingestion)** → upload a PDF, it reaches `status=READY` with Chunk rows that have embeddings.
4. **Module 6 (Chat/RAG)** → ask a question, get a correct answer citing the right document.
5. **Module 7 (Audit)** → actions appear in `GET /audit-logs`.
6. **Module 8 (Hardening)** → throttling, pagination, Swagger, green e2e.

When step 4 returns an accurate, cited answer from your own uploaded document, the product fundamentally works — the rest is polish.
