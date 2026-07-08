import './setup-e2e';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { MailService } from '../src/auth/services/mail.service';

const expectStatus = (res: request.Response, status: number) => {
  if (res.status !== status) {
    throw new Error(
      `Expected ${status} but got ${res.status}\nBody: ${JSON.stringify(res.body, null, 2)}`,
    );
  }
};

describe('Collection (e2e)', () => {
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

  // Owner + 1 member + 1 stranger for security checks.
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

    return { owner, member, stranger, ws };
  };

  const createCollection = async (auth: Auth, workspaceId: string, name = 'Docs') => {
    const res = await http
      .post(`/api/v1/workspaces/${workspaceId}/collections`)
      .set(authHeader(auth))
      .send({ name });
    expectStatus(res, 201);
    return res.body as { id: string; name: string };
  };

  // ---------- POST /workspaces/:id/collections ----------
  describe('POST /api/v1/workspaces/:id/collections', () => {
    it('happy: any member can create a collection', async () => {
      const { member, ws } = await buildScenario();
      const res = await http
        .post(`/api/v1/workspaces/${ws.id}/collections`)
        .set(authHeader(member))
        .send({ name: 'Engineering' });
      expectStatus(res, 201);
      expect(res.body.name).toBe('Engineering');
      expect(res.body.workspaceId).toBe(ws.id);
    });

    it('bad: rejects too-short name', async () => {
      const { owner, ws } = await buildScenario();
      const res = await http
        .post(`/api/v1/workspaces/${ws.id}/collections`)
        .set(authHeader(owner))
        .send({ name: 'A' });
      expectStatus(res, 400);
    });

    it('security: non-member cannot create', async () => {
      const { stranger, ws } = await buildScenario();
      const res = await http
        .post(`/api/v1/workspaces/${ws.id}/collections`)
        .set(authHeader(stranger))
        .send({ name: 'Engineering' });
      expectStatus(res, 403);
    });
  });

  // ---------- GET /workspaces/:id/collections ----------
  describe('GET /api/v1/workspaces/:id/collections', () => {
    it('happy: returns collections in the workspace', async () => {
      const { owner, ws } = await buildScenario();
      await createCollection(owner, ws.id, 'Alpha');
      await createCollection(owner, ws.id, 'Beta');

      const res = await http
        .get(`/api/v1/workspaces/${ws.id}/collections`)
        .set(authHeader(owner));
      expectStatus(res, 200);
      expect(res.body).toHaveLength(2);
    });

    it('security: non-member cannot list', async () => {
      const { stranger, ws } = await buildScenario();
      const res = await http
        .get(`/api/v1/workspaces/${ws.id}/collections`)
        .set(authHeader(stranger));
      expectStatus(res, 403);
    });
  });

  // ---------- GET /workspaces/:id/collections/:cid ----------
  describe('GET /api/v1/workspaces/:id/collections/:collectionId', () => {
    it('happy: returns the collection to a member', async () => {
      const { owner, ws } = await buildScenario();
      const col = await createCollection(owner, ws.id);
      const res = await http
        .get(`/api/v1/workspaces/${ws.id}/collections/${col.id}`)
        .set(authHeader(owner));
      expectStatus(res, 200);
      expect(res.body.id).toBe(col.id);
    });

    it('bad: 404 when collection is in a different workspace', async () => {
      const { owner, ws } = await buildScenario();
      const otherOwner = await registerUser('other@test.dev');
      const otherWs = await createWorkspace(otherOwner);
      const otherCol = await createCollection(otherOwner, otherWs.id);

      const res = await http
        .get(`/api/v1/workspaces/${ws.id}/collections/${otherCol.id}`)
        .set(authHeader(owner));
      expectStatus(res, 404);
    });

    it('security: non-member cannot read', async () => {
      const { owner, stranger, ws } = await buildScenario();
      const col = await createCollection(owner, ws.id);
      const res = await http
        .get(`/api/v1/workspaces/${ws.id}/collections/${col.id}`)
        .set(authHeader(stranger));
      expectStatus(res, 403);
    });
  });

  // ---------- PATCH /workspaces/:id/collections/:cid ----------
  describe('PATCH /api/v1/workspaces/:id/collections/:collectionId', () => {
    it('happy: OWNER can rename', async () => {
      const { owner, ws } = await buildScenario();
      const col = await createCollection(owner, ws.id);
      const res = await http
        .patch(`/api/v1/workspaces/${ws.id}/collections/${col.id}`)
        .set(authHeader(owner))
        .send({ name: 'Renamed' });
      expectStatus(res, 200);
      expect(res.body.name).toBe('Renamed');
    });

    it('security: MEMBER cannot rename (OWNER/ADMIN only)', async () => {
      const { owner, member, ws } = await buildScenario();
      const col = await createCollection(owner, ws.id);
      const res = await http
        .patch(`/api/v1/workspaces/${ws.id}/collections/${col.id}`)
        .set(authHeader(member))
        .send({ name: 'Hijacked' });
      expectStatus(res, 403);
    });
  });

  // ---------- DELETE /workspaces/:id/collections/:cid ----------
  describe('DELETE /api/v1/workspaces/:id/collections/:collectionId', () => {
    it('happy: OWNER can delete', async () => {
      const { owner, ws } = await buildScenario();
      const col = await createCollection(owner, ws.id);
      const res = await http
        .delete(`/api/v1/workspaces/${ws.id}/collections/${col.id}`)
        .set(authHeader(owner));
      expectStatus(res, 200);
      expect(res.body.success).toBe(true);
    });

    it('security: MEMBER cannot delete', async () => {
      const { owner, member, ws } = await buildScenario();
      const col = await createCollection(owner, ws.id);
      const res = await http
        .delete(`/api/v1/workspaces/${ws.id}/collections/${col.id}`)
        .set(authHeader(member));
      expectStatus(res, 403);
    });
  });
});
