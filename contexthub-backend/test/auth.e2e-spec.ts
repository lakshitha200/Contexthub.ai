import './setup-e2e';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

// Surfaces the response body when the status doesn't match — supertest's
// built-in .expect(status) only shows "expected X, got Y" with no body.
const expectStatus = (res: request.Response, status: number) => {
  if (res.status !== status) {
    throw new Error(
      `Expected ${status} but got ${res.status}\nBody: ${JSON.stringify(res.body, null, 2)}`,
    );
  }
};

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;

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
  });

  afterAll(async () => {
    await app.close();
  });

  const validUser = {
    email: 'alice@test.dev',
    password: 'password123',
    name: 'Alice',
  };

  const registerAndGetTokens = async () => {
    const res = await http.post('/api/v1/auth/register').send(validUser);
    expectStatus(res, 201);
    return res.body.tokens as { accessToken: string; refreshToken: string };
  };

  //---------Register-----------------
  describe('POST /api/v1/auth/register', () => {
    // happy
    it('happy: registers a new user and returns tokens', async () => {
      const res = await http.post('/api/v1/auth/register').send(validUser);
      expectStatus(res, 201);
      expect(res.body.user.email).toBe(validUser.email);
      expect(res.body.user.passwordHash).toBeUndefined();
      expect(res.body.tokens.accessToken).toEqual(expect.any(String));
      expect(res.body.tokens.refreshToken).toEqual(expect.any(String));
    });

    // bad
    it('bad: rejects weak password (no number)', async () => {
      const res = await http
        .post('/api/v1/auth/register')
        .send({ ...validUser, password: 'onlyletters' });
      expectStatus(res, 400);
    });

    it('bad: rejects invalid email format', async () => {
      const res = await http
        .post('/api/v1/auth/register')
        .send({ ...validUser, email: 'not-an-email' });
      expectStatus(res, 400);
    });

    it('bad: rejects duplicate email', async () => {
      const first = await http.post('/api/v1/auth/register').send(validUser);
      expectStatus(first, 201);
      const dup = await http.post('/api/v1/auth/register').send(validUser);
      expectStatus(dup, 409);
    });

    // security: endpoint is public — no auth-bypass surface
  });

  //---------Login-----------------
  describe('POST /api/v1/auth/login', () => {
    beforeEach(async () => {
      const res = await http.post('/api/v1/auth/register').send(validUser);
      expectStatus(res, 201);
    });

    // happy
    it('happy: logs in with correct credentials', async () => {
      const res = await http
        .post('/api/v1/auth/login')
        .send({ email: validUser.email, password: validUser.password });
      expectStatus(res, 200);
      expect(res.body.tokens.accessToken).toEqual(expect.any(String));
      expect(res.body.tokens.refreshToken).toEqual(expect.any(String));
    });

    // bad
    it('bad: rejects malformed email', async () => {
      const res = await http
        .post('/api/v1/auth/login')
        .send({ email: 'not-an-email', password: validUser.password });
      expectStatus(res, 400);
    });

    // security
    it('security: rejects wrong password', async () => {
      const res = await http
        .post('/api/v1/auth/login')
        .send({ email: validUser.email, password: 'wrong-password-1' });
      expectStatus(res, 401);
    });

    it('security: rejects unknown email', async () => {
      const res = await http
        .post('/api/v1/auth/login')
        .send({ email: 'nobody@test.dev', password: validUser.password });
      expectStatus(res, 401);
    });
  });

  //---------Me-----------------
  describe('GET /api/v1/auth/me', () => {
    // happy
    it('happy: returns the current user with a valid access token', async () => {
      const { accessToken } = await registerAndGetTokens();
      const res = await http
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`);
      expectStatus(res, 200);
      expect(res.body.email).toBe(validUser.email);
    });

    // security
    it('security: rejects requests without a token', async () => {
      const res = await http.get('/api/v1/auth/me');
      expectStatus(res, 401);
    });

    it('security: rejects a garbage token', async () => {
      const res = await http
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer not-a-real-jwt');
      expectStatus(res, 401);
    });
  });

  //---------Update profile-----------------
  describe('PATCH /api/v1/auth/me', () => {
    // happy
    it('happy: updates name and avatarUrl', async () => {
      const { accessToken } = await registerAndGetTokens();
      const res = await http
        .patch('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Alice Updated', avatarUrl: 'https://cdn.test.dev/a.png' });
      expectStatus(res, 200);
      expect(res.body.name).toBe('Alice Updated');
      expect(res.body.avatarUrl).toBe('https://cdn.test.dev/a.png');
    });

    // bad
    it('bad: rejects invalid avatarUrl', async () => {
      const { accessToken } = await registerAndGetTokens();
      const res = await http
        .patch('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ avatarUrl: 'not-a-url' });
      expectStatus(res, 400);
    });

    // security
    it('security: rejects unauthenticated requests', async () => {
      const res = await http.patch('/api/v1/auth/me').send({ name: 'X' });
      expectStatus(res, 401);
    });
  });

  //---------Change password-----------------
  describe('POST /api/v1/auth/change-password', () => {
    // happy
    it('happy: changes the password with correct current password', async () => {
      const { accessToken } = await registerAndGetTokens();

      const change = await http
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ currentPassword: validUser.password, newPassword: 'newPass456' });
      expectStatus(change, 200);

      const oldLogin = await http
        .post('/api/v1/auth/login')
        .send({ email: validUser.email, password: validUser.password });
      expectStatus(oldLogin, 401);

      const newLogin = await http
        .post('/api/v1/auth/login')
        .send({ email: validUser.email, password: 'newPass456' });
      expectStatus(newLogin, 200);
    });

    // bad
    it('bad: rejects weak new password', async () => {
      const { accessToken } = await registerAndGetTokens();
      const res = await http
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ currentPassword: validUser.password, newPassword: 'short' });
      expectStatus(res, 400);
    });

    // security
    it('security: rejects wrong current password', async () => {
      const { accessToken } = await registerAndGetTokens();
      const res = await http
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ currentPassword: 'wrong-pass-1', newPassword: 'newPass456' });
      expectStatus(res, 401);
    });

    it('security: rejects unauthenticated requests', async () => {
      const res = await http
        .post('/api/v1/auth/change-password')
        .send({ currentPassword: validUser.password, newPassword: 'newPass456' });
      expectStatus(res, 401);
    });
  });

  //---------Refresh-----------------
  describe('POST /api/v1/auth/refresh', () => {
    // happy
    it('happy: issues new tokens with a valid refresh token', async () => {
      const { refreshToken } = await registerAndGetTokens();
      const res = await http.post('/api/v1/auth/refresh').send({ refreshToken });
      expectStatus(res, 200);
      expect(res.body.accessToken).toEqual(expect.any(String));
      expect(res.body.refreshToken).toEqual(expect.any(String));
      expect(res.body.refreshToken).not.toBe(refreshToken);
    });

    // bad
    it('bad: rejects refresh without a token', async () => {
      const res = await http.post('/api/v1/auth/refresh').send({});
      expectStatus(res, 401);
    });

    // security
    it('security: rejects a garbage refresh token', async () => {
      const res = await http
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'not-a-real-jwt' });
      expectStatus(res, 401);
    });

    it('security: rejects a refresh token that was already rotated', async () => {
      const { refreshToken } = await registerAndGetTokens();
      const first = await http.post('/api/v1/auth/refresh').send({ refreshToken });
      expectStatus(first, 200);

      // The old token must no longer work.
      const reuse = await http.post('/api/v1/auth/refresh').send({ refreshToken });
      expectStatus(reuse, 401);
    });
  });

  //---------Logout-----------------
  describe('POST /api/v1/auth/logout', () => {
    // happy
    it('happy: revokes the refresh token', async () => {
      const { accessToken, refreshToken } = await registerAndGetTokens();

      const res = await http
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ refreshToken });
      expectStatus(res, 200);
      expect(res.body.success).toBe(true);

      // The revoked refresh token must no longer work.
      const refresh = await http.post('/api/v1/auth/refresh').send({ refreshToken });
      expectStatus(refresh, 401);
    });

    // security
    it('security: rejects unauthenticated logout', async () => {
      const res = await http.post('/api/v1/auth/logout').send({ refreshToken: 'x' });
      expectStatus(res, 401);
    });
  });

  //---------Magic link request-----------------
  describe('POST /api/v1/auth/magic-link/request', () => {
    // happy
    it('happy: accepts a magic link request for a new email', async () => {
      const res = await http
        .post('/api/v1/auth/magic-link/request')
        .send({ email: 'new.user@test.dev', name: 'New User' });
      expectStatus(res, 200);
      expect(res.body.success).toBe(true);
    });

    it('happy: accepts a magic link request for an existing user', async () => {
      await registerAndGetTokens();
      const res = await http
        .post('/api/v1/auth/magic-link/request')
        .send({ email: validUser.email });
      expectStatus(res, 200);
      expect(res.body.success).toBe(true);
    });

    // bad
    it('bad: rejects a bad email', async () => {
      const res = await http
        .post('/api/v1/auth/magic-link/request')
        .send({ email: 'not-an-email' });
      expectStatus(res, 400);
    });

    // security: endpoint is public — no auth-bypass surface
  });

  //---------Magic link verify-----------------
  describe('GET /api/v1/auth/magic-link/verify', () => {
    // security
    it('security: rejects an invalid token', async () => {
      const res = await http
        .get('/api/v1/auth/magic-link/verify')
        .query({ token: 'totally-fake-token' });
      expectStatus(res, 401);
    });

    // happy + DB-dependent paths (expired/consumed) need DB access to
    // retrieve the raw token before it's hashed — add when we add a
    // VerificationToken test helper.
  });
});
