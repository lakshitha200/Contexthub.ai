import './setup-e2e';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { MailService } from '../src/auth/services/mail.service';

// Storage tests exercise the real filesystem via StorageService — uploads land in
// process.env.STORAGE_DIR (./storage-test, set in .env.test). We wipe that dir in
// afterAll so each `npm run test:e2e` starts clean.
const STORAGE_DIR = resolve(process.env.STORAGE_DIR ?? './storage-test');

const expectStatus = (res: request.Response, status: number) => {
  if (res.status !== status) {
    throw new Error(
      `Expected ${status} but got ${res.status}\nBody: ${JSON.stringify(res.body, null, 2)}`,
    );
  }
};

describe('Document (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let mailSpy: jest.SpyInstance;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.setGlobalPrefix('api/v1');
    await app.init();
    http = request(app.getHttpServer());

    const mail = app.get(MailService);
    mailSpy = jest.spyOn(mail, 'sendWorkspaceInvite').mockResolvedValue(undefined);
  });

  afterAll(async () => {
    mailSpy.mockRestore();
    await app.close();
    await rm(STORAGE_DIR, { recursive: true, force: true });
  });

  // ---------- helpers ----------
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

  // Unique names per call so slug uniqueness never collides between scenarios.
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

  // supertest multipart helper — attaches a fake file with the given mime.
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

  // ---------- POST upload ----------
  describe('POST .../documents (upload)', () => {
    it('happy: member can upload, file is stored, document row created', async () => {
      const { member, ws, collection } = await buildScenario();
      const res = await uploadFile(
        member,
        ws.id,
        collection.id,
        Buffer.from('hello world'),
        'hello.txt',
        'text/plain',
      );
      expectStatus(res, 201);
      expect(res.body.filename).toBe('hello.txt');
      expect(res.body.mimeType).toBe('text/plain');
      expect(res.body.status).toBe('UPLOADED');
      expect(res.body.storageKey).toEqual(expect.any(String));
      expect(res.body.uploaderId).toBe(member.userId);
    });

    it('bad: rejects unsupported mime type', async () => {
      const { owner, ws, collection } = await buildScenario();
      const res = await uploadFile(
        owner,
        ws.id,
        collection.id,
        Buffer.from('binary'),
        'evil.exe',
        'application/x-msdownload',
      );
      expectStatus(res, 400);
    });

    it('bad: 404 when collection belongs to a different workspace', async () => {
      const { owner, ws } = await buildScenario();
      const otherOwner = await registerUser('other@test.dev');
      const otherWs = await createWorkspace(otherOwner);
      const otherCol = await createCollection(otherOwner, otherWs.id);

      const res = await uploadFile(
        owner,
        ws.id,
        otherCol.id,
        Buffer.from('x'),
        'a.txt',
        'text/plain',
      );
      expectStatus(res, 404);
    });

    it('security: non-member cannot upload', async () => {
      const { stranger, ws, collection } = await buildScenario();
      const res = await uploadFile(
        stranger,
        ws.id,
        collection.id,
        Buffer.from('x'),
        'a.txt',
        'text/plain',
      );
      expectStatus(res, 403);
    });
  });

  // ---------- GET list ----------
  describe('GET .../documents', () => {
    it('happy: lists documents in the collection', async () => {
      const { owner, ws, collection } = await buildScenario();
      await uploadFile(owner, ws.id, collection.id, Buffer.from('a'), 'a.txt', 'text/plain');
      await uploadFile(owner, ws.id, collection.id, Buffer.from('b'), 'b.txt', 'text/plain');

      const res = await http
        .get(`/api/v1/workspaces/${ws.id}/collections/${collection.id}/documents`)
        .set(authHeader(owner));
      expectStatus(res, 200);
      expect(res.body).toHaveLength(2);
    });

    it('security: non-member cannot list', async () => {
      const { stranger, ws, collection } = await buildScenario();
      const res = await http
        .get(`/api/v1/workspaces/${ws.id}/collections/${collection.id}/documents`)
        .set(authHeader(stranger));
      expectStatus(res, 403);
    });
  });

  // ---------- GET by id ----------
  describe('GET .../documents/:documentId', () => {
    it('happy: returns the document to a member', async () => {
      const { owner, ws, collection } = await buildScenario();
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
        .get(`/api/v1/workspaces/${ws.id}/collections/${collection.id}/documents/${upload.body.id}`)
        .set(authHeader(owner));
      expectStatus(res, 200);
      expect(res.body.id).toBe(upload.body.id);
    });

    it('bad: 404 when document is in a different workspace', async () => {
      const { owner, ws, collection } = await buildScenario();
      const otherOwner = await registerUser('other@test.dev');
      const otherWs = await createWorkspace(otherOwner);
      const otherCol = await createCollection(otherOwner, otherWs.id);
      const otherDoc = await uploadFile(
        otherOwner,
        otherWs.id,
        otherCol.id,
        Buffer.from('x'),
        'x.txt',
        'text/plain',
      );
      expectStatus(otherDoc, 201);

      const res = await http
        .get(`/api/v1/workspaces/${ws.id}/collections/${collection.id}/documents/${otherDoc.body.id}`)
        .set(authHeader(owner));
      expectStatus(res, 404);
    });
  });

  // ---------- GET download ----------
  describe('GET .../documents/:documentId/download', () => {
    it('happy: returns the original file bytes (storage round-trip)', async () => {
      const { owner, ws, collection } = await buildScenario();
      const body = Buffer.from('round-trip-content');
      const upload = await uploadFile(
        owner,
        ws.id,
        collection.id,
        body,
        'rt.txt',
        'text/plain',
      );
      expectStatus(upload, 201);

      const res = await http
        .get(
          `/api/v1/workspaces/${ws.id}/collections/${collection.id}/documents/${upload.body.id}/download`,
        )
        .set(authHeader(owner))
        .buffer(true)
        .parse((response, cb) => {
          const chunks: Buffer[] = [];
          response.on('data', (c) => chunks.push(c as Buffer));
          response.on('end', () => cb(null, Buffer.concat(chunks)));
        });
      expectStatus(res, 200);
      expect((res.body as Buffer).toString()).toBe('round-trip-content');
      expect(res.headers['content-disposition']).toContain('rt.txt');
    });

    it('security: non-member cannot download', async () => {
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
        .get(
          `/api/v1/workspaces/${ws.id}/collections/${collection.id}/documents/${upload.body.id}/download`,
        )
        .set(authHeader(stranger));
      expectStatus(res, 403);
    });
  });

  // ---------- DELETE ----------
  describe('DELETE .../documents/:documentId', () => {
    it('happy: OWNER can delete; the file is gone from storage', async () => {
      const { owner, ws, collection } = await buildScenario();
      const upload = await uploadFile(
        owner,
        ws.id,
        collection.id,
        Buffer.from('bye'),
        'bye.txt',
        'text/plain',
      );
      expectStatus(upload, 201);

      const del = await http
        .delete(
          `/api/v1/workspaces/${ws.id}/collections/${collection.id}/documents/${upload.body.id}`,
        )
        .set(authHeader(owner));
      expectStatus(del, 200);
      expect(del.body.success).toBe(true);

      // Download must now fail — the row is gone, so the guard returns 404 via service lookup.
      const download = await http
        .get(
          `/api/v1/workspaces/${ws.id}/collections/${collection.id}/documents/${upload.body.id}/download`,
        )
        .set(authHeader(owner));
      expectStatus(download, 404);
    });

    it('security: MEMBER cannot delete (OWNER/ADMIN only)', async () => {
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

      const del = await http
        .delete(
          `/api/v1/workspaces/${ws.id}/collections/${collection.id}/documents/${upload.body.id}`,
        )
        .set(authHeader(member));
      expectStatus(del, 403);
    });
  });
});
