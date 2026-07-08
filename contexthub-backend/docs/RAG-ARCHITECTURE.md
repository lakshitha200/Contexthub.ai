# ContextHub — RAG Architecture Guide

A complete walkthrough of how Retrieval-Augmented Generation (RAG) is built in this
codebase, the important design decisions behind it, the key methods, and a
**reusable mental model** you can lift into any other project.

> **Audience:** a backend/full-stack dev (NestJS / Prisma / Next.js) who is new to AI.
> Everything below is explained in plain API/engineering terms — no ML background needed.

---

## 0. What RAG actually is (in one paragraph)

An LLM only knows what it was trained on. RAG is the trick that lets it answer
questions about **your** documents: instead of fine-tuning the model, you **search**
your documents for the few passages relevant to the question, **paste those passages
into the prompt**, and tell the model *"answer using only this."* That's it. RAG =
**search + prompt-stuffing**. The model supplies language fluency; your search supplies
the facts.

This means RAG is **two independent halves**:

| Half | When it runs | Cost driver | Modules here |
|------|--------------|-------------|--------------|
| **Indexing** (write path) | once per document, in the background | number of documents | `document`, `ingestion`, `embedding`, `storage`, `jobs` |
| **Querying** (read path) | every time a user asks | number of questions | `chat` (retrieval / llm / chat / conversation) |

The **bridge** between the two halves is one database table: `Chunk`, which has a
`vector(1536)` column (pgvector). The write path fills it; the read path searches it.

---

## 1. The data model (the bridge)

```
Workspace ──< Collection ──< Document ──< Chunk(content, embedding vector(1536))
                                  │
Conversation ──< Message(role, content, citations JSON)
Job(type, status, payload, attempts)   ← generic background-work queue
```

Key file: `prisma/schema/chunk.prisma`

```prisma
model Chunk {
  id          String                       @id @default(cuid())
  documentId  String
  ordinal     Int                          // position within the document
  content     String                       // the chunk's plain text
  tokenCount  Int
  pageNumber  Int?
  startOffset Int?
  endOffset   Int?
  embedding   Unsupported("vector(1536)")? // ← the searchable vector
  createdAt   DateTime                     @default(now())

  document Document @relation(fields: [documentId], references: [id], onDelete: Cascade)
}
```

**Important point #1 — `Unsupported("vector(1536)")`.**
Prisma has no native type for pgvector, so the column is declared `Unsupported`,
which means **Prisma can neither read nor write it through the normal client.** Every
place that touches `embedding` uses **raw SQL** with a `'[0.1,0.2,...]'::vector`
literal. You'll see this twice: when writing (ingestion) and when searching (retrieval).

**Important point #2 — `onDelete: Cascade`.**
Delete a document and its chunks vanish automatically. The index can never contain
orphaned vectors pointing at a file that no longer exists.

---

## 2. Indexing (write path) — Document → Searchable Vectors

```
UPLOAD (sync, HTTP)            INGEST (async, background worker)
─────────────────             ─────────────────────────────────────────────
save file ──> create Document ──> enqueue Job ──> [PARSING → CHUNKING → EMBEDDING → READY]
status=UPLOADED                                                                   ↘ FAILED
```

### 2.1 Upload — `DocumentService.create()` — `src/document/document.service.ts`

Synchronous HTTP path. It does the *cheap* work and returns immediately:

1. `collections.getById()` — 404 if the collection isn't in your workspace (tenant check).
2. `validateFile()` — MIME allow-list + `MAX_UPLOAD_MB` size cap.
3. `storage.save()` — write raw bytes, get back an opaque `storageKey`.
4. `prisma.document.create({ status: UPLOADED })`.
5. **`jobs.enqueue('ingest', { documentId })`** ← hands the heavy work to the background.

> **Why split sync upload from async ingest?** Embedding a 50-page PDF makes many
> Gemini calls over several seconds. Doing that inside the HTTP request would hang the
> user's browser and time out. So upload just *records* the file; a worker processes it.

### 2.2 The job queue — `src/jobs/job.service.ts`

There is **no Redis/BullMQ** — the queue is a plain Postgres table. This is a
deliberate "don't add infrastructure you don't need yet" choice.

- `enqueue(type, payload)` — insert a `PENDING` row, then `signal.notify()` (an
  in-memory `EventEmitter`) to wake the worker instantly — no polling latency.
- `claimNext()` — the heart of the queue:
  ```sql
  UPDATE "Job" SET status='RUNNING', attempts=attempts+1
   WHERE id = (
     SELECT id FROM "Job" WHERE status='PENDING'
      ORDER BY "createdAt"
      FOR UPDATE SKIP LOCKED   -- two workers never grab the same row
      LIMIT 1
   ) RETURNING ...;
  ```
  `FOR UPDATE SKIP LOCKED` is the standard Postgres work-queue pattern — it makes the
  queue safe to run with multiple worker instances.
- `markDone` / `markFailed` / `markForRetry` — terminal & retry transitions.

### 2.3 The worker — `src/ingestion/ingestion.worker.ts`

**Event-driven, not timer-driven** — zero DB queries while idle:

- On boot: subscribe to the signal **and** `drain()` once (to pick up jobs left
  `PENDING` by a previous crash).
- `drain()` — claim & process jobs in a loop until the queue empties, then sleep. The
  `draining` / `wakeRequested` flags close the race where a job arrives in the instant
  the loop is exiting.
- `handle()` — on error: retry (`markForRetry` + backoff) until `attempts` reaches
  `INGEST_MAX_ATTEMPTS` (default 3), then `markFailed` (permanent). **An error never
  kills the worker** — the next signal wakes it again.

### 2.4 The pipeline — `IngestionService.process()` — `src/ingestion/ingestion.service.ts`

An explicit **state machine**. `Document.status` is updated at each step so the UI can
show live progress:

```
PARSING → CHUNKING → EMBEDDING → READY     (or FAILED on any error)
```

**Stage 1 — Parse** (`ParserService.parse()`): stored bytes → plain text, dispatched by
MIME type — PDF (`pdf-parse`), `.docx` (`mammoth`), HTML (regex strip), txt/md/csv/json
(raw UTF-8). Throws on no extractable text (e.g. a scanned image-only PDF).

**Stage 2 — Chunk** (`ChunkerService.split()`): plain text → overlapping windows.
- ~500 tokens/chunk (`MAX_CHARS ≈ 2000`, using the ~4-chars-per-token estimate).
- ~75-token (15%) overlap so meaning isn't lost at boundaries.
- `findBoundary()` prefers to cut on paragraph > sentence > space, never mid-word.

**Stage 3 — Embed** (`EmbeddingService.embed()`): chunk text → 1536-number vectors via
Gemini `gemini-embedding-001`, in sub-batches of 100. `l2Normalize()` scales each vector
to length 1 for consistent cosine scores. **Output dim must equal the `vector(1536)`
column** — there's a guard that throws on mismatch.

**Stage 4 — Store** (`replaceChunks()`): write chunks + vectors in **one transaction**.
- **Deletes existing chunks first** → the whole pipeline is **idempotent** (re-runs never
  duplicate).
- Uses raw SQL `INSERT ... ${literal}::vector` because Prisma can't write the vector type.

Then `status → READY`. Document is now searchable.

> **Important point #3 — idempotency.** Because `replaceChunks` deletes-then-inserts,
> you can safely retry or call `reprocess` any number of times. This is what makes the
> retry logic in the worker safe.

---

## 3. Querying (read path) — Question → Grounded, Cited Answer

```
question
   │ embed (same model as chunks!)
   ▼
pgvector top-K cosine search (workspace-scoped)   ← RetrievalService
   │ chunks
   ▼
build numbered context + history                   ← ChatService.buildTurns
   │ prompt
   ▼
Gemini with "cite & don't invent" system rule      ← LlmService.generate
   │
   ▼
persist assistant message + citations[]
```

### 3.1 Orchestrator — `ChatService.ask()` — `src/chat/chat.service.ts`

The full sequence:

1. `conversations.getOwnedOrThrow()` — 404 unless the conversation is this user's, in
   this workspace (tenant + owner isolation).
2. Load prior messages (history) **before** adding the new question.
3. Persist the USER message.
4. **Resolve scope**: `dto.collectionId ?? conversation.collectionId ?? null` (and
   optional `documentId`). Per-question filter overrides the conversation default;
   omitting both = whole workspace. `validateScope()` 404s on cross-tenant filter ids.
5. `retrieval.retrieve()` → top-K chunks.
6. **If 0 chunks**: return an honest canned reply and **do not call the LLM** (saves a
   token spend on an unanswerable question).
7. Else: `buildTurns()` → `llm.generate()` → answer.
8. Persist the ASSISTANT message with `citations[]` (JSON). Auto-title new conversations
   from the first question.

### 3.2 Retrieval — `RetrievalService.retrieve()` — `src/chat/retrieval.service.ts`

The "R" in RAG:

1. `embedding.embedOne(question)` — embed the question with the **same model** used for
   chunks. (Non-negotiable: query and documents must live in the same vector space.)
2. pgvector nearest-neighbour SQL:
   ```sql
   SELECT c.id, c.content, d.filename, (c.embedding <=> '[...]'::vector) AS distance
     FROM "Chunk" c JOIN "Document" d ON d.id = c."documentId"
    WHERE d."workspaceId" = ${workspaceId}   -- ← mandatory tenant isolation
      AND c.embedding IS NOT NULL
      ${collectionFilter} ${documentFilter}   -- ← optional, NARROW only
    ORDER BY c.embedding <=> '[...]'::vector   -- <=> = cosine distance
    LIMIT ${topK};                             -- RAG_TOP_K, default 5
   ```
3. Convert distance → `score = 1 - distance` (cosine similarity ∈ [0,1], higher = closer).

> **Important point #4 — tenant isolation is a *separate argument*, not a filter.**
> `workspaceId` is a mandatory positional param and a hard `WHERE` predicate; the
> collection/document filters are optional and can only ever *narrow* the result. This
> makes it structurally impossible to forget tenant scoping and leak another customer's
> data.

### 3.3 Prompt building — `ChatService.buildTurns()`

The "A" (Augment):
- Last `MAX_HISTORY_MESSAGES` (10) turns → conversational memory.
- Retrieved chunks → a **numbered context block**: `[1] (source: file.pdf, p.3)\n<text>`.
- Final user turn: `Context passages:\n\n<context>\n---\nQuestion: <question>`.

### 3.4 Generation — `LlmService.generate()` — `src/chat/llm.service.ts`

The "G":
- Gemini `gemini-2.5-flash`, temperature `0.2` (low = factual, not creative).
- The **system instruction is what makes this RAG and not a chatbot**:
  > "Answer ONLY using the numbered context passages. Cite inline with [1][2]. If the
  > context doesn't contain the answer, say you don't have enough information. Do not
  > invent facts."

  This is the anti-hallucination guardrail and the citation contract.

### 3.5 Citations — `ChatService.toCitations()`

Each chunk → `{ index, chunkId, documentId, filename, pageNumber, score, snippet }`
stored as JSON on the message. The `[1]` markers in the answer line up with this array,
so the frontend can render clickable, verifiable sources.

### 3.6 Full step-by-step trace — what runs when a user asks a question

This is the exact order of method calls for one `POST …/conversations/:id/messages`.
Two external calls happen (both to the LLM provider): one embed, one generate.
Everything else is your database.

```
POST .../messages
└─ WorkspaceGuard.canActivate           (auth: is the user a member of the workspace?)
└─ AskDto validation                    (content is 1–4000 chars)
└─ ChatController.ask
   └─ ChatService.ask
      ├─ 1. ConversationService.getOwnedOrThrow   → 404 unless conversation is this user's
      ├─ 2. ConversationService.listMessages       → load history (BEFORE saving new Q)
      ├─ 3. ConversationService.addMessage(USER)    → persist the question
      ├─ 4. ChatService.validateScope               → confirm scope belongs to workspace
      ├─ 5. RetrievalService.retrieve
      │     ├─ EmbeddingService.embedOne(question)  → [LLM embed API] → 1536-num vector
      │     └─ prisma.$queryRaw (pgvector `<=>` top-K, workspace-scoped)
      ├─ 6. if chunks.length === 0 → canned answer, SKIP the LLM ──┐
      ├─ 7. ChatService.toCitations(chunks)                         │  (source list for UI)
      ├─ 8. ChatService.buildTurns(history, question, chunks)       │  (assemble the prompt)
      ├─ 9. LlmService.generate(turns, SYSTEM_INSTRUCTION)          │  → [LLM chat API]
      ├─ 10. ConversationService.addMessage(ASSISTANT, citations) ──┘  (persist answer)
      ├─ 11. ConversationService.update (auto-title, first turn only)
      └─ 12. return { message, citations }
└─ HTTP 201 { message, citations }
```

**Step-by-step in words:**

1. **Authorize** — `getOwnedOrThrow` 404s unless the conversation belongs to this user in
   this workspace.
2. **Load history** — fetch prior messages **before** saving the new one, so the current
   question isn't pulled into the prompt twice (see 3.7).
3. **Save the question** — persist as a `USER` message.
4. **Resolve + validate scope** — decide the search boundary (see 3.7).
5. **Retrieve** — embed the question into a vector, then pgvector top-K search for the
   nearest chunks within the workspace. **This is where the question becomes a vector.**
6. **Empty guard** — no chunks at all → return an honest canned reply and **skip the LLM**
   (saves cost, prevents a made-up answer).
7. **Citations** — turn the retrieved chunks into a `[1] [2]…` source list for the UI.
   Built before the answer so the numbers line up with the prompt.
8. **Build the prompt** — combine history + numbered context block + the question.
9. **Generate** — send it all to the LLM with the strict system rule; get the answer text.
10. **Save the answer** — persist as an `ASSISTANT` message with the citations JSON.
11. **Auto-title** — on the very first turn, name the conversation after the question.
12. **Return** — `{ message, citations }` → the client renders the answer + clickable sources.

### 3.7 Common questions (things that trip people up)

**Q: What exactly does "embed the question" mean, and when does it happen?**
At step 5a — `embedding.embedOne(question)`. The question text is sent to the embedding
model and comes back as a 1536-number vector. It happens *after* the question is saved and
*right before* the vector search, because you need the vector to compare against the stored
chunk vectors. Flow: `question text → [embed] → vector → search`.

**Q: Why load history BEFORE saving the new question?**
To avoid the same message row appearing twice in one prompt. The prompt = history + the
current question (added separately). If you saved first, the just-saved question would come
back inside history, and the model would see it twice. Loading first guarantees `history`
only ever holds *earlier* turns.
*Note:* if the user genuinely asked the same text in an earlier turn, it correctly appears
in history — that's real memory, not duplication. The bug being prevented is the *same row*
twice in *one* turn, not the same *text* across *different* turns.

**Q: How is the search scope decided?**
First match wins:
`collectionId = dto.collectionId ?? conversation.collectionId ?? null`
1. filter sent with this question → use it;
2. else the conversation's default collection → use that;
3. else `null` = search the whole workspace.
The `workspaceId` is never part of this choice — it's always forced separately, so scope can
only ever *narrow* within your workspace, never cross into another tenant.

**Q: What do the three prompt lines do?**
```ts
citations = this.toCitations(chunks);                       // source list for the UI
const turns = this.buildTurns(priorMessages, question, chunks); // history + context + question
answer = await this.llm.generate(turns, SYSTEM_INSTRUCTION);    // call the LLM → answer
```
- `toCitations` — prepares the clickable `[1] [2]` sources (before the answer, so numbers align).
- `buildTurns` — assembles the prompt; `priorMessages` is included so follow-up questions
  ("and what about digital goods?") make sense with conversation memory.
- `generate` — the actual LLM call: sends history + context + question + the "only use the
  context, cite, don't invent" system rule, and returns the answer string.

---

## 4. Scenario coverage (what the design handles)

| Scenario | Behaviour | Where |
|---|---|---|
| Unsupported / oversized upload | 400 immediately, no job enqueued | `validateFile()` |
| Parse fails (scanned PDF, legacy `.doc`, empty) | `status=FAILED` + `errorMessage`; retried 3× then permanent | `process()` catch |
| Transient Gemini/network error | `markForRetry` + backoff, re-claimed later | `worker.handle()` |
| Server crash mid-ingest | Job survives in DB; `drain()` on next boot picks it up | `worker.onApplicationBootstrap` |
| Re-run / `reprocess` | `replaceChunks` deletes-first → no duplicates | `ingestion.service` |
| Ask before any doc is READY | 0 chunks → honest reply, **LLM not called** | `chat.service` |
| Answer not in the docs | LLM follows system rule → "not enough information" | system instruction |
| Cross-tenant access | Workspace `WHERE` predicate + `validateScope` 404 | `retrieval` / `chat` |
| Delete a document | Cascade-deletes chunks + removes stored file | schema + `document.service` |

---

## 5. Key configuration knobs

| Env var | Default | Controls |
|---|---|---|
| `MAX_UPLOAD_MB` | 25 | Upload size cap |
| `EMBEDDING_MODEL` | `gemini-embedding-001` | Embedding model |
| `EMBEDDING_DIM` | 1536 | Vector size — **must match `vector(N)` column + index** |
| `EMBEDDING_BATCH_SIZE` | 100 | Texts per embed request |
| `INGEST_MAX_ATTEMPTS` | 3 | Retries before a job fails permanently |
| `RAG_TOP_K` | 5 | How many chunks to retrieve per question |
| `CHAT_MODEL` | `gemini-2.5-flash` | Answer model |
| `CHAT_TEMPERATURE` | 0.2 | Lower = more factual |
| `CHAT_MAX_OUTPUT_TOKENS` | 1024 | Answer length cap |

> **Important point #5 — changing `EMBEDDING_MODEL`/`EMBEDDING_DIM` is a migration, not a
> config tweak.** Every existing chunk was embedded with the old model. You must
> re-embed everything *and* alter the `vector(N)` column + rebuild the pgvector index.

---

## 6. The reusable mental model (blueprint for any project)

If you want to build this pattern again, here is the skeleton, decoupled from
ContextHub. Copy this checklist.

### 6.1 The universal RAG shape

```
WRITE PATH (once per source):
   source ──> [extract text] ──> [chunk] ──> [embed] ──> [store vector] ──> READY

READ PATH (per question):
   question ──> [embed] ──> [vector search top-K] ──> [stuff into prompt] ──> [LLM] ──> answer + citations
```

The single rule that ties it together:
**the question and the chunks must be embedded by the same model into the same vector space.**

### 6.2 Component checklist (what every RAG system needs)

1. **Storage** for raw source bytes (filesystem now, S3 later — keep it behind a narrow
   `save/read/remove` interface so it's swappable).
2. **A status field / state machine** on each source (`UPLOADED → … → READY/FAILED`) so
   the UI and retries have a source of truth.
3. **A background worker + durable queue** — *never* parse/embed inside the HTTP request.
   A Postgres table + `FOR UPDATE SKIP LOCKED` is enough until you outgrow it.
4. **A parser per source type**, dispatched by MIME/format, behind one interface.
5. **A chunker** — overlapping windows, cut on natural boundaries. Start at ~500 tokens /
   ~15% overlap and tune.
6. **An embedding wrapper** behind a `embed(texts) → number[][]` interface so the
   provider is swappable in one file.
7. **A vector store** — pgvector if you already run Postgres; dedicated DB (Pinecone,
   Qdrant, Weaviate) only when scale demands it.
8. **A retriever** — embed query, top-K nearest-neighbour, **tenant scope as a hard
   predicate**, return content + metadata + score.
9. **An LLM wrapper** behind `generate(turns, systemInstruction) → string`.
10. **A prompt template** with a **strict system instruction**: answer only from context,
    cite sources, admit when the answer isn't there.
11. **Citations** wired from retrieved chunks back to the answer markers.

### 6.3 Design principles worth stealing

- **Decouple sync from async.** The user-facing request records intent and returns; the
  expensive work happens in a worker. The status field is the handshake.
- **Idempotent pipelines.** Delete-then-write so retries and reprocessing are always safe.
- **Provider behind an interface.** `EmbeddingService` / `LlmService` each hide the vendor
  in a single file. Swapping Gemini → OpenAI/Anthropic touches one file, not the app.
- **Tenant isolation is structural, not optional.** Make the scope a mandatory argument and
  a hard SQL predicate — never an optional filter someone can forget.
- **Don't call the LLM when you can't ground.** Zero chunks → honest canned answer. Saves
  money and prevents hallucination.
- **Constrain the model, then trust it.** Low temperature + a strict "only use the context"
  system prompt + citations turn a creative chatbot into a factual document assistant.
- **Add infrastructure only when forced.** Postgres-as-a-queue and pgvector-as-a-vector-DB
  carry you a long way before Redis/Pinecone earn their keep.

### 6.4 Where to upgrade later (when quality/scale demand it)

| Need | Upgrade |
|---|---|
| Better recall on keyword-y queries | **Hybrid search** — combine vector + BM25/full-text |
| Better precision on top results | **Re-ranker** (cross-encoder) over the top-K before prompting |
| Faster search at large scale | **HNSW index** tuning, or a dedicated vector DB |
| Cheaper/longer context | Summarize or compress retrieved chunks before stuffing |
| Streaming UX | Stream `generate()` tokens to the client (SSE) instead of awaiting the full answer |
| Multi-step questions | **Query rewriting / multi-query** retrieval before the final answer |

---

## 7. File map (where everything lives)

| Concern | File |
|---|---|
| Upload endpoint | `src/document/document.controller.ts` |
| Upload logic + enqueue | `src/document/document.service.ts` |
| Raw byte storage | `src/storage/storage.service.ts` |
| Durable job queue | `src/jobs/job.service.ts` |
| Background worker | `src/ingestion/ingestion.worker.ts` |
| Pipeline state machine | `src/ingestion/ingestion.service.ts` |
| Text extraction | `src/ingestion/parser.service.ts` |
| Chunking | `src/ingestion/chunker.service.ts` |
| Embeddings (Gemini) | `src/embedding/embedding.service.ts` |
| Vector search | `src/chat/retrieval.service.ts` |
| RAG orchestration | `src/chat/chat.service.ts` |
| LLM call (Gemini) | `src/chat/llm.service.ts` |
| Conversation/message CRUD | `src/chat/conversation.service.ts` |
| Chunk + vector schema | `prisma/schema/chunk.prisma` |
| Document + status enum | `prisma/schema/document.prisma` |

---

*One-line summary:*
**Write:** `file → storage + job → parse → chunk → embed → pgvector → READY`.
**Read:** `question → embed → top-K cosine search (workspace-scoped) → numbered context → Gemini "cite & don't invent" → cited answer`.
