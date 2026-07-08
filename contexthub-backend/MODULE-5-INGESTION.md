# Module 5 — Job + Ingestion Pipeline (Build Doc)

> **Audience:** a NestJS/Prisma developer, new to AI.
> **Goal of this module:** turn an uploaded file (`Document.status = UPLOADED`)
> into searchable `Chunk` rows that each carry a 1536-dimension embedding,
> ending at `status = READY` (or `FAILED`). This is the **producer** side of RAG —
> it makes documents retrievable. Module 6 (Chat) is the consumer.
>
> Every AI concept here is "just an API call + a SQL query". No ML required.

---

## 0. Mental model — what we are actually building

A user uploads a PDF. We can't paste an 80-page PDF into an LLM prompt (too big,
too expensive, mostly irrelevant). So we **pre-process** every document once, at
upload time, into small searchable pieces:

```
file bytes ──parse──► plain text ──chunk──► ~500-token pieces ──embed──► vectors
                                                                          │
                                                                          ▼
                                                              stored in Chunk table
                                                              (pgvector column)
```

Later, a question gets embedded the same way and we run `ORDER BY embedding <=> $query`
to find the closest chunks. That's the entire payoff. **This module fills the
`Chunk` table.**

### Why this runs in the background (not inline in the upload request)

Parsing + chunking + embedding a large PDF can take many seconds and makes
external API calls (Gemini) that can fail or rate-limit. If we did it inside the
`POST /documents` request:

- the HTTP request would hang for the whole pipeline,
- a server crash or timeout mid-way would lose the work with no record,
- one slow upload would tie up a request worker.

**Production practice:** upload returns immediately (`status = UPLOADED`), and a
**durable job** drives the heavy work asynchronously. We already have a generic
`Job` table for exactly this — no Redis/BullMQ needed at this scale.

---

## 1. What already exists (don't rebuild these)

| Piece | File | Status |
|-------|------|--------|
| `EmbeddingService` (Gemini, batched, L2-normalized, dim-checked) | `src/embedding/embedding.service.ts` | ✅ written, exported `@Global()` |
| `Chunk` model (`vector(1536)` via `Unsupported`) | `prisma/schema/chunk.prisma` | ✅ schema exists |
| `Job` model (generic queue row) | `prisma/schema/job.prisma` | ✅ schema exists |
| `Document` + `DocStatus` enum | `prisma/schema/document.prisma` | ✅ |
| `StorageService.createReadStream(key)` (read bytes) | `src/storage/storage.service.ts` | ✅ |
| Upload endpoint creating `status = UPLOADED` | `src/document/document.service.ts` | ✅ |

**The data model is done. This module is application code only.**

### The one schema gotcha: `embedding` is `Unsupported`

```prisma
// prisma/schema/chunk.prisma
embedding Unsupported("vector(1536)")?
```

Prisma's client **cannot read or write** `Unsupported` columns. Every other
`Chunk` field is normal Prisma; the `embedding` column must be written with
**raw SQL** (`$executeRaw`) using a `'[0.1,0.2,...]'::vector` literal. This is
the only "tricky" line in the module.

> `vector(1536)` MUST equal `EmbeddingService.dimension` (1536). They match
> today. If you ever change the embedding model's output size, you change the
> Prisma column **and** re-run the pgvector index migration, or inserts fail.

---

## 2. Architecture / new files

```
src/
  embedding/                 # ✅ exists
    embedding.service.ts
  ingestion/                 # 🔨 new module
    ingestion.module.ts
    parser.service.ts        # bytes  -> text   (by mimeType)
    chunker.service.ts       # text   -> chunks
    ingestion.service.ts     # orchestrates the pipeline (state machine)
  jobs/                      # 🔨 new module
    job.module.ts
    job.service.ts           # enqueue / claim / complete / fail
    job.worker.ts            # @Interval poller -> dispatches by job.type
```

Why split `jobs` from `ingestion`? The job queue is **generic infrastructure**
(it will later run audit jobs, email jobs, re-index jobs). Ingestion is **one
job type** (`type = 'ingest'`) that the worker dispatches to. Keeping them
separate keeps the queue reusable.

### End-to-end data flow

```
POST /documents (existing)
   └─ create Document{status: UPLOADED}
   └─ JobService.enqueue('ingest', { documentId })   ◄── new wiring

JobWorker (@Interval, every N ms)
   └─ claim oldest PENDING job  (atomic, see §5)
   └─ status = RUNNING
   └─ dispatch by type → IngestionService.process(documentId)
         status PARSING   → ParserService.parse(doc)         → text
         status CHUNKING  → ChunkerService.split(text)        → chunks[]
         status EMBEDDING → EmbeddingService.embed(contents)  → vectors[][]
                            DELETE old chunks, raw-SQL INSERT new chunks+vectors
         status READY
   └─ on success: Job.status = DONE
   └─ on error:   Job.attempts++; retry or DONE→FAILED; Document.status = FAILED
```

---

## 3. Step-by-step build plan (with the "why")

### Phase 0 — Unblock & install ✅ (you're here)

Packages (TLS fix: `$env:NODE_OPTIONS="--use-system-ca"` first):

```
@google/genai     # embeddings (already imported by embedding.service.ts)
pdf-parse         # PDF -> text
mammoth           # .docx -> text
@nestjs/schedule  # @Interval poller for the worker
@types/pdf-parse  # (dev) types
```

Then `ScheduleModule.forRoot()` in `AppModule`, and `GEMINI_API_KEY` in `.env`.
Confirm with `npm run build`.

**Why:** nothing compiles until `@google/genai` is installed; the worker needs
`@nestjs/schedule`.

---

### Phase 1 — Database / pgvector

Prisma migrations can't express the `vector` extension or an HNSW index, so add
a **manual SQL migration**:

```sql
CREATE EXTENSION IF NOT EXISTS vector;

-- cosine distance index; speeds up "ORDER BY embedding <=> $1" at scale
CREATE INDEX IF NOT EXISTS chunk_embedding_hnsw
  ON "Chunk" USING hnsw (embedding vector_cosine_ops);
```

**Why HNSW:** without an index, similarity search is a full table scan (O(n)).
HNSW is an approximate-nearest-neighbor index that keeps queries fast as the
chunk count grows. Cosine ops because our vectors are L2-normalized.

**Verify by hand** before writing app code: insert a dummy vector and run
`SELECT ... ORDER BY embedding <=> '[...]'::vector LIMIT 3;`. If that returns
rows, pgvector is wired correctly.

---

### Phase 2 — Parser & Chunker (pure functions, no AI, easy to test)

**`ParserService.parse(document) → string`** — dispatch by `mimeType`:

| MIME | Handler |
|------|---------|
| `application/pdf` | `pdf-parse` |
| `...wordprocessingml.document` (.docx) | `mammoth` |
| `text/plain`, `text/markdown`, `text/csv`, `application/json` | read buffer as UTF-8 |
| `text/html` | UTF-8 then strip tags |
| `application/msword` (.doc, legacy binary) | not supported by mammoth — reject with a clear error or skip |

Read bytes via the existing `storage.createReadStream(doc.storageKey)`.

**Production practices:**
- Guard empty/garbage extractions: if text is empty/whitespace, fail the
  document with a clear `errorMessage` ("no extractable text") instead of
  storing zero chunks.
- Don't trust `mimeType` blindly for routing logic that could crash; wrap each
  parser in try/catch and surface the real reason.

**`ChunkerService.split(text) → Chunk[]`** — produce objects matching the schema:
`{ ordinal, content, tokenCount, pageNumber?, startOffset?, endOffset? }`.

- Target ~500 tokens per chunk, ~75-token overlap (≈15%).
- Token estimate without a tokenizer: `Math.ceil(content.length / 4)`.
- Split on paragraph/sentence boundaries so you don't cut mid-sentence; overlap
  so meaning isn't lost at boundaries.

**Why chunk at all:** embedding a whole document as one vector makes retrieval
useless (too coarse). Too-small chunks fragment context. ~500 tokens with
overlap is the standard sweet spot.

---

### Phase 3 — Job queue (`JobService`)

Methods over the existing `Job` table (`status` is a free-form `String`; we use
`PENDING | RUNNING | DONE | FAILED`):

```ts
enqueue(type: string, payload: object): Promise<Job>      // INSERT status=PENDING
claimNext(): Promise<Job | null>                          // atomic, see §5
markDone(id): Promise<void>
markFailed(id, error: string): Promise<void>              // attempts++, set errorMessage
```

**Why a DB table and not just a `setInterval` closure:** durability. If the
server restarts mid-ingest, the job is still `PENDING`/`RUNNING` in Postgres and
gets picked up again. In-memory work would vanish.

---

### Phase 4 — Worker (`JobWorker`)

A provider using `@Interval(INGEST_POLL_MS)` that:

1. `claimNext()` — atomically grab one `PENDING` job, set `RUNNING`.
2. `switch (job.type)` → `'ingest'` calls `IngestionService.process(payload.documentId)`.
3. On success → `markDone`. On throw → `markFailed` (retry until `attempts >= MAX`,
   then leave `FAILED`).

**Production practices (important):**

- **Atomic claim (no double-processing).** If two workers/instances poll at
  once, both could grab the same row. Use a single atomic statement so only one
  wins:

  ```sql
  UPDATE "Job"
     SET status = 'RUNNING', "updatedAt" = now()
   WHERE id = (
     SELECT id FROM "Job"
      WHERE status = 'PENDING'
      ORDER BY "createdAt"
      FOR UPDATE SKIP LOCKED      -- skip rows another worker already locked
      LIMIT 1
   )
  RETURNING *;
  ```

  Run via `$queryRaw`. `FOR UPDATE SKIP LOCKED` is the standard Postgres
  work-queue pattern — safe even with multiple app instances.

- **Retry cap + backoff.** Cap `attempts` (e.g. 3). Don't hammer a failing
  Gemini call instantly; a simple delay/backoff avoids burning quota.

- **Don't let one bad job kill the loop.** Wrap dispatch in try/catch; the
  worker must keep polling after a failure.

- **Stuck-job recovery (optional, recommended).** A job stuck in `RUNNING` after
  a crash will never retry. A sweep that resets `RUNNING` jobs older than X
  minutes back to `PENDING` handles this.

---

### Phase 5 — Orchestration (`IngestionService.process`)

The pipeline as an explicit state machine:

```ts
async process(documentId: string) {
  const doc = await this.prisma.document.findUniqueOrThrow({ where: { id: documentId } });
  try {
    await this.setStatus(doc.id, DocStatus.PARSING);
    const text = await this.parser.parse(doc);

    await this.setStatus(doc.id, DocStatus.CHUNKING);
    const chunks = this.chunker.split(text);

    await this.setStatus(doc.id, DocStatus.EMBEDDING);
    const vectors = await this.embedding.embed(chunks.map(c => c.content));

    await this.replaceChunks(doc.id, chunks, vectors);  // idempotent, raw SQL
    await this.setStatus(doc.id, DocStatus.READY);
  } catch (err) {
    await this.failDocument(doc.id, err);
    throw err;  // let the worker count the attempt
  }
}
```

**Idempotency (critical production practice).** A job may run more than once
(retry, manual reprocess, crash recovery). Always clear before insert so you
never get duplicate chunks:

```ts
private async replaceChunks(documentId, chunks, vectors) {
  await this.prisma.$transaction(async (tx) => {
    await tx.chunk.deleteMany({ where: { documentId } });
    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      const literal = `[${vectors[i].join(',')}]`;     // pgvector text format
      await tx.$executeRaw`
        INSERT INTO "Chunk"
          (id, "documentId", ordinal, content, "tokenCount",
           "pageNumber", "startOffset", "endOffset", embedding, "createdAt")
        VALUES (${createId()}, ${documentId}, ${c.ordinal}, ${c.content},
                ${c.tokenCount}, ${c.pageNumber ?? null}, ${c.startOffset ?? null},
                ${c.endOffset ?? null}, ${literal}::vector, now())`;
    }
  });
}
```

**Why a transaction:** delete + re-insert must be all-or-nothing, or a crash
mid-insert leaves the document half-indexed (worse than failed).

> Parameterize the vector as a string (`${literal}`) then cast `::vector`.
> Never string-concatenate the values array into the SQL — use Prisma's tagged
> template so it's bound, not interpolated (SQL-injection safe).

---

### Phase 6 — Wire the trigger + reprocess endpoint

- **Trigger:** in `DocumentService.create`, after the document row is created,
  call `jobs.enqueue('ingest', { documentId: doc.id })`. Inject `JobService`
  into `DocumentModule`.
- **Reprocess:** `POST /workspaces/:id/.../documents/:documentId/reprocess`
  (OWNER/ADMIN) → re-enqueue an `ingest` job. Needed when a doc `FAILED` (bad
  parse, Gemini outage) and you want a manual retry without re-uploading.

**Why enqueue (not call `process` directly):** keeps upload fast and gives the
work a durable, retryable record.

---

## 4. Production concerns checklist

| Concern | Practice |
|---------|----------|
| **Don't block HTTP** | Upload returns at `UPLOADED`; pipeline runs in the worker. |
| **Durability** | Work lives in the `Job` table; survives restarts. |
| **Idempotency** | `deleteMany` chunks before insert; safe to re-run. |
| **Atomic claim** | `FOR UPDATE SKIP LOCKED` so two workers never grab one job. |
| **Retries** | Cap `attempts` (≈3) + backoff; final failure → `Document.status=FAILED` + `errorMessage`. |
| **Crash recovery** | Reset stale `RUNNING` jobs to `PENDING` after a timeout. |
| **Partial failure** | One bad document fails only itself; worker keeps running. |
| **Cost / batching** | `EmbeddingService` already batches; embed once per chunk, never re-embed unchanged docs. |
| **Rate limits** | Handle Gemini 429s as retryable; backoff. |
| **Secrets** | `GEMINI_API_KEY` from env; never log it. Validate env at boot. |
| **Observability** | Log per stage: doc id, chunk count, embed latency, attempt #, failure reason. |
| **Security** | Bytes read only via `StorageService` (path-traversal guarded); raw SQL is parameterized. |
| **Tenant isolation** | Reprocess endpoint must go through `WorkspaceGuard` like every other doc route. |

---

## 5. Config (add to `.env`)

| Var | Default | Purpose |
|-----|---------|---------|
| `GEMINI_API_KEY` | — | Embedding provider key (service throws on boot if missing) |
| `EMBEDDING_MODEL` | `gemini-embedding-001` | Embedding model id |
| `EMBEDDING_DIM` | `1536` | MUST equal `vector(N)` in `chunk.prisma` |
| `EMBEDDING_BATCH_SIZE` | `100` | Texts per embed call |
| `INGEST_POLL_MS` | `2000` | Worker poll interval |
| `INGEST_MAX_ATTEMPTS` | `3` | Retry cap before `FAILED` |

---

## 6. Definition of Done

1. `npm run build` green (the reliable gate — Jest has a known Prisma-ESM issue).
2. pgvector extension + HNSW index present; a manual `<=>` query returns rows.
3. Upload a real PDF → within a few seconds it reaches `status = READY`.
4. `GET .../documents/:id` shows `_count.chunks > 0`; each `Chunk` has a non-null
   `embedding`.
5. A nearest-neighbor query for a phrase in the doc returns the relevant chunk first.
6. Upload a corrupt/empty file → it lands in `FAILED` with a clear `errorMessage`,
   and the worker keeps processing other jobs.

When a freshly uploaded document becomes searchable, Module 5 is done and
Module 6 (Chat/RAG) has everything it needs.
```

---

## 7. Build order summary

```
0. Install + build green            (unblock)
1. pgvector extension + HNSW index  (DB)
2. ParserService + ChunkerService   (no AI, unit-testable)
3. JobService                       (enqueue/claim/complete/fail)
4. JobWorker                        (@Interval, atomic claim, retries)
5. IngestionService.process         (state machine + idempotent raw-SQL insert)
6. Trigger on upload + reprocess endpoint
7. Verify against Definition of Done
```
