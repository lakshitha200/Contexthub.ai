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

describe('Workspace (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let mailSpy: jest.SpyInstance;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.setGlobalPrefix('api/v1');
    await app.init();
    http = request(app.getHttpServer());

    // Spy on MailService.sendWorkspaceInvite so we can recover the raw invite
    // token (the service hashes it before storing in the DB, so we can't read
    // it back from there).
    const mail = app.get(MailService);
    mailSpy = jest.spyOn(mail, 'sendWorkspaceInvite').mockResolvedValue(undefined);
  });

  afterAll(async () => {
    mailSpy.mockRestore();
    await app.close();
  });

  beforeEach(() => {
    mailSpy.mockClear();
  });

  // ---------- helpers ----------
  type Auth = { userId: string; email: string; accessToken: string };

  const registerUser = async (email: string, name = 'User'): Promise<Auth> => {
    const res = await http
      .post('/api/v1/auth/register')
      .send({ email, password: 'password123', name });
    expectStatus(res, 201);
    return {
      userId: res.body.user.id,
      email: res.body.user.email,
      accessToken: res.body.tokens.accessToken,
    };
  };

  const authHeader = (a: Auth) => ({ Authorization: `Bearer ${a.accessToken}` });

  const createWorkspace = async (
    owner: Auth,
    name = 'Acme',
    description?: string,
  ) => {
    const res = await http
      .post('/api/v1/workspaces')
      .set(authHeader(owner))
      .send({ name, description });
    expectStatus(res, 201);
    return res.body as { id: string; name: string; slug: string };
  };

  // Sends an invite and returns the raw token captured by the MailService spy.
  const sendInvite = async (
    inviter: Auth,
    workspaceId: string,
    inviteeEmail: string,
    role: 'ADMIN' | 'MEMBER' = 'MEMBER',
  ): Promise<string> => {
    mailSpy.mockClear();
    const res = await http
      .post(`/api/v1/workspaces/${workspaceId}/invite`)
      .set(authHeader(inviter))
      .send({ email: inviteeEmail, role });
    expectStatus(res, 200);
    const call = mailSpy.mock.calls.at(-1);
    if (!call) throw new Error('MailService.sendWorkspaceInvite was not called');
    return call[2] as string; // (email, workspaceName, rawToken)
  };

  // ---------- POST /workspaces ----------
  describe('POST /api/v1/workspaces', () => {
    it('happy: creates a workspace with the user as OWNER', async () => {
      const owner = await registerUser('owner@test.dev');
      const res = await http
        .post('/api/v1/workspaces')
        .set(authHeader(owner))
        .send({ name: 'Acme', description: 'My workspace' });
      expectStatus(res, 201);
      expect(res.body.name).toBe('Acme');
      expect(res.body.slug).toBe('acme');
      expect(res.body.members[0].role).toBe('OWNER');
    });

    it('bad: rejects too-short name', async () => {
      const owner = await registerUser('owner@test.dev');
      const res = await http
        .post('/api/v1/workspaces')
        .set(authHeader(owner))
        .send({ name: 'A' });
      expectStatus(res, 400);
    });

    it('security: rejects unauthenticated requests', async () => {
      const res = await http.post('/api/v1/workspaces').send({ name: 'Acme' });
      expectStatus(res, 401);
    });
  });

  // ---------- GET /workspaces ----------
  describe('GET /api/v1/workspaces', () => {
    it('happy: returns only the workspaces I am a member of', async () => {
      const alice = await registerUser('alice@test.dev');
      const bob = await registerUser('bob@test.dev');
      await createWorkspace(alice, 'Alice WS');
      await createWorkspace(bob, 'Bob WS');

      const res = await http.get('/api/v1/workspaces').set(authHeader(alice));
      expectStatus(res, 200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe('Alice WS');
      expect(res.body[0].role).toBe('OWNER');
    });

    it('security: rejects unauthenticated requests', async () => {
      const res = await http.get('/api/v1/workspaces');
      expectStatus(res, 401);
    });
  });

  // ---------- GET /workspaces/:id ----------
  describe('GET /api/v1/workspaces/:id', () => {
    it('happy: returns the workspace to a member', async () => {
      const owner = await registerUser('owner@test.dev');
      const ws = await createWorkspace(owner);
      const res = await http.get(`/api/v1/workspaces/${ws.id}`).set(authHeader(owner));
      expectStatus(res, 200);
      expect(res.body.id).toBe(ws.id);
    });

    it('security: rejects non-members', async () => {
      const owner = await registerUser('owner@test.dev');
      const stranger = await registerUser('stranger@test.dev');
      const ws = await createWorkspace(owner);
      const res = await http.get(`/api/v1/workspaces/${ws.id}`).set(authHeader(stranger));
      expectStatus(res, 403);
    });

    it('security: rejects unauthenticated requests', async () => {
      const owner = await registerUser('owner@test.dev');
      const ws = await createWorkspace(owner);
      const res = await http.get(`/api/v1/workspaces/${ws.id}`);
      expectStatus(res, 401);
    });
  });

  // ---------- PATCH /workspaces/:id ----------
  describe('PATCH /api/v1/workspaces/:id', () => {
    it('happy: owner can update name and description', async () => {
      const owner = await registerUser('owner@test.dev');
      const ws = await createWorkspace(owner);
      const res = await http
        .patch(`/api/v1/workspaces/${ws.id}`)
        .set(authHeader(owner))
        .send({ name: 'New Name', description: 'New Desc' });
      expectStatus(res, 200);
      expect(res.body.name).toBe('New Name');
      expect(res.body.description).toBe('New Desc');
    });

    it('security: non-owner admin cannot update', async () => {
      const owner = await registerUser('owner@test.dev');
      const admin = await registerUser('admin@test.dev');
      const ws = await createWorkspace(owner);
      const token = await sendInvite(owner, ws.id, admin.email, 'ADMIN');
      const accept = await http
        .post('/api/v1/workspaces/invites/accept')
        .set(authHeader(admin))
        .send({ token });
      expectStatus(accept, 200);

      const res = await http
        .patch(`/api/v1/workspaces/${ws.id}`)
        .set(authHeader(admin))
        .send({ name: 'Hijacked' });
      expectStatus(res, 403);
    });
  });

  // ---------- DELETE /workspaces/:id ----------
  describe('DELETE /api/v1/workspaces/:id', () => {
    it('happy: owner can delete', async () => {
      const owner = await registerUser('owner@test.dev');
      const ws = await createWorkspace(owner);
      const res = await http.delete(`/api/v1/workspaces/${ws.id}`).set(authHeader(owner));
      expectStatus(res, 200);
      expect(res.body.success).toBe(true);
    });

    it('security: non-member cannot delete', async () => {
      const owner = await registerUser('owner@test.dev');
      const stranger = await registerUser('stranger@test.dev');
      const ws = await createWorkspace(owner);
      const res = await http
        .delete(`/api/v1/workspaces/${ws.id}`)
        .set(authHeader(stranger));
      expectStatus(res, 403);
    });
  });

  // ---------- GET /workspaces/:id/members ----------
  describe('GET /api/v1/workspaces/:id/members', () => {
    it('happy: lists members for a member', async () => {
      const owner = await registerUser('owner@test.dev');
      const ws = await createWorkspace(owner);
      const res = await http
        .get(`/api/v1/workspaces/${ws.id}/members`)
        .set(authHeader(owner));
      expectStatus(res, 200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].role).toBe('OWNER');
      expect(res.body[0].user.email).toBe(owner.email);
    });

    it('security: rejects non-members', async () => {
      const owner = await registerUser('owner@test.dev');
      const stranger = await registerUser('stranger@test.dev');
      const ws = await createWorkspace(owner);
      const res = await http
        .get(`/api/v1/workspaces/${ws.id}/members`)
        .set(authHeader(stranger));
      expectStatus(res, 403);
    });
  });

  // ---------- POST /workspaces/:id/invite ----------
  describe('POST /api/v1/workspaces/:id/invite', () => {
    it('happy: owner can invite, mail service receives the raw token', async () => {
      const owner = await registerUser('owner@test.dev');
      const ws = await createWorkspace(owner);
      mailSpy.mockClear();
      const res = await http
        .post(`/api/v1/workspaces/${ws.id}/invite`)
        .set(authHeader(owner))
        .send({ email: 'newbie@test.dev', role: 'MEMBER' });
      expectStatus(res, 200);
      expect(mailSpy).toHaveBeenCalledTimes(1);
      expect(mailSpy.mock.calls[0][0]).toBe('newbie@test.dev');
    });

    it('bad: rejects invite for an existing member', async () => {
      const owner = await registerUser('owner@test.dev');
      const ws = await createWorkspace(owner);
      const res = await http
        .post(`/api/v1/workspaces/${ws.id}/invite`)
        .set(authHeader(owner))
        .send({ email: owner.email, role: 'MEMBER' });
      expectStatus(res, 409);
    });

    it('security: a MEMBER cannot invite', async () => {
      const owner = await registerUser('owner@test.dev');
      const member = await registerUser('member@test.dev');
      const ws = await createWorkspace(owner);
      const token = await sendInvite(owner, ws.id, member.email, 'MEMBER');
      const accept = await http
        .post('/api/v1/workspaces/invites/accept')
        .set(authHeader(member))
        .send({ token });
      expectStatus(accept, 200);

      const res = await http
        .post(`/api/v1/workspaces/${ws.id}/invite`)
        .set(authHeader(member))
        .send({ email: 'someone@test.dev', role: 'MEMBER' });
      expectStatus(res, 403);
    });
  });

  // ---------- POST /workspaces/invites/accept ----------
  describe('POST /api/v1/workspaces/invites/accept', () => {
    it('happy: invitee accepts and becomes a member', async () => {
      const owner = await registerUser('owner@test.dev');
      const invitee = await registerUser('invitee@test.dev');
      const ws = await createWorkspace(owner);
      const token = await sendInvite(owner, ws.id, invitee.email, 'MEMBER');

      const res = await http
        .post('/api/v1/workspaces/invites/accept')
        .set(authHeader(invitee))
        .send({ token });
      expectStatus(res, 200);
      expect(res.body.role).toBe('MEMBER');
      expect(res.body.workspaceId).toBe(ws.id);
    });

    it('bad: rejects an invalid token', async () => {
      const user = await registerUser('user@test.dev');
      const res = await http
        .post('/api/v1/workspaces/invites/accept')
        .set(authHeader(user))
        .send({ token: 'totally-fake-token' });
      expectStatus(res, 400);
    });

    it('security: rejects when the logged-in email differs from the invite email', async () => {
      const owner = await registerUser('owner@test.dev');
      const intended = await registerUser('intended@test.dev');
      const attacker = await registerUser('attacker@test.dev');
      const ws = await createWorkspace(owner);
      const token = await sendInvite(owner, ws.id, intended.email, 'MEMBER');

      const res = await http
        .post('/api/v1/workspaces/invites/accept')
        .set(authHeader(attacker))
        .send({ token });
      expectStatus(res, 403);
    });
  });

  // ---------- PATCH /workspaces/:id/members/:userId ----------
  describe('PATCH /api/v1/workspaces/:id/members/:userId', () => {
    it('happy: owner can change a member role', async () => {
      const owner = await registerUser('owner@test.dev');
      const member = await registerUser('member@test.dev');
      const ws = await createWorkspace(owner);
      const token = await sendInvite(owner, ws.id, member.email, 'MEMBER');
      await http
        .post('/api/v1/workspaces/invites/accept')
        .set(authHeader(member))
        .send({ token })
        .expect(200);

      const res = await http
        .patch(`/api/v1/workspaces/${ws.id}/members/${member.userId}`)
        .set(authHeader(owner))
        .send({ role: 'ADMIN' });
      expectStatus(res, 200);
      expect(res.body.role).toBe('ADMIN');
    });

    it('bad: cannot demote the last owner', async () => {
      const owner = await registerUser('owner@test.dev');
      const ws = await createWorkspace(owner);
      const res = await http
        .patch(`/api/v1/workspaces/${ws.id}/members/${owner.userId}`)
        .set(authHeader(owner))
        .send({ role: 'ADMIN' });
      expectStatus(res, 400);
    });

    it('security: non-owner cannot change roles', async () => {
      const owner = await registerUser('owner@test.dev');
      const member = await registerUser('member@test.dev');
      const ws = await createWorkspace(owner);
      const token = await sendInvite(owner, ws.id, member.email, 'MEMBER');
      await http
        .post('/api/v1/workspaces/invites/accept')
        .set(authHeader(member))
        .send({ token })
        .expect(200);

      const res = await http
        .patch(`/api/v1/workspaces/${ws.id}/members/${owner.userId}`)
        .set(authHeader(member))
        .send({ role: 'MEMBER' });
      expectStatus(res, 403);
    });
  });

  // ---------- DELETE /workspaces/:id/members/:userId ----------
  describe('DELETE /api/v1/workspaces/:id/members/:userId', () => {
    it('happy: owner can remove a member', async () => {
      const owner = await registerUser('owner@test.dev');
      const member = await registerUser('member@test.dev');
      const ws = await createWorkspace(owner);
      const token = await sendInvite(owner, ws.id, member.email, 'MEMBER');
      await http
        .post('/api/v1/workspaces/invites/accept')
        .set(authHeader(member))
        .send({ token })
        .expect(200);

      const res = await http
        .delete(`/api/v1/workspaces/${ws.id}/members/${member.userId}`)
        .set(authHeader(owner));
      expectStatus(res, 200);
      expect(res.body.success).toBe(true);
    });

    it('bad: cannot remove yourself via this endpoint (use /leave)', async () => {
      const owner = await registerUser('owner@test.dev');
      const ws = await createWorkspace(owner);
      const res = await http
        .delete(`/api/v1/workspaces/${ws.id}/members/${owner.userId}`)
        .set(authHeader(owner));
      expectStatus(res, 400);
    });

    it('security: MEMBER cannot remove another member', async () => {
      const owner = await registerUser('owner@test.dev');
      const memberA = await registerUser('a@test.dev');
      const memberB = await registerUser('b@test.dev');
      const ws = await createWorkspace(owner);

      const tokenA = await sendInvite(owner, ws.id, memberA.email, 'MEMBER');
      await http
        .post('/api/v1/workspaces/invites/accept')
        .set(authHeader(memberA))
        .send({ token: tokenA })
        .expect(200);

      const tokenB = await sendInvite(owner, ws.id, memberB.email, 'MEMBER');
      await http
        .post('/api/v1/workspaces/invites/accept')
        .set(authHeader(memberB))
        .send({ token: tokenB })
        .expect(200);

      const res = await http
        .delete(`/api/v1/workspaces/${ws.id}/members/${memberB.userId}`)
        .set(authHeader(memberA));
      expectStatus(res, 403);
    });
  });

  // ---------- POST /workspaces/:id/leave ----------
  describe('POST /api/v1/workspaces/:id/leave', () => {
    it('happy: a non-owner member can leave', async () => {
      const owner = await registerUser('owner@test.dev');
      const member = await registerUser('member@test.dev');
      const ws = await createWorkspace(owner);
      const token = await sendInvite(owner, ws.id, member.email, 'MEMBER');
      await http
        .post('/api/v1/workspaces/invites/accept')
        .set(authHeader(member))
        .send({ token })
        .expect(200);

      const res = await http
        .post(`/api/v1/workspaces/${ws.id}/leave`)
        .set(authHeader(member));
      expectStatus(res, 200);
      expect(res.body.success).toBe(true);
    });

    it('bad: last owner cannot leave', async () => {
      const owner = await registerUser('owner@test.dev');
      const ws = await createWorkspace(owner);
      const res = await http
        .post(`/api/v1/workspaces/${ws.id}/leave`)
        .set(authHeader(owner));
      expectStatus(res, 400);
    });

    it('security: non-member cannot leave', async () => {
      const owner = await registerUser('owner@test.dev');
      const stranger = await registerUser('stranger@test.dev');
      const ws = await createWorkspace(owner);
      const res = await http
        .post(`/api/v1/workspaces/${ws.id}/leave`)
        .set(authHeader(stranger));
      expectStatus(res, 403);
    });
  });
});
