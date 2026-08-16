import './setup-e2e';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import request from 'supertest';
import { ChunkKind, DocStatus } from '../generated/prisma/client';
import { AppModule } from '../src/app.module';
import { MailService } from '../src/auth/services/mail.service';
import { LlmService, type LlmTurn } from '../src/chat/llm.service';
import { EmbeddingService } from '../src/embedding/embedding.service';
import { VisionService } from '../src/ingestion/vision.service';
import { PrismaService } from '../src/prisma/prisma.service';

const STORAGE_DIR = resolve(process.env.STORAGE_DIR ?? './storage-test');

const expectStatus = (res: request.Response, status: number) => {
  if (res.status !== status) {
    throw new Error(
      `Expected ${status} but got ${res.status}\nBody: ${JSON.stringify(res.body, null, 2)}`,
    );
  }
};

// A real 1x1 PNG — the vision model is faked, so only the bytes need to be valid.
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const DIM = 1536;
const unitVec = (seed: number): number[] => {
  const v = new Array<number>(DIM).fill(0);
  v[Math.abs(seed) % DIM] = 1;
  return v;
};
const fakeEmbedding = {
  dimension: DIM,
  embed: jest.fn(async (texts: string[]) =>
    texts.map((_, i) => unitVec(i + 1)),
  ),
  embedOne: jest.fn(async () => unitVec(1)),
};

const CHART_DESCRIPTION =
  'Bar chart of quarterly revenue. | Month | Revenue |\n| --- | --- |\n| Mar | 180 |';

// Stands in for Gemini vision: deterministic, no network, no cost.
const fakeVision = {
  maxOcrPages: 30,
  maxImages: 20,
  concurrency: 2,
  isEnabled: () => true,
  transcribePage: jest.fn(async () => 'Transcribed scanned page text.'),
  describeImage: jest.fn(async () => CHART_DESCRIPTION),
  mapLimited: async <T, R>(items: T[], fn: (i: T, n: number) => Promise<R>) =>
    Promise.all(items.map(fn)),
};

/** Captures what the chat service actually sends the model. */
const fakeLlm = {
  generate: jest.fn(
    async (_turns: LlmTurn[], _systemInstruction: string) =>
      'Revenue fell sharply in March [1].',
  ),
};

describe('Multimodal ingestion + chat (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let prisma: PrismaService;
  let mailSpy: jest.SpyInstance;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EmbeddingService)
      .useValue(fakeEmbedding)
      .overrideProvider(VisionService)
      .useValue(fakeVision)
      .overrideProvider(LlmService)
      .useValue(fakeLlm)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.setGlobalPrefix('api/v1');
    await app.init();
    http = request(app.getHttpServer());
    prisma = app.get(PrismaService);

    const mail = app.get(MailService);
    mailSpy = jest
      .spyOn(mail, 'sendWorkspaceInvite')
      .mockResolvedValue(undefined);
  });

  afterAll(async () => {
    mailSpy.mockRestore();
    await app.close();
    await rm(STORAGE_DIR, { recursive: true, force: true });
  });

  beforeEach(() => {
    fakeVision.describeImage.mockClear();
    fakeLlm.generate.mockClear();
  });

  // ── helpers ──────────────────────────────────────────────────────────────
  type Auth = { userId: string; email: string; accessToken: string };

  let userCounter = 0;
  const registerUser = async (): Promise<Auth> => {
    userCounter += 1;
    const res = await http.post('/api/v1/auth/register').send({
      email: `mm-user${userCounter}@test.dev`,
      password: 'password123',
      name: 'User',
    });
    expectStatus(res, 201);
    return {
      userId: res.body.user.id,
      email: res.body.user.email,
      accessToken: res.body.tokens.accessToken,
    };
  };

  const authHeader = (a: Auth) => ({
    Authorization: `Bearer ${a.accessToken}`,
  });

  let workspaceCounter = 0;
  const buildScenario = async () => {
    const owner = await registerUser();
    const stranger = await registerUser();
    workspaceCounter += 1;

    const wsRes = await http
      .post('/api/v1/workspaces')
      .set(authHeader(owner))
      .send({ name: `Multimodal ${workspaceCounter}` });
    expectStatus(wsRes, 201);
    const ws = wsRes.body as { id: string };

    const colRes = await http
      .post(`/api/v1/workspaces/${ws.id}/collections`)
      .set(authHeader(owner))
      .send({ name: 'Reports' });
    expectStatus(colRes, 201);

    return { owner, stranger, ws, collection: colRes.body as { id: string } };
  };

  const waitForStatus = async (
    documentId: string,
    statuses: DocStatus[],
    timeoutMs = 15000,
  ) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const doc = await prisma.document.findUnique({
        where: { id: documentId },
      });
      if (doc && statuses.includes(doc.status)) return doc;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(`Timed out waiting for ${documentId}`);
  };

  const uploadImage = async (
    auth: Auth,
    workspaceId: string,
    collectionId: string,
  ) => {
    const res = await http
      .post(
        `/api/v1/workspaces/${workspaceId}/collections/${collectionId}/documents`,
      )
      .set(authHeader(auth))
      .attach('file', PNG_1X1, {
        filename: 'revenue-chart.png',
        contentType: 'image/png',
      });
    expectStatus(res, 201);
    return res.body as { id: string };
  };

  // ── image documents ──────────────────────────────────────────────────────
  it('ingests an uploaded image into an IMAGE chunk described by the vision model', async () => {
    const { owner, ws, collection } = await buildScenario();

    const doc = await uploadImage(owner, ws.id, collection.id);
    await waitForStatus(doc.id, [DocStatus.READY, DocStatus.FAILED]);

    const document = await prisma.document.findUniqueOrThrow({
      where: { id: doc.id },
    });
    expect(document.status).toBe(DocStatus.READY);
    expect(fakeVision.describeImage).toHaveBeenCalled();

    const chunks = await prisma.chunk.findMany({
      where: { documentId: doc.id },
    });
    expect(chunks).toHaveLength(1);
    expect(chunks[0].kind).toBe(ChunkKind.IMAGE);
    expect(chunks[0].content).toContain('quarterly revenue');
    // A standalone upload points back at the original file, not a second copy.
    expect(chunks[0].imageKey).toBe(document.storageKey);
  });

  it('serves the source image for an IMAGE chunk, and hides it from other tenants', async () => {
    const { owner, stranger, ws, collection } = await buildScenario();

    const doc = await uploadImage(owner, ws.id, collection.id);
    await waitForStatus(doc.id, [DocStatus.READY, DocStatus.FAILED]);

    const chunk = await prisma.chunk.findFirstOrThrow({
      where: { documentId: doc.id },
    });

    const ok = await http
      .get(`/api/v1/workspaces/${ws.id}/chunks/${chunk.id}/image`)
      .set(authHeader(owner));
    expectStatus(ok, 200);
    expect(ok.headers['content-type']).toContain('image/png');
    expect(Buffer.from(ok.body as Buffer).length).toBeGreaterThan(0);

    // Someone outside the workspace must not be able to read it.
    const denied = await http
      .get(`/api/v1/workspaces/${ws.id}/chunks/${chunk.id}/image`)
      .set(authHeader(stranger));
    expect([403, 404]).toContain(denied.status);
  });

  it('404s for a chunk that has no source image', async () => {
    const { owner, ws, collection } = await buildScenario();

    const upload = await http
      .post(
        `/api/v1/workspaces/${ws.id}/collections/${collection.id}/documents`,
      )
      .set(authHeader(owner))
      .attach('file', Buffer.from('Plain text with no images whatsoever.'), {
        filename: 'notes.txt',
        contentType: 'text/plain',
      });
    expectStatus(upload, 201);
    await waitForStatus(upload.body.id, [DocStatus.READY, DocStatus.FAILED]);

    const chunk = await prisma.chunk.findFirstOrThrow({
      where: { documentId: upload.body.id },
    });
    expect(chunk.kind).toBe(ChunkKind.TEXT);
    expect(chunk.imageKey).toBeNull();

    const res = await http
      .get(`/api/v1/workspaces/${ws.id}/chunks/${chunk.id}/image`)
      .set(authHeader(owner));
    expectStatus(res, 404);
  });

  // ── images attached to a question ────────────────────────────────────────
  it('passes an attached image through to the model without storing it', async () => {
    const { owner, ws } = await buildScenario();

    const convRes = await http
      .post(`/api/v1/workspaces/${ws.id}/conversations`)
      .set(authHeader(owner))
      .send({ title: 'Screenshot compare' });
    expectStatus(convRes, 201);

    const ask = await http
      .post(
        `/api/v1/workspaces/${ws.id}/conversations/${convRes.body.id}/messages`,
      )
      .set(authHeader(owner))
      .send({
        content: 'Compare this screenshot with our plan.',
        images: [{ mimeType: 'image/png', data: PNG_1X1.toString('base64') }],
      });
    expectStatus(ask, 201);

    // The image reached the model on the final (current) user turn.
    const turns = fakeLlm.generate.mock.calls.at(-1)?.[0] ?? [];
    const finalTurn = turns.at(-1);
    expect(finalTurn?.role).toBe('user');
    expect(finalTurn?.images).toHaveLength(1);
    expect(finalTurn?.images?.[0].mimeType).toBe('image/png');

    // Attached images are a one-turn input: nothing is embedded or persisted.
    const messages = await prisma.message.findMany({
      where: { conversationId: convRes.body.id },
    });
    const userMessage = messages.find((m) => m.role === 'USER');
    expect(userMessage?.content).toContain('[1 image(s) attached]');
    expect(
      await prisma.chunk.count({ where: { document: { workspaceId: ws.id } } }),
    ).toBe(0);
  });

  it('rejects an unsupported attachment type', async () => {
    const { owner, ws } = await buildScenario();

    const convRes = await http
      .post(`/api/v1/workspaces/${ws.id}/conversations`)
      .set(authHeader(owner))
      .send({ title: 'Bad attachment' });
    expectStatus(convRes, 201);

    const res = await http
      .post(
        `/api/v1/workspaces/${ws.id}/conversations/${convRes.body.id}/messages`,
      )
      .set(authHeader(owner))
      .send({
        content: 'What is this?',
        images: [{ mimeType: 'application/pdf', data: 'aGVsbG8=' }],
      });
    expectStatus(res, 400);
  });
});
