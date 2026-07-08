import './setup-e2e';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import request from 'supertest';
import { DocStatus } from '../generated/prisma/client';
import { AppModule } from '../src/app.module';
import { MailService } from '../src/auth/services/mail.service';
import { EmbeddingService } from '../src/embedding/embedding.service';
import { PrismaService } from '../src/prisma/prisma.service';

// Same storage dir convention as document.e2e-spec.ts.
const STORAGE_DIR = resolve(process.env.STORAGE_DIR ?? './storage-test');

const expectStatus = (res: request.Response, status: number) => {
  if (res.status !== status) {
    throw new Error(
      `Expected ${status} but got ${res.status}\nBody: ${JSON.stringify(res.body, null, 2)}`,
    );
  }
};

// ── Fake embedding provider ────────────────────────────────────────────────
// The real EmbeddingService calls Google Gemini (needs a key, costs money, is
// non-deterministic). We replace it so the pipeline is exercised end-to-end
// with deterministic 1536-d unit vectors. `embedImpl` is swappable per test so
// we can simulate provider failures.
const DIM = 1536;
const unitVec = (seed: number): number[] => {
  const v = new Array<number>(DIM).fill(0);
  v[Math.abs(seed) % DIM] = 1;
  return v;
};
const successImpl = async (texts: string[]): Promise<number[][]> =>
  texts.map((_, i) => unitVec(i + 1));

let embedImpl = successImpl;
const fakeEmbedding = {
  dimension: DIM,
  embed: jest.fn((texts: string[]) => embedImpl(texts)),
  embedOne: jest.fn(async () => unitVec(1)),
};

describe('Job + Ingestion Pipeline (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let prisma: PrismaService;
  let mailSpy: jest.SpyInstance;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      // Replace the Gemini-backed service with the deterministic fake.
      .overrideProvider(EmbeddingService)
      .useValue(fakeEmbedding)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.setGlobalPrefix('api/v1');
    await app.init();
    http = request(app.getHttpServer());
    prisma = app.get(PrismaService);

    const mail = app.get(MailService);
    mailSpy = jest.spyOn(mail, 'sendWorkspaceInvite').mockResolvedValue(undefined);
  });

  afterAll(async () => {
    mailSpy.mockRestore();
    await app.close();
    await rm(STORAGE_DIR, { recursive: true, force: true });
  });

  beforeEach(() => {
    embedImpl = successImpl;
    fakeEmbedding.embed.mockClear();
  });

  // ── helpers ────────────────────────────────────────────────────────────
  type Auth = { userId: string; email: string; accessToken: string };

  const registerUser = async (email: string): Promise<Auth> => {
    const res = await http
      .post('/api/v1/auth/register')
      .send({ email, password: 'password123', name: 'User' });
    expectStatus(res, 201);
    return {
      userId: res.body.user.id,
      email: res.body.user.email,
      accessToken: res.body.tokens.accessToken,
    };
  };

  const authHeader = (a: Auth) => ({ Authorization: `Bearer ${a.accessToken}` });

  let workspaceCounter = 0;
  const createWorkspace = async (owner: Auth) => {
    workspaceCounter += 1;
    const res = await http
      .post('/api/v1/workspaces')
      .set(authHeader(owner))
      .send({ name: `Acme ${workspaceCounter}` });
    expectStatus(res, 201);
    return res.body as { id: string };
  };

  const createCollection = async (auth: Auth, workspaceId: string) => {
    const res = await http
      .post(`/api/v1/workspaces/${workspaceId}/collections`)
      .set(authHeader(auth))
      .send({ name: 'Docs' });
    expectStatus(res, 201);
    return res.body as { id: string };
  };

  const buildScenario = async () => {
    const owner = await registerUser('owner@test.dev');
    const member = await registerUser('member@test.dev');
    const stranger = await registerUser('stranger@test.dev');
    const ws = await createWorkspace(owner);

    mailSpy.mockClear();
    const invite = await http
      .post(`/api/v1/workspaces/${ws.id}/invite`)
      .set(authHeader(owner))
      .send({ email: member.email, role: 'MEMBER' });
    expectStatus(invite, 200);
    const rawToken = mailSpy.mock.calls.at(-1)?.[2] as string;
    const accept = await http
      .post('/api/v1/workspaces/invites/accept')
      .set(authHeader(member))
      .send({ token: rawToken });
    expectStatus(accept, 200);

    const collection = await createCollection(owner, ws.id);
    return { owner, member, stranger, ws, collection };
  };

  const uploadFile = (
    auth: Auth,
    workspaceId: string,
    collectionId: string,
    body: Buffer,
    filename: string,
    mimeType: string,
  ) =>
    http
      .post(`/api/v1/workspaces/${workspaceId}/collections/${collectionId}/documents`)
      .set(authHeader(auth))
      .attach('file', body, { filename, contentType: mimeType });

  // Poll the DB until the document reaches one of the given statuses.
  const waitForStatus = async (
    documentId: string,
    statuses: DocStatus[],
    timeoutMs = 15000,
  ) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const doc = await prisma.document.findUnique({ where: { id: documentId } });
      if (doc && statuses.includes(doc.status)) return doc;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(`Timed out waiting for ${documentId} to reach ${statuses.join('/')}`);
  };

  const countChunks = (documentId: string) =>
    prisma.chunk.count({ where: { documentId } });

  // Embeddings live in an Unsupported(vector) column — count via raw SQL.
  const countChunksWithEmbedding = async (documentId: string) => {
    const rows = await prisma.$queryRaw<{ count: number }[]>`
      SELECT count(*)::int AS count
      FROM "Chunk"
      WHERE "documentId" = ${documentId} AND embedding IS NOT NULL`;
    return rows[0]?.count ?? 0;
  };

  // ── happy path ───────────────────────────────────────────────────────────
  it('upload enqueues a job; document is processed to READY with embedded chunks', async () => {
    const { member, ws, collection } = await buildScenario();

    const upload = await uploadFile(
      member,
      ws.id,
      collection.id,
      Buffer.from('Refunds are available within 30 days of purchase.'),
      'policy.txt',
      'text/plain',
    );
    expectStatus(upload, 201);
    expect(upload.body.status).toBe('UPLOADED'); // not processed yet at response time

    const doc = await waitForStatus(upload.body.id, [
      DocStatus.READY,
      DocStatus.FAILED,
    ]);
    expect(doc.status).toBe(DocStatus.READY);

    const total = await countChunks(upload.body.id);
    const withEmbedding = await countChunksWithEmbedding(upload.body.id);
    expect(total).toBeGreaterThan(0);
    expect(withEmbedding).toBe(total); // every chunk got a vector

    // The embedding provider was actually called.
    expect(fakeEmbedding.embed).toHaveBeenCalledTimes(1);

    // The job is marked DONE.
    const jobs = await prisma.job.findMany({ where: { type: 'ingest' } });
    expect(jobs).toHaveLength(1);
    expect(jobs[0].status).toBe('DONE');
  }, 20000);

  it('splits a large document into multiple chunks, one vector each', async () => {
    const { owner, ws, collection } = await buildScenario();

    // ~6k chars of paragraphs -> several ~2k-char chunks.
    const paragraph =
      'This is a sentence about the refund and returns policy of the company. '.repeat(
        20,
      );
    const big = Array.from({ length: 4 }, () => paragraph).join('\n\n');

    const upload = await uploadFile(
      owner,
      ws.id,
      collection.id,
      Buffer.from(big),
      'handbook.txt',
      'text/plain',
    );
    expectStatus(upload, 201);

    const doc = await waitForStatus(upload.body.id, [
      DocStatus.READY,
      DocStatus.FAILED,
    ]);
    expect(doc.status).toBe(DocStatus.READY);

    const total = await countChunks(upload.body.id);
    expect(total).toBeGreaterThan(1);
    // embed() was called with exactly `total` texts.
    expect(fakeEmbedding.embed).toHaveBeenCalledTimes(1);
    expect(fakeEmbedding.embed.mock.calls[0][0]).toHaveLength(total);
  }, 20000);

  // ── failure + retry ────────────────────────────────────────────────────
  it('marks the document FAILED with an errorMessage when embedding keeps failing', async () => {
    const { owner, ws, collection } = await buildScenario();
    embedImpl = async () => {
      throw new Error('provider exploded');
    };

    const upload = await uploadFile(
      owner,
      ws.id,
      collection.id,
      Buffer.from('some content that will fail to embed'),
      'fail.txt',
      'text/plain',
    );
    expectStatus(upload, 201);

    const doc = await waitForStatus(upload.body.id, [DocStatus.FAILED]);
    expect(doc.status).toBe(DocStatus.FAILED);
    expect(doc.errorMessage).toContain('provider exploded');

    // No chunks should have been persisted on failure.
    expect(await countChunks(upload.body.id)).toBe(0);

    // The job exhausted its retries and is FAILED.
    const job = await prisma.job.findFirst({ where: { type: 'ingest' } });
    expect(job?.status).toBe('FAILED');
    expect(job?.attempts).toBeGreaterThanOrEqual(3);
  }, 30000);

  it('recovers to READY if a transient embedding error clears on retry', async () => {
    const { owner, ws, collection } = await buildScenario();
    let calls = 0;
    embedImpl = async (texts) => {
      calls += 1;
      if (calls === 1) throw new Error('transient blip');
      return successImpl(texts);
    };

    const upload = await uploadFile(
      owner,
      ws.id,
      collection.id,
      Buffer.from('content that succeeds on the second try'),
      'retry.txt',
      'text/plain',
    );
    expectStatus(upload, 201);

    const doc = await waitForStatus(upload.body.id, [
      DocStatus.READY,
      DocStatus.FAILED,
    ]);
    expect(doc.status).toBe(DocStatus.READY);
    expect(await countChunks(upload.body.id)).toBeGreaterThan(0);
  }, 30000);

  // ── reprocess (idempotency) ──────────────────────────────────────────────
  it('reprocess re-runs ingestion without duplicating chunks', async () => {
    const { owner, ws, collection } = await buildScenario();
    const upload = await uploadFile(
      owner,
      ws.id,
      collection.id,
      Buffer.from('Reprocessing should replace, not duplicate, the chunks.'),
      'idem.txt',
      'text/plain',
    );
    expectStatus(upload, 201);
    await waitForStatus(upload.body.id, [DocStatus.READY]);
    const firstCount = await countChunks(upload.body.id);
    expect(firstCount).toBeGreaterThan(0);

    const reprocess = await http
      .post(
        `/api/v1/workspaces/${ws.id}/collections/${collection.id}/documents/${upload.body.id}/reprocess`,
      )
      .set(authHeader(owner));
    expectStatus(reprocess, 201);

    // Wait until the document cycles back to READY, then assert no duplication.
    await waitForStatus(upload.body.id, [DocStatus.READY]);
    // Allow the worker a beat to finish the replace transaction.
    await new Promise((r) => setTimeout(r, 300));
    const secondCount = await countChunks(upload.body.id);
    expect(secondCount).toBe(firstCount);
  }, 30000);

  // ── authorization on reprocess ───────────────────────────────────────────
  it('security: MEMBER cannot reprocess (OWNER/ADMIN only)', async () => {
    const { owner, member, ws, collection } = await buildScenario();
    const upload = await uploadFile(
      owner,
      ws.id,
      collection.id,
      Buffer.from('x'),
      'x.txt',
      'text/plain',
    );
    expectStatus(upload, 201);

    const res = await http
      .post(
        `/api/v1/workspaces/${ws.id}/collections/${collection.id}/documents/${upload.body.id}/reprocess`,
      )
      .set(authHeader(member));
    expectStatus(res, 403);
  }, 20000);

  it('security: non-member cannot reprocess', async () => {
    const { owner, stranger, ws, collection } = await buildScenario();
    const upload = await uploadFile(
      owner,
      ws.id,
      collection.id,
      Buffer.from('x'),
      'x.txt',
      'text/plain',
    );
    expectStatus(upload, 201);

    const res = await http
      .post(
        `/api/v1/workspaces/${ws.id}/collections/${collection.id}/documents/${upload.body.id}/reprocess`,
      )
      .set(authHeader(stranger));
    expectStatus(res, 403);
  }, 20000);
});
