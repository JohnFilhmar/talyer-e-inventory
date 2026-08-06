import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import * as dbHandler from './setup/dbHandler.js';
import authRoutes from '../src/routes/authRoutes.js';
import User from '../src/models/User.js';
import { requireCsrfToken, issueCsrfToken, ensureCsrfToken } from '../src/middleware/csrf.js';

// Mirrors server.js: cookieParser is scoped to the auth router, not global.
const app = express();
app.use(express.json());
app.use('/api/auth', cookieParser());
app.use('/api/auth', authRoutes);

beforeAll(async () => {
  await dbHandler.connect();
});

afterEach(async () => {
  await dbHandler.clearDatabase();
});

afterAll(async () => {
  await dbHandler.closeDatabase();
});

/**
 * Pulls a cookie's value out of a supertest response's Set-Cookie header.
 * supertest keeps no cookie jar, so every test that needs a session drives the
 * cookies by hand — which is what makes the CSRF behaviour observable at all.
 *
 * Takes the **last** matching header, not the first. A response can legitimately
 * set the same cookie twice — `ensureCsrfToken` issues one for a request that
 * arrived without it, then the handler rotates it — and per RFC 6265 a browser
 * applies them in order, so the last is the value the client ends up holding.
 * Reading the first would assert against a value no client ever sees.
 */
const readCookie = (res, name) => {
  const jar = res.headers['set-cookie'] ?? [];
  const matches = jar.filter((c) => c.startsWith(`${name}=`));
  if (matches.length === 0) return undefined;
  const value = matches[matches.length - 1].split(';')[0].slice(name.length + 1);
  return value === '' ? undefined : value;
};

const registerUser = async () =>
  request(app).post('/api/auth/register').send({
    name: 'CSRF User',
    email: 'csrf@example.com',
    password: 'password123',
  });

describe('CSRF protection on /api/auth/refresh-token', () => {
  describe('token issuance', () => {
    it('issues a readable XSRF-TOKEN cookie alongside the refresh cookie', async () => {
      const res = await registerUser();

      expect(res.status).toBe(201);
      expect(readCookie(res, 'refreshToken')).toBeDefined();
      expect(readCookie(res, 'XSRF-TOKEN')).toBeDefined();
    });

    it('does not mark the CSRF cookie httpOnly, since the SPA must read it', async () => {
      const res = await registerUser();

      const entry = (res.headers['set-cookie'] ?? []).find((c) =>
        c.startsWith('XSRF-TOKEN=')
      );

      expect(entry).toBeDefined();
      expect(entry.toLowerCase()).not.toContain('httponly');
    });

    it('keeps the refresh cookie httpOnly', async () => {
      const res = await registerUser();

      const entry = (res.headers['set-cookie'] ?? []).find((c) =>
        c.startsWith('refreshToken=')
      );

      expect(entry.toLowerCase()).toContain('httponly');
    });

    it('issues a different token on each login, so it is not a fixed value', async () => {
      await registerUser();

      const first = await request(app)
        .post('/api/auth/login')
        .send({ email: 'csrf@example.com', password: 'password123' });
      const second = await request(app)
        .post('/api/auth/login')
        .send({ email: 'csrf@example.com', password: 'password123' });

      expect(readCookie(first, 'XSRF-TOKEN')).not.toBe(readCookie(second, 'XSRF-TOKEN'));
    });
  });

  describe('enforcement', () => {
    let refreshCookie;
    let csrfCookie;

    beforeEach(async () => {
      const res = await registerUser();
      refreshCookie = `refreshToken=${readCookie(res, 'refreshToken')}`;
      csrfCookie = readCookie(res, 'XSRF-TOKEN');
    });

    it('accepts a request whose header echoes the cookie', async () => {
      const res = await request(app)
        .post('/api/auth/refresh-token')
        .set('Cookie', [refreshCookie, `XSRF-TOKEN=${csrfCookie}`])
        .set('X-XSRF-TOKEN', csrfCookie);

      expect(res.status).toBe(200);
      expect(res.body.data.accessToken).toBeDefined();
    });

    it('rejects a request that sends no CSRF header — the forged-post case', async () => {
      const res = await request(app)
        .post('/api/auth/refresh-token')
        .set('Cookie', [refreshCookie, `XSRF-TOKEN=${csrfCookie}`]);

      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/csrf/i);
    });

    it('rejects a header that does not match the cookie', async () => {
      const res = await request(app)
        .post('/api/auth/refresh-token')
        .set('Cookie', [refreshCookie, `XSRF-TOKEN=${csrfCookie}`])
        .set('X-XSRF-TOKEN', 'a'.repeat(64));

      expect(res.status).toBe(403);
    });

    it('rejects a header of a different length without throwing', async () => {
      // timingSafeEqual throws on a length mismatch; the guard must compare
      // lengths first rather than let that surface as a 500.
      const res = await request(app)
        .post('/api/auth/refresh-token')
        .set('Cookie', [refreshCookie, `XSRF-TOKEN=${csrfCookie}`])
        .set('X-XSRF-TOKEN', 'short');

      expect(res.status).toBe(403);
    });

    it('rotates the token on a successful refresh', async () => {
      const res = await request(app)
        .post('/api/auth/refresh-token')
        .set('Cookie', [refreshCookie, `XSRF-TOKEN=${csrfCookie}`])
        .set('X-XSRF-TOKEN', csrfCookie);

      expect(res.status).toBe(200);
      const rotated = readCookie(res, 'XSRF-TOKEN');
      expect(rotated).toBeDefined();
      expect(rotated).not.toBe(csrfCookie);
    });

    it('clears both cookies on logout', async () => {
      const login = await request(app)
        .post('/api/auth/login')
        .send({ email: 'csrf@example.com', password: 'password123' });

      const res = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${login.body.data.accessToken}`);

      expect(res.status).toBe(200);
      const jar = res.headers['set-cookie'] ?? [];
      expect(jar.some((c) => c.startsWith('XSRF-TOKEN=;'))).toBe(true);
      expect(jar.some((c) => c.startsWith('refreshToken=;'))).toBe(true);
    });
  });

  describe('migration allowance', () => {
    it('lets a session that predates CSRF protection through, so a deploy does not sign everyone out', async () => {
      const res = await registerUser();
      const refreshCookie = `refreshToken=${readCookie(res, 'refreshToken')}`;

      // A pre-CSRF session: refresh cookie present, no CSRF cookie at all.
      const refreshed = await request(app)
        .post('/api/auth/refresh-token')
        .set('Cookie', [refreshCookie]);

      expect(refreshed.status).toBe(200);
    });

    it('closes the window by issuing a token on that first refresh', async () => {
      const res = await registerUser();
      const refreshCookie = `refreshToken=${readCookie(res, 'refreshToken')}`;

      const refreshed = await request(app)
        .post('/api/auth/refresh-token')
        .set('Cookie', [refreshCookie]);

      // From here on the session has a cookie, so the guard applies to it.
      const issued = readCookie(refreshed, 'XSRF-TOKEN');
      expect(issued).toBeDefined();

      const forged = await request(app)
        .post('/api/auth/refresh-token')
        .set('Cookie', [refreshCookie, `XSRF-TOKEN=${issued}`]);

      expect(forged.status).toBe(403);
    });

    it('still rejects a bad header even on a legacy session, once a cookie exists', async () => {
      const res = await registerUser();
      const refreshCookie = `refreshToken=${readCookie(res, 'refreshToken')}`;
      const csrfCookie = readCookie(res, 'XSRF-TOKEN');

      const mismatched = await request(app)
        .post('/api/auth/refresh-token')
        .set('Cookie', [refreshCookie, `XSRF-TOKEN=${csrfCookie}`])
        .set('X-XSRF-TOKEN', 'b'.repeat(64));

      expect(mismatched.status).toBe(403);
    });
  });

  describe('requireCsrfToken unit behaviour', () => {
    const runGuard = (cookies, header) => {
      const req = {
        cookies,
        get: (name) => (name.toLowerCase() === 'x-xsrf-token' ? header : undefined),
      };
      let status;
      const res = {
        status(code) {
          status = code;
          return this;
        },
        json() {
          return this;
        },
      };
      let nexted = false;
      requireCsrfToken(req, res, () => {
        nexted = true;
      });
      return { status, nexted };
    };

    it('passes when no cookie is present', () => {
      expect(runGuard({}, undefined).nexted).toBe(true);
    });

    it('passes when req.cookies is undefined entirely', () => {
      // cookieParser is scoped to /api/auth; a handler reached without it must
      // not throw on the optional chain.
      expect(runGuard(undefined, undefined).nexted).toBe(true);
    });

    it('blocks when the cookie is present and the header is not', () => {
      const result = runGuard({ 'XSRF-TOKEN': 'abc' }, undefined);
      expect(result.nexted).toBe(false);
      expect(result.status).toBe(403);
    });

    it('passes on an exact match', () => {
      expect(runGuard({ 'XSRF-TOKEN': 'abc' }, 'abc').nexted).toBe(true);
    });
  });

  describe('ensureCsrfToken', () => {
    it('issues a token when none is present', () => {
      const set = [];
      const res = { cookie: (name, value) => set.push([name, value]) };
      let nexted = false;
      ensureCsrfToken({ cookies: {} }, res, () => { nexted = true; });

      expect(nexted).toBe(true);
      expect(set).toHaveLength(1);
      expect(set[0][0]).toBe('XSRF-TOKEN');
      expect(set[0][1]).toMatch(/^[0-9a-f]{64}$/);
    });

    it('leaves an existing token alone — rotating it would race an in-flight request', () => {
      const set = [];
      const res = { cookie: (name, value) => set.push([name, value]) };
      ensureCsrfToken({ cookies: { 'XSRF-TOKEN': 'existing' } }, res, () => {});

      expect(set).toHaveLength(0);
    });

    it('does not throw when cookieParser has not run', () => {
      const res = { cookie: () => {} };
      let nexted = false;
      expect(() => ensureCsrfToken({}, res, () => { nexted = true; })).not.toThrow();
      expect(nexted).toBe(true);
    });
  });

  describe('issueCsrfToken', () => {
    it('returns a 64-character hex token', () => {
      const res = { cookie: () => {} };
      const token = issueCsrfToken(res);
      expect(token).toMatch(/^[0-9a-f]{64}$/);
    });

    it('does not repeat', () => {
      const res = { cookie: () => {} };
      expect(issueCsrfToken(res)).not.toBe(issueCsrfToken(res));
    });
  });
});

describe('Bearer-authenticated routes are unaffected', () => {
  it('does not require a CSRF token on /me', async () => {
    const register = await registerUser();
    const token = register.body.data.accessToken;

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });

  it('leaves login unguarded — it has no cookie to ride', async () => {
    await registerUser();

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'csrf@example.com', password: 'password123' });

    expect(res.status).toBe(200);
  });
});

describe('User model sanity for these tests', () => {
  it('stores the refresh token so refresh can validate it', async () => {
    await registerUser();
    const user = await User.findOne({ email: 'csrf@example.com' }).select('+refreshToken');
    expect(user.refreshToken).toBeDefined();
  });
});
